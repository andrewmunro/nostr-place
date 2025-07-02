import { Pixel } from '@nostr-place/nostr-canvas';
import * as PIXI from 'pixi.js';
import { DEFAULT_SCALE, MAX_SCALE, MIN_SCALE, PRESET_COLORS, WORLD_SIZE } from './constants';
import { generateDummyPixels } from './dummyData';
import './style.css';



// State
let selectedColor = '#A06A42'; // Brown color that was selected in the original palette
let pixels = generateDummyPixels(); // Load dummy data for testing
let app: PIXI.Application;
let viewport: PIXI.Container;
let pixelContainer: PIXI.Container;
let gridContainer: PIXI.Container;

// Color palette scroll state
let paletteScrollOffset = 0;
const COLORS_PER_ROW = 2;
const SCROLL_STEP = 2; // Reduced scroll step for smoother navigation

// Texture-based rendering for performance
let pixelTexture: PIXI.Texture;
let pixelSprite: PIXI.Sprite;
let pixelCanvas: HTMLCanvasElement;
let pixelContext: CanvasRenderingContext2D;
let textureNeedsUpdate = true;

// Camera state
let camera = {
	x: WORLD_SIZE / 2,
	y: WORLD_SIZE / 2,
	scale: DEFAULT_SCALE
};

let isDragging = false;
let lastPointerPos = { x: 0, y: 0 };
let cursorPixel: { x: number; y: number } | null = null;

// Initialize the application
async function init() {
	setupUI();
	await setupPixiJS();
	setupEventListeners();
	loadFromURL();
	updateURL();
	renderWorld();
}

function setupUI() {
	// Setup preset colors
	const colorPalette = document.getElementById('color-palette')!;
	colorPalette.innerHTML = '';

	PRESET_COLORS.forEach(color => {
		const colorButton = document.createElement('div');
		colorButton.className = 'color-btn';
		colorButton.style.backgroundColor = color;
		if (color === selectedColor) {
			colorButton.classList.add('selected');
		}

		colorButton.addEventListener('click', () => {
			selectColor(color);
		});

		colorPalette.appendChild(colorButton);
	});

	// Setup zoom controls
	const zoomInBtn = document.getElementById('zoom-in')!;
	const zoomOutBtn = document.getElementById('zoom-out')!;

	zoomInBtn.addEventListener('click', () => {
		zoomIn();
	});

	zoomOutBtn.addEventListener('click', () => {
		zoomOut();
	});

	// Setup palette scroll controls
	const scrollUpBtn = document.getElementById('palette-scroll-up')!;
	const scrollDownBtn = document.getElementById('palette-scroll-down')!;

	scrollUpBtn.addEventListener('click', () => {
		scrollPalette(-1);
	});

	scrollDownBtn.addEventListener('click', () => {
		scrollPalette(1);
	});

	// Initial palette layout update
	setTimeout(() => updatePaletteLayout(), 0);

	// Update coordinates display
	updateCoordinatesDisplay();
}

async function setupPixiJS() {
	app = new PIXI.Application({
		width: window.innerWidth,
		height: window.innerHeight, // Full window height since UI is overlaid
		backgroundColor: 0xC0C0C0, // Gray background like pxls.space
		antialias: false,
		resolution: window.devicePixelRatio || 1,
		autoDensity: true,
	});

	const canvasContainer = document.getElementById('canvas-container')!;
	canvasContainer.appendChild(app.view as HTMLCanvasElement);

	// Create viewport (camera container)
	viewport = new PIXI.Container();
	app.stage.addChild(viewport);

	// Create grid container
	gridContainer = new PIXI.Container();
	viewport.addChild(gridContainer);

	// Create pixel container
	pixelContainer = new PIXI.Container();
	viewport.addChild(pixelContainer);

	// Setup texture-based pixel rendering
	setupPixelTexture();

	// Setup interaction
	app.stage.eventMode = 'static';
	app.stage.hitArea = new PIXI.Rectangle(0, 0, app.screen.width, app.screen.height);

	app.stage.on('pointerdown', handlePointerDown);
	app.stage.on('pointermove', handlePointerMove);
	app.stage.on('pointerup', handlePointerUp);
	app.stage.on('pointerupoutside', handlePointerUp);
	app.stage.on('pointerleave', handlePointerLeave);
	app.stage.on('wheel', handleWheel);

	// Handle resize
	window.addEventListener('resize', handleResize);

	// Update palette layout on window resize
	window.addEventListener('resize', updatePaletteLayout);
}

function setupPixelTexture() {
	// Create a canvas for pixel texture
	pixelCanvas = document.createElement('canvas');
	pixelCanvas.width = WORLD_SIZE;
	pixelCanvas.height = WORLD_SIZE;
	pixelContext = pixelCanvas.getContext('2d')!;

	// Disable smoothing for pixel-perfect rendering
	pixelContext.imageSmoothingEnabled = false;

	// Create PIXI texture from canvas
	pixelTexture = PIXI.Texture.from(pixelCanvas);

	// CRITICAL: Set texture to nearest neighbor scaling for crisp pixels
	pixelTexture.baseTexture.scaleMode = PIXI.SCALE_MODES.NEAREST;

	pixelSprite = new PIXI.Sprite(pixelTexture);
	pixelContainer.addChild(pixelSprite);

	// Initial render of all pixels to texture
	updatePixelTexture();
}

function updatePixelTexture() {
	if (!textureNeedsUpdate) return;

	// Clear the canvas
	pixelContext.clearRect(0, 0, WORLD_SIZE, WORLD_SIZE);

	// Render all pixels to the canvas
	pixels.forEach((pixel) => {
		if (pixel.isValid) {
			pixelContext.fillStyle = pixel.color;
			pixelContext.fillRect(pixel.x, pixel.y, 1, 1);
		}
	});

	// Update the PIXI texture
	pixelTexture.update();
	textureNeedsUpdate = false;
}

function setupEventListeners() {
	// Handle URL changes
	window.addEventListener('hashchange', loadFromURL);

	// Prevent context menu on right click
	(app.view as HTMLCanvasElement).addEventListener('contextmenu', (e) => e.preventDefault());

	// Keyboard controls for movement
	window.addEventListener('keydown', handleKeyDown);
}

function handleKeyDown(event: KeyboardEvent) {
	const moveSpeed = 20 / camera.scale; // Move speed inversely proportional to zoom

	switch (event.key.toLowerCase()) {
		case 'w':
		case 'arrowup':
			camera.y -= moveSpeed;
			break;
		case 's':
		case 'arrowdown':
			camera.y += moveSpeed;
			break;
		case 'a':
		case 'arrowleft':
			camera.x -= moveSpeed;
			break;
		case 'd':
		case 'arrowright':
			camera.x += moveSpeed;
			break;
		default:
			return; // Don't prevent default for other keys
	}

	event.preventDefault();
	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function selectColor(color: string) {
	selectedColor = color;

	// Update UI
	document.querySelectorAll('.color-btn').forEach((btn, index) => {
		btn.classList.remove('selected');
		if (PRESET_COLORS[index] === color) {
			btn.classList.add('selected');
		}
	});
}

function handlePointerDown(event: PIXI.FederatedPointerEvent) {
	const globalPos = event.global;

	if (event.button === 0) { // Left click
		const worldPos = screenToWorld(globalPos.x, globalPos.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			placePixel(pixelX, pixelY, selectedColor);
		}
	} else if (event.button === 2 || event.button === 1) { // Right click or middle click - start panning
		isDragging = true;
		lastPointerPos = { x: globalPos.x, y: globalPos.y };
		(app.view as HTMLCanvasElement).style.cursor = 'grabbing';
		cursorPixel = null; // Clear cursor during drag
	}
}

function handlePointerMove(event: PIXI.FederatedPointerEvent) {
	const globalPos = event.global;

	if (isDragging) {
		const dx = globalPos.x - lastPointerPos.x;
		const dy = globalPos.y - lastPointerPos.y;

		camera.x -= dx / camera.scale;
		camera.y -= dy / camera.scale;

		lastPointerPos = { x: globalPos.x, y: globalPos.y };
		updateCamera();
		updateURL();
		updateCoordinatesDisplay();
		renderWorld(); // Update grid and pixels when panning
	} else {
		// Update coordinates display and cursor preview
		const worldPos = screenToWorld(globalPos.x, globalPos.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			cursorPixel = { x: pixelX, y: pixelY };
		} else {
			cursorPixel = null;
		}

		updateCoordinatesDisplay(pixelX, pixelY);
		renderCursor(); // Re-render to show cursor
	}
}

function handlePointerUp() {
	isDragging = false;
	(app.view as HTMLCanvasElement).style.cursor = 'default';
}

function handlePointerLeave() {
	cursorPixel = null;
	renderCursor();
}

function handleWheel(event: PIXI.FederatedWheelEvent) {
	event.preventDefault();

	const pointer = event.global;
	const worldPosBeforeZoom = screenToWorld(pointer.x, pointer.y);

	const zoomFactor = event.deltaY > 0 ? 0.2 : 5;
	camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, camera.scale * zoomFactor));

	const worldPosAfterZoom = screenToWorld(pointer.x, pointer.y);

	// Adjust camera position to keep the same world position under the mouse
	camera.x += worldPosBeforeZoom.x - worldPosAfterZoom.x;
	camera.y += worldPosBeforeZoom.y - worldPosAfterZoom.y;

	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function screenToWorld(screenX: number, screenY: number) {
	const centerX = app.screen.width / 2;
	const centerY = app.screen.height / 2;

	return {
		x: camera.x + (screenX - centerX) / camera.scale,
		y: camera.y + (screenY - centerY) / camera.scale
	};
}

function worldToScreen(worldX: number, worldY: number) {
	const centerX = app.screen.width / 2;
	const centerY = app.screen.height / 2;

	return {
		x: centerX + (worldX - camera.x) * camera.scale,
		y: centerY + (worldY - camera.y) * camera.scale
	};
}

function clampCamera() {
	// Clamp camera position to world bounds
	camera.x = Math.max(0, Math.min(WORLD_SIZE, camera.x));
	camera.y = Math.max(0, Math.min(WORLD_SIZE, camera.y));
}

function updateCamera() {
	clampCamera();

	const centerX = app.screen.width / 2;
	const centerY = app.screen.height / 2;

	viewport.position.set(centerX, centerY);
	viewport.scale.set(camera.scale);
	viewport.pivot.set(camera.x, camera.y);
}

function handleResize() {
	app.renderer.resize(window.innerWidth, window.innerHeight); // Full window height
	updateCamera();
	renderWorld();
	updatePaletteLayout(); // Update palette layout on resize
}

function placePixel(x: number, y: number, color: string) {
	const pixelKey = `${x},${y}`;
	const pixel: Pixel = {
		x,
		y,
		color,
		eventId: `pixel_${x}_${y}_${Date.now()}`,
		pubkey: 'local_user',
		timestamp: Date.now(),
		isValid: true
	};

	pixels.set(pixelKey, pixel);

	// Update the texture immediately for this pixel
	pixelContext.fillStyle = color;
	pixelContext.fillRect(x, y, 1, 1);
	pixelTexture.update();

	console.log(`Placed ${color} pixel at (${x}, ${y})`);
}

function renderWorld() {
	renderGrid();
	renderCursor();
}

function renderGrid() {
	gridContainer.removeChildren();

	// Only render grid if zoomed in enough
	if (camera.scale < 2) return;

	const graphics = new PIXI.Graphics();
	graphics.lineStyle(1 / camera.scale, 0x888888, 0.3);

	// Calculate visible area
	const topLeft = screenToWorld(0, 0);
	const bottomRight = screenToWorld(app.screen.width, app.screen.height);

	const startX = Math.max(0, Math.floor(topLeft.x));
	const endX = Math.min(WORLD_SIZE, Math.ceil(bottomRight.x));
	const startY = Math.max(0, Math.floor(topLeft.y));
	const endY = Math.min(WORLD_SIZE, Math.ceil(bottomRight.y));

	// Draw vertical lines
	for (let x = startX; x <= endX; x++) {
		graphics.moveTo(x, startY);
		graphics.lineTo(x, endY);
	}

	// Draw horizontal lines
	for (let y = startY; y <= endY; y++) {
		graphics.moveTo(startX, y);
		graphics.lineTo(endX, y);
	}

	gridContainer.addChild(graphics);
}

function renderCursor() {
	// Remove any existing cursor graphics (keep the texture sprite)
	const children = [...pixelContainer.children];
	children.forEach(child => {
		if (child !== pixelSprite) {
			pixelContainer.removeChild(child);
		}
	});

	// Render cursor preview
	if (cursorPixel && camera.scale >= 2) { // Only show cursor when zoomed in enough
		const cursorGraphics = new PIXI.Graphics();
		cursorGraphics.lineStyle(2 / camera.scale, 0x000000, 0.8);
		cursorGraphics.beginFill(parseInt(selectedColor.replace('#', ''), 16), 1);
		cursorGraphics.drawRect(cursorPixel.x, cursorPixel.y, 1, 1);
		cursorGraphics.endFill();
		pixelContainer.addChild(cursorGraphics);
	}
}

function updateCoordinatesDisplay(x?: number, y?: number) {
	const coordsDisplay = document.getElementById('coordinates')!;

	if (x !== undefined && y !== undefined) {
		coordsDisplay.textContent = `${x},${y}`;
	} else {
		coordsDisplay.textContent = `${Math.floor(camera.x)},${Math.floor(camera.y)}`;
	}
}

function updateURL() {
	const hash = `#x=${Math.floor(camera.x)}&y=${Math.floor(camera.y)}&scale=${camera.scale.toFixed(2)}`;
	if (window.location.hash !== hash) {
		window.history.replaceState(null, '', hash);
	}
}

function loadFromURL() {
	const hash = window.location.hash.slice(1);
	const params = new URLSearchParams(hash);

	const x = params.get('x');
	const y = params.get('y');
	const scale = params.get('scale');

	if (x !== null) camera.x = parseInt(x);
	if (y !== null) camera.y = parseInt(y);
	if (scale !== null) camera.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, parseFloat(scale)));

	// Clamp camera after loading from URL in case of invalid coordinates
	clampCamera();
	updateCamera();
	updateCoordinatesDisplay();
	renderWorld();
}

function zoomIn() {
	const zoomFactor = 2;
	camera.scale = Math.min(MAX_SCALE, camera.scale * zoomFactor);
	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function zoomOut() {
	const zoomFactor = 0.5;
	camera.scale = Math.max(MIN_SCALE, camera.scale * zoomFactor);
	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function scrollPalette(direction: number) {
	const totalRows = Math.ceil(PRESET_COLORS.length / COLORS_PER_ROW);
	const buttonHeight = 28;
	const scrollButtonHeight = 28;
	const containerMargin = 20;

	// Calculate available space and max visible rows with scroll buttons
	const availableHeight = window.innerHeight - containerMargin;
	const heightWithScrollButtons = availableHeight - (scrollButtonHeight * 2);
	const maxVisibleRows = Math.floor(heightWithScrollButtons / buttonHeight);
	const maxScrollOffset = Math.max(0, totalRows - maxVisibleRows);

	// Update scroll offset
	paletteScrollOffset = Math.max(0, Math.min(maxScrollOffset, paletteScrollOffset + direction * SCROLL_STEP));

	updatePaletteLayout();
}

function updatePaletteLayout() {
	const colorPalette = document.getElementById('color-palette')!;
	const scrollUpBtn = document.getElementById('palette-scroll-up')!;
	const scrollDownBtn = document.getElementById('palette-scroll-down')!;
	const container = document.getElementById('color-palette-scroll-container')!;

	// Calculate dimensions
	const totalRows = Math.ceil(PRESET_COLORS.length / COLORS_PER_ROW);
	const buttonHeight = 28; // 24px height + 4px gap
	const scrollButtonHeight = 28; // Height of scroll buttons when visible
	const containerMargin = 20; // Top and bottom margins

	// Available height for the palette
	const availableHeight = window.innerHeight - containerMargin;
	const maxPossibleRows = Math.floor(availableHeight / buttonHeight);

	// Determine if scrolling is needed
	const needsScrolling = totalRows > maxPossibleRows;

	if (needsScrolling) {
		// Calculate how many rows can fit with scroll buttons
		const heightWithScrollButtons = availableHeight - (scrollButtonHeight * 2);
		const maxVisibleRows = Math.floor(heightWithScrollButtons / buttonHeight);
		const maxScrollOffset = Math.max(0, totalRows - maxVisibleRows);

		// Show scroll buttons and limit scroll offset
		scrollUpBtn.classList.toggle('hidden', paletteScrollOffset === 0);
		scrollDownBtn.classList.toggle('hidden', paletteScrollOffset >= maxScrollOffset);

		// Ensure scroll offset doesn't exceed maximum
		paletteScrollOffset = Math.min(paletteScrollOffset, maxScrollOffset);

		// Set container height to fit visible rows
		container.style.height = `${maxVisibleRows * buttonHeight}px`;
	} else {
		// Hide scroll buttons and reset scroll
		scrollUpBtn.classList.add('hidden');
		scrollDownBtn.classList.add('hidden');
		paletteScrollOffset = 0;

		// Let container take up space for all colors
		container.style.height = `${totalRows * buttonHeight}px`;
	}

	// Apply scroll transform
	const scrollPixels = paletteScrollOffset * buttonHeight;
	colorPalette.style.transform = `translateY(-${scrollPixels}px)`;
}

// Start the application
init(); 