import { CostBreakdown, PixelData } from '@zappy-place/nostr-client';
import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, WORLD_SIZE } from './constants';
import { nostrService } from './nostr';

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



export interface PixelAction {
	action: 'add' | 'remove';
	timestamp: number;
	pixel: PixelData;
}

export interface PreviewState {
	isActive: boolean;
	pixels: Map<string, PixelData>; // Key: "x,y"
	costBreakdown: CostBreakdown;
	isDragging: boolean;
	dragOffset: { x: number; y: number };
	dragStartPos: { x: number; y: number } | null;
	showCostMode: boolean; // Toggle for showing borders and age indicators
	minimized: boolean; // Whether the preview panel is minimized
	message?: string; // User-input message for the pixel event
	url?: string; // User-input URL for the pixel event
	validationErrors?: {
		message?: string;
		url?: string;
	};
}

class State {
	// Global state
	selectedColor: string = '#A06A42'; // Brown color that was selected in the original palette
	pixels = new Map<string, PixelData>(); // Will be populated by Nostr events

	// Undo history for preview actions
	undoHistory: PixelAction[] = [];
	maxUndoHistory = 50;

	// PIXI.js objects
	app!: PIXI.Application;
	viewport!: PIXI.Container;
	pixelContainer!: PIXI.Container;
	gridContainer!: PIXI.Container;
	cursorContainer!: PIXI.Container;



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



	// Preview mode state
	previewState: PreviewState = {
		isActive: false,
		pixels: new Map(),
		costBreakdown: {
			totalSats: 0,
			pixelCounts: {
				new: 0,
				fresh: 0,
				recent: 0,
				older: 0,
				ancient: 0
			}
		},
		isDragging: false,
		dragOffset: { x: 0, y: 0 },
		dragStartPos: null,
		showCostMode: false,
		minimized: false
	};

	updateCamera(updates: Partial<CameraState>) {
		this.camera = { ...this.camera, ...updates };
		if (updates.x !== undefined) this.camera.targetX = updates.x;
		if (updates.y !== undefined) this.camera.targetY = updates.y;
		if (updates.scale !== undefined) this.camera.targetScale = updates.scale;
	}

	updatePointerState(updates: Partial<PointerState>) {
		this.pointerState = { ...this.pointerState, ...updates };
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

		const pixelKey = `${lastAction.pixel.x},${lastAction.pixel.y}`;

		if (lastAction.action === 'add') {
			// Action was adding a preview pixel, so remove it
			if (this.previewState.pixels.has(pixelKey)) {
				this.previewState.pixels.delete(pixelKey);
				this.updateCostBreakdown();
			}
		} else if (lastAction.action === 'remove' && lastAction.pixel.color) {
			// Action was removing a preview pixel, so add it back
			if (!this.previewState.pixels.has(pixelKey)) {
				const previewPixel: PixelData = {
					x: lastAction.pixel.x,
					y: lastAction.pixel.y,
					color: lastAction.pixel.color
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
				totalSats: 0,
				pixelCounts: {
					new: 0,
					fresh: 0,
					recent: 0,
					older: 0,
					ancient: 0
				}
			},
			isDragging: false,
			dragOffset: { x: 0, y: 0 },
			dragStartPos: null,
			showCostMode: false,
			minimized: false,
			message: undefined,
			url: undefined,
			validationErrors: undefined
		});
	}

	addPreviewPixel(x: number, y: number, color: string) {
		const pixelKey = `${x},${y}`;
		const wasInPreview = this.previewState.pixels.has(pixelKey);

		const previewPixel: PixelData = {
			x, y, color
		};

		this.previewState.pixels.set(pixelKey, previewPixel);
		this.updateCostBreakdown();

		// Add to undo history only if it's a new action (not already in preview)
		if (!wasInPreview) {
			this.addToUndoHistory({
				action: 'add',
				pixel: previewPixel,
				timestamp: Date.now()
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
				action: 'remove',
				pixel: existingPreviewPixel,
				timestamp: Date.now()
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
		const breakdown = nostrService.canvas.calculateCost(Array.from(this.previewState.pixels.values()));
		this.updatePreviewState({ costBreakdown: breakdown });
	}

	setPixel(pixel: PixelData) {
		const pixelKey = `${pixel.x},${pixel.y}`;
		this.pixels.set(pixelKey, pixel);
		this.modifiedPixels.add(pixelKey);
	}

	setPixels(pixels: Map<string, PixelData>) {
		this.pixels = pixels;
		this.modifiedPixels = new Set(pixels.keys());
	}
}

// Export singleton instance
export const state = new State(); 