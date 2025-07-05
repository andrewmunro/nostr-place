import { Pixel } from '@zappy-place/nostr-client';
import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, WORLD_SIZE } from './constants';
import { nostrService } from './nostr';
import { calculateCostBreakdown, getPixelPrice } from './pricing';

export interface CameraState {
	x: number;
	y: number;
	scale: number;
	targetX: number;
	targetY: number;
	targetScale: number;
}

export interface PointerState {
	isDragging: boolean;
	lastPos: { x: number; y: number };
	// Mouse-specific cursor tracking
	mouseCursorPixel: { x: number; y: number } | null;
}

export interface TouchState {
	holdTimer: NodeJS.Timeout | null;
	touchStartPos: { x: number; y: number } | null;
	// Pinch gesture tracking
	isPinching: boolean;
	pinchStartDistance: number;
	pinchStartScale: number;
	pinchCenter: { x: number; y: number } | null;
	activeTouches: Map<number, { x: number; y: number }>;
	// Track if touch controls have been used
	hasTouchBeenUsed: boolean;
}

export interface PixelAction {
	x: number;
	y: number;
	color: string;
	previousColor: string;
	timestamp: number;
}

export interface PreviewPixel {
	x: number;
	y: number;
	color: string;
	isNew: boolean;
	existingPixelAge?: number; // Age in hours if overwriting
	cost: number; // Cost in msats
}

export interface CostBreakdown {
	newPixels: number;
	freshPixels: number;
	recentPixels: number;
	olderPixels: number;
	ancientPixels: number;
	totalCost: number;
}

export interface PreviewState {
	isActive: boolean;
	pixels: Map<string, PreviewPixel>; // Key: "x,y"
	costBreakdown: CostBreakdown;
	isDragging: boolean;
	dragOffset: { x: number; y: number };
	dragStartPos: { x: number; y: number } | null;
	showCostMode: boolean; // Toggle for showing borders and age indicators
}

class State {
	// Global state
	selectedColor: string = '#A06A42'; // Brown color that was selected in the original palette
	pixels = new Map(); // Will be populated by Nostr events

	// Undo history
	undoHistory: PixelAction[] = [];
	maxUndoHistory = 50;

	// PIXI.js objects
	app!: PIXI.Application;
	viewport!: PIXI.Container;
	pixelContainer!: PIXI.Container;
	gridContainer!: PIXI.Container;
	cursorContainer!: PIXI.Container;

	// Color palette scroll state
	paletteScrollOffset = 0;

	// Texture-based rendering for performance
	pixelTexture!: PIXI.Texture;
	pixelSprite!: PIXI.Sprite;
	pixelCanvas!: HTMLCanvasElement;
	pixelContext!: CanvasRenderingContext2D;

	// Change tracking for efficient pixel updates
	modifiedPixels = new Set<string>(); // Track which pixels have changed

	// Camera state
	camera: CameraState = {
		x: WORLD_SIZE / 2,
		y: WORLD_SIZE / 2,
		scale: DEFAULT_SCALE,
		targetX: WORLD_SIZE / 2,
		targetY: WORLD_SIZE / 2,
		targetScale: DEFAULT_SCALE
	};

	// Pointer interaction state
	pointerState: PointerState = {
		isDragging: false,
		lastPos: { x: 0, y: 0 },
		mouseCursorPixel: null
	};

	// Touch interaction state
	touchState: TouchState = {
		holdTimer: null,
		touchStartPos: null,
		isPinching: false,
		pinchStartDistance: 0,
		pinchStartScale: 1,
		pinchCenter: null,
		activeTouches: new Map(),
		hasTouchBeenUsed: false
	};

	// Preview mode state
	previewState: PreviewState = {
		isActive: false,
		pixels: new Map(),
		costBreakdown: {
			newPixels: 0,
			freshPixels: 0,
			recentPixels: 0,
			olderPixels: 0,
			ancientPixels: 0,
			totalCost: 0
		},
		isDragging: false,
		dragOffset: { x: 0, y: 0 },
		dragStartPos: null,
		showCostMode: false
	};

	// Helper methods for complex updates
	updateCamera(updates: Partial<CameraState>) {
		this.camera = { ...this.camera, ...updates };
		// Also update target values to prevent conflicts with smooth interpolation
		if (updates.x !== undefined) this.camera.targetX = updates.x;
		if (updates.y !== undefined) this.camera.targetY = updates.y;
		if (updates.scale !== undefined) this.camera.targetScale = updates.scale;
	}

	updatePointerState(updates: Partial<PointerState>) {
		this.pointerState = { ...this.pointerState, ...updates };
	}

	updateTouchState(updates: Partial<TouchState>) {
		this.touchState = { ...this.touchState, ...updates };
	}

	addToUndoHistory(action: Pixel) {
		this.undoHistory.push({
			x: action.x,
			y: action.y,
			color: action.color,
			timestamp: action.timestamp,
			previousColor: this.pixels.get(`${action.x},${action.y}`)?.color || null
		});

		if (this.undoHistory.length > this.maxUndoHistory) {
			this.undoHistory.shift();
		}
	}

	undoLastAction() {
		const lastAction = this.undoHistory.pop() || null;
		if (!lastAction) return;

		nostrService.publishPixel(lastAction.x, lastAction.y, lastAction.previousColor, true);
	}

	// Preview mode methods
	updatePreviewState(updates: Partial<PreviewState>) {
		this.previewState = { ...this.previewState, ...updates };
	}

	enterPreviewMode() {
		this.updatePreviewState({ isActive: true });
	}

	exitPreviewMode() {
		this.updatePreviewState({
			isActive: false,
			pixels: new Map(),
			costBreakdown: {
				newPixels: 0,
				freshPixels: 0,
				recentPixels: 0,
				olderPixels: 0,
				ancientPixels: 0,
				totalCost: 0
			},
			isDragging: false,
			dragOffset: { x: 0, y: 0 },
			dragStartPos: null,
			showCostMode: false
		});
	}

	addPreviewPixel(x: number, y: number, color: string) {
		const pixelKey = `${x},${y}`;
		const existingPixel = this.pixels.get(pixelKey);

		const cost = getPixelPrice(existingPixel?.timestamp || null);
		const isNew = !existingPixel;
		let existingPixelAge;

		if (existingPixel) {
			existingPixelAge = (Date.now() - existingPixel.timestamp) / (1000 * 60 * 60);
		}

		const previewPixel: PreviewPixel = {
			x, y, color, isNew, existingPixelAge, cost
		};

		this.previewState.pixels.set(pixelKey, previewPixel);
		this.updateCostBreakdown();
	}

	removePreviewPixel(x: number, y: number) {
		const pixelKey = `${x},${y}`;
		this.previewState.pixels.delete(pixelKey);
		this.updateCostBreakdown();
	}

	clearPreviewPixels() {
		this.previewState.pixels.clear();
		this.updateCostBreakdown();
	}

	updateCostBreakdown() {
		const breakdown = calculateCostBreakdown(this.previewState.pixels);
		this.updatePreviewState({ costBreakdown: breakdown });
	}

	// Method to track pixel changes
	markPixelAsModified(x: number, y: number) {
		const pixelKey = `${x},${y}`;
		this.modifiedPixels.add(pixelKey);
	}

	// Method to mark all pixels for redraw (e.g., debug mode loading)
	markAllPixelsForRedraw() {
		this.modifiedPixels = new Set(this.pixels.keys());
	}
}

// Export singleton instance
export const state = new State(); 