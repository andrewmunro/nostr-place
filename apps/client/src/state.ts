import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, WORLD_SIZE } from './constants';
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
	action: 'add' | 'remove';
	color?: string; // Color when adding
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

	// Undo history for preview actions
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

	addToUndoHistory(action: PixelAction) {
		this.undoHistory.push(action);

		if (this.undoHistory.length > this.maxUndoHistory) {
			this.undoHistory.shift();
		}
	}

	undoLastAction() {
		if (!this.previewState.isActive) return;

		const lastAction = this.undoHistory.pop();
		if (!lastAction) return;

		const pixelKey = `${lastAction.x},${lastAction.y}`;

		if (lastAction.action === 'add') {
			// Action was adding a preview pixel, so remove it
			if (this.previewState.pixels.has(pixelKey)) {
				// Remove without adding to undo history to avoid recursion
				this.previewState.pixels.delete(pixelKey);
				this.updateCostBreakdown();
			}
		} else if (lastAction.action === 'remove' && lastAction.color) {
			// Action was removing a preview pixel, so add it back
			if (!this.previewState.pixels.has(pixelKey)) {
				// Add back without adding to undo history to avoid recursion
				const existingPixel = this.pixels.get(pixelKey);
				const cost = getPixelPrice(existingPixel?.timestamp || null);
				const isNew = !existingPixel;
				let existingPixelAge;

				if (existingPixel) {
					existingPixelAge = (Date.now() - existingPixel.timestamp) / (1000 * 60 * 60);
				}

				const previewPixel: PreviewPixel = {
					x: lastAction.x,
					y: lastAction.y,
					color: lastAction.color,
					isNew,
					existingPixelAge,
					cost
				};

				this.previewState.pixels.set(pixelKey, previewPixel);
				this.updateCostBreakdown();
			}
		}
	}

	// Preview mode methods
	updatePreviewState(updates: Partial<PreviewState>) {
		this.previewState = { ...this.previewState, ...updates };
	}

	enterPreviewMode() {
		this.updatePreviewState({ isActive: true });
	}

	exitPreviewMode() {
		// Clear undo history when exiting preview mode
		this.undoHistory = [];
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
		const wasInPreview = this.previewState.pixels.has(pixelKey);

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

		// Add to undo history only if it's a new action (not already in preview)
		if (!wasInPreview) {
			this.addToUndoHistory({
				x, y, action: 'add', color, timestamp: Date.now()
			});
		}
	}

	removePreviewPixel(x: number, y: number) {
		const pixelKey = `${x},${y}`;
		const existingPreviewPixel = this.previewState.pixels.get(pixelKey);

		if (existingPreviewPixel) {
			this.previewState.pixels.delete(pixelKey);
			this.updateCostBreakdown();

			// Store the removed pixel's color so we can restore it
			this.addToUndoHistory({
				x, y, action: 'remove', color: existingPreviewPixel.color, timestamp: Date.now()
			});
		}
	}

	clearPreviewPixels() {
		// Clear undo history when clearing all pixels
		this.undoHistory = [];
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