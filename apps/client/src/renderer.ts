import * as PIXI from 'pixi.js';
import { screenToWorld } from './camera';
import { WORLD_SIZE } from './constants';
import { state } from './state';

// Cache for reusable graphics objects
let gridGraphics: PIXI.Graphics | null = null;
let cursorGraphics: PIXI.Graphics | null = null;

export async function setupRenderer() {
	const newApp = new PIXI.Application({
		width: window.innerWidth,
		height: window.innerHeight, // Full window height since UI is overlaid
		backgroundColor: 0xC0C0C0, // Gray background like pxls.space
		antialias: false,
		resolution: window.devicePixelRatio || 1,
		autoDensity: true,
	});
	state.app = newApp;

	const canvasContainer = document.getElementById('canvas-container')!;
	canvasContainer.appendChild(state.app.view as HTMLCanvasElement);

	// Create viewport (camera container)
	const newViewport = new PIXI.Container();
	state.viewport = newViewport;
	state.app.stage.addChild(state.viewport);

	// Create grid container
	const newGridContainer = new PIXI.Container();
	state.gridContainer = newGridContainer;
	state.viewport.addChild(state.gridContainer);

	// Create pixel container
	const newPixelContainer = new PIXI.Container();
	state.pixelContainer = newPixelContainer;
	state.viewport.addChild(state.pixelContainer);

	// Setup texture-based pixel rendering
	setupPixelTexture();

	// Setup interaction
	state.app.stage.eventMode = 'static';
	state.app.stage.hitArea = new PIXI.Rectangle(0, 0, state.app.screen.width, state.app.screen.height);
}

export function updateRenderer() {
	updatePixelTexture(); // Update pixel texture if needed
	renderGrid();
	renderCursor();
}

function setupPixelTexture() {
	// Create a canvas for pixel texture
	const canvas = document.createElement('canvas');
	canvas.width = WORLD_SIZE;
	canvas.height = WORLD_SIZE;
	state.pixelCanvas = canvas;

	const context = canvas.getContext('2d')!;
	state.pixelContext = context;

	// Disable smoothing for pixel-perfect rendering
	state.pixelContext.imageSmoothingEnabled = false;

	// Create PIXI texture from canvas
	const texture = PIXI.Texture.from(state.pixelCanvas);
	state.pixelTexture = texture;

	// CRITICAL: Set texture to nearest neighbor scaling for crisp pixels
	state.pixelTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

	const sprite = new PIXI.Sprite(state.pixelTexture);
	state.pixelSprite = sprite;
	state.pixelContainer.addChild(state.pixelSprite);

	// Initial render of all pixels to texture
	updatePixelTexture();
}

function updatePixelTexture() {
	if (!state.textureNeedsUpdate) return;

	// Clear the canvas
	state.pixelContext.clearRect(0, 0, WORLD_SIZE, WORLD_SIZE);

	// Render all pixels to the canvas
	state.pixels.forEach((pixel) => {
		if (pixel.isValid) {
			state.pixelContext.fillStyle = pixel.color;
			state.pixelContext.fillRect(pixel.x, pixel.y, 1, 1);
		}
	});

	// Update the PIXI texture
	state.pixelTexture.update();
	state.textureNeedsUpdate = false;
}

function renderGrid() {
	// Only render grid if zoomed in enough
	if (state.camera.scale < 2) {
		// Hide grid if not zoomed in
		if (gridGraphics) {
			gridGraphics.visible = false;
		}
		return;
	}

	// Create grid graphics if it doesn't exist
	if (!gridGraphics) {
		gridGraphics = new PIXI.Graphics();
		state.gridContainer.addChild(gridGraphics);
	}

	// Show and clear the graphics
	gridGraphics.visible = true;
	gridGraphics.clear();
	gridGraphics.lineStyle(1 / state.camera.scale, 0x888888, 0.3);

	// Calculate visible area
	const topLeft = screenToWorld(0, 0);
	const bottomRight = screenToWorld(state.app.screen.width, state.app.screen.height);

	const startX = Math.max(0, Math.floor(topLeft.x));
	const endX = Math.min(WORLD_SIZE, Math.ceil(bottomRight.x));
	const startY = Math.max(0, Math.floor(topLeft.y));
	const endY = Math.min(WORLD_SIZE, Math.ceil(bottomRight.y));

	// Draw vertical lines
	for (let x = startX; x <= endX; x++) {
		gridGraphics.moveTo(x, startY);
		gridGraphics.lineTo(x, endY);
	}

	// Draw horizontal lines
	for (let y = startY; y <= endY; y++) {
		gridGraphics.moveTo(startX, y);
		gridGraphics.lineTo(endX, y);
	}
}

function renderCursor() {
	// Only show cursor when zoomed in enough
	if (state.camera.scale < 2) {
		// Hide cursor if not zoomed in
		if (cursorGraphics) {
			cursorGraphics.visible = false;
		}
		return;
	}

	let cursorPixelX: number | null = null;
	let cursorPixelY: number | null = null;

	// Show cursor at mouse position if mouse cursor is being tracked
	if (state.pointerState.mouseCursorPixel) {
		cursorPixelX = state.pointerState.mouseCursorPixel.x;
		cursorPixelY = state.pointerState.mouseCursorPixel.y;
	} else if (state.touchState.activeTouches.size > 0 || state.touchState.holdTimer !== null || state.touchState.hasTouchBeenUsed) {
		// Show cursor at center for touch controls (when touches are active, during hold, or if touch has been used)
		cursorPixelX = Math.floor(state.camera.x);
		cursorPixelY = Math.floor(state.camera.y);
	}

	// Only show cursor if we have valid coordinates and pixel is within world bounds
	if (cursorPixelX !== null && cursorPixelY !== null &&
		cursorPixelX >= 0 && cursorPixelX < WORLD_SIZE &&
		cursorPixelY >= 0 && cursorPixelY < WORLD_SIZE) {

		// Create cursor graphics if it doesn't exist
		if (!cursorGraphics) {
			cursorGraphics = new PIXI.Graphics();
			state.pixelContainer.addChild(cursorGraphics);
		}

		// Show and redraw the cursor
		cursorGraphics.visible = true;
		cursorGraphics.clear();
		cursorGraphics.lineStyle(2 / state.camera.scale, 0x000000, 0.8);
		cursorGraphics.beginFill(state.selectedColor ? parseInt(state.selectedColor.replace('#', ''), 16) : 0xC0C0C0, 1);
		cursorGraphics.drawRect(cursorPixelX, cursorPixelY, 1, 1);
		cursorGraphics.endFill();
	} else {
		// Hide cursor if no valid position
		if (cursorGraphics) {
			cursorGraphics.visible = false;
		}
	}
}