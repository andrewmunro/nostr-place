import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, WORLD_SIZE } from './constants';

export interface CameraState {
	x: number;
	y: number;
	scale: number;
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

class State {
	// Global state
	selectedColor = '#A06A42'; // Brown color that was selected in the original palette
	pixels = new Map(); // Will be populated by Nostr events

	// PIXI.js objects
	app!: PIXI.Application;
	viewport!: PIXI.Container;
	pixelContainer!: PIXI.Container;
	gridContainer!: PIXI.Container;

	// Color palette scroll state
	paletteScrollOffset = 0;

	// Texture-based rendering for performance
	pixelTexture!: PIXI.Texture;
	pixelSprite!: PIXI.Sprite;
	pixelCanvas!: HTMLCanvasElement;
	pixelContext!: CanvasRenderingContext2D;
	textureNeedsUpdate = true;

	// Camera state
	camera: CameraState = {
		x: WORLD_SIZE / 2,
		y: WORLD_SIZE / 2,
		scale: DEFAULT_SCALE
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

	// Helper methods for complex updates
	updateCamera(updates: Partial<CameraState>) {
		this.camera = { ...this.camera, ...updates };
	}

	updatePointerState(updates: Partial<PointerState>) {
		this.pointerState = { ...this.pointerState, ...updates };
	}

	updateTouchState(updates: Partial<TouchState>) {
		this.touchState = { ...this.touchState, ...updates };
	}
}

// Export singleton instance
export const state = new State(); 