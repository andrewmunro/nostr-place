import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, WORLD_SIZE } from './constants';
import { generateDummyPixels } from './dummyData';

export interface CameraState {
	x: number;
	y: number;
	scale: number;
}

export interface PointerState {
	isDragging: boolean;
	lastPos: { x: number; y: number };
	cursorPixel: { x: number; y: number } | null;
}

class State {
	// Global state
	selectedColor = '#A06A42'; // Brown color that was selected in the original palette
	pixels = generateDummyPixels(); // Load dummy data for testing

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
		cursorPixel: null
	};

	// Helper methods for complex updates
	updateCamera(updates: Partial<CameraState>) {
		this.camera = { ...this.camera, ...updates };
	}

	updatePointerState(updates: Partial<PointerState>) {
		this.pointerState = { ...this.pointerState, ...updates };
	}
}

// Export singleton instance
export const state = new State(); 