import * as Hammer from 'hammerjs';
import * as PIXI from 'pixi.js';
import { getCenterPixel, screenToWorld, smoothZoomToPoint } from './camera';
import { MAX_SCALE, MIN_SCALE, WORLD_SIZE } from './constants';
import { nostrService } from './nostr';
import { loadFromURL } from './persistence';
import { state } from './state';
import { hidePixelTooltip, showPixelModal, showPixelTooltip } from './ui';

// Touch control constants
const TOUCH_HOLD_DURATION = 400; // milliseconds to hold for placing pixel (increased for better UX)
const DRAG_THRESHOLD = 5; // pixels to move before considering it a drag

// Hammer.js instance
let hammer: HammerManager | null = null;

// Touch tooltip state
let lastCenterPixelKey: string | null = null;

// Preview mode dragging state
interface PreviewDragState {
	isDragging: boolean;
	startPos: { x: number; y: number } | null;
	startWorldPos: { x: number; y: number } | null;
	hasMoved: boolean;
	lastAppliedOffset: { x: number; y: number };
}

let previewDragState: PreviewDragState = {
	isDragging: false,
	startPos: null,
	startWorldPos: null,
	hasMoved: false,
	lastAppliedOffset: { x: 0, y: 0 }
};

// Paint dragging state for continuous pixel placement
interface PaintDragState {
	isDragging: boolean;
	lastPixel: { x: number; y: number } | null;
}

let paintDragState: PaintDragState = {
	isDragging: false,
	lastPixel: null
};

// Helper functions for preview pixel dragging
function startPreviewDrag(screenX: number, screenY: number) {
	if (!state.previewState.isActive || state.previewState.pixels.size === 0) {
		return false;
	}

	// Check if the touch/click position is on a preview pixel
	const worldPos = screenToWorld(screenX, screenY);
	const pixelX = Math.floor(worldPos.x);
	const pixelY = Math.floor(worldPos.y);
	const pixelKey = `${pixelX},${pixelY}`;

	// Only start dragging if the touch is on an actual preview pixel
	if (!state.previewState.pixels.has(pixelKey)) {
		return false;
	}

	previewDragState = {
		isDragging: true,
		startPos: { x: screenX, y: screenY },
		startWorldPos: { x: worldPos.x, y: worldPos.y },
		hasMoved: false,
		lastAppliedOffset: { x: 0, y: 0 }
	};
	return true;
}

function updatePreviewDrag(screenX: number, screenY: number) {
	if (!previewDragState.isDragging || !previewDragState.startPos) {
		return false;
	}

	const dx = screenX - previewDragState.startPos.x;
	const dy = screenY - previewDragState.startPos.y;
	const distance = Math.sqrt(dx * dx + dy * dy);

	// Check if we've moved beyond the drag threshold
	if (!previewDragState.hasMoved && distance > DRAG_THRESHOLD) {
		previewDragState.hasMoved = true;
		(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
	}

	// If we're dragging, move all preview pixels
	if (previewDragState.hasMoved) {
		const currentWorldPos = screenToWorld(screenX, screenY);
		const targetOffsetX = Math.round(currentWorldPos.x - previewDragState.startWorldPos!.x);
		const targetOffsetY = Math.round(currentWorldPos.y - previewDragState.startWorldPos!.y);

		// Only move if the target offset has changed
		if (targetOffsetX !== previewDragState.lastAppliedOffset.x || targetOffsetY !== previewDragState.lastAppliedOffset.y) {
			const deltaX = targetOffsetX - previewDragState.lastAppliedOffset.x;
			const deltaY = targetOffsetY - previewDragState.lastAppliedOffset.y;

			// Move all preview pixels by the delta
			moveAllPreviewPixels(deltaX, deltaY);

			// Update last applied offset
			previewDragState.lastAppliedOffset = { x: targetOffsetX, y: targetOffsetY };
		}
	}

	// Return true if we're in dragging state, even before threshold is reached
	return previewDragState.isDragging;
}

function finishPreviewDrag() {
	const wasDragging = previewDragState.isDragging;
	const hasMoved = previewDragState.hasMoved;

	previewDragState = {
		isDragging: false,
		startPos: null,
		startWorldPos: null,
		hasMoved: false,
		lastAppliedOffset: { x: 0, y: 0 }
	};

	if (wasDragging) {
		(state.app.view as HTMLCanvasElement).style.cursor = 'default';
	}

	return { wasDragging, hasMoved };
}

// Helper functions for paint dragging
function startPaintDrag(screenX: number, screenY: number): boolean {
	if (!state.selectedColor) {
		return false;
	}

	const worldPos = screenToWorld(screenX, screenY);
	const pixelX = Math.floor(worldPos.x);
	const pixelY = Math.floor(worldPos.y);

	// Check if the position is within bounds
	if (pixelX < 0 || pixelX >= WORLD_SIZE || pixelY < 0 || pixelY >= WORLD_SIZE) {
		return false;
	}

	// Enter preview mode if not already active
	if (!state.previewState.isActive) {
		state.enterPreviewMode();
	}

	paintDragState = {
		isDragging: true,
		lastPixel: { x: pixelX, y: pixelY }
	};

	// Place the first pixel
	state.addPreviewPixel(pixelX, pixelY, state.selectedColor);
	return true;
}

function updatePaintDrag(screenX: number, screenY: number): boolean {
	if (!paintDragState.isDragging || !state.selectedColor) {
		return false;
	}

	const worldPos = screenToWorld(screenX, screenY);
	const pixelX = Math.floor(worldPos.x);
	const pixelY = Math.floor(worldPos.y);

	// Check if the position is within bounds
	if (pixelX < 0 || pixelX >= WORLD_SIZE || pixelY < 0 || pixelY >= WORLD_SIZE) {
		return true; // Still dragging, just outside bounds
	}

	// Only place pixel if we've moved to a different pixel position
	if (!paintDragState.lastPixel ||
		paintDragState.lastPixel.x !== pixelX ||
		paintDragState.lastPixel.y !== pixelY) {

		// Draw a line of pixels from last position to current position
		if (paintDragState.lastPixel) {
			drawPixelLine(paintDragState.lastPixel.x, paintDragState.lastPixel.y, pixelX, pixelY, state.selectedColor);
		} else {
			// First pixel
			state.addPreviewPixel(pixelX, pixelY, state.selectedColor);
		}

		paintDragState.lastPixel = { x: pixelX, y: pixelY };
	}

	return true;
}

function finishPaintDrag(): boolean {
	const wasDragging = paintDragState.isDragging;
	paintDragState = {
		isDragging: false,
		lastPixel: null
	};
	return wasDragging;
}

// Helper function to draw a line of pixels between two points using Bresenham's algorithm
function drawPixelLine(x0: number, y0: number, x1: number, y1: number, color: string) {
	const dx = Math.abs(x1 - x0);
	const dy = Math.abs(y1 - y0);
	const sx = x0 < x1 ? 1 : -1;
	const sy = y0 < y1 ? 1 : -1;
	let err = dx - dy;

	let x = x0;
	let y = y0;

	while (true) {
		// Place pixel if within bounds
		if (x >= 0 && x < WORLD_SIZE && y >= 0 && y < WORLD_SIZE) {
			state.addPreviewPixel(x, y, color);
		}

		// Check if we've reached the end point
		if (x === x1 && y === y1) break;

		const e2 = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
	}
}

export function setupInput() {
	// Handle URL changes
	window.addEventListener('hashchange', loadFromURL);

	// Prevent context menu on right click
	(state.app.view as HTMLCanvasElement).addEventListener('contextmenu', (e) => e.preventDefault());

	// Keyboard controls for movement
	window.addEventListener('keydown', handleKeyDown);

	// Handle resize
	window.addEventListener('resize', handleResize);

	// Setup PIXI events for mouse interactions
	state.app.stage.on('pointerdown', handlePointerDown);
	state.app.stage.on('pointermove', handlePointerMove);
	state.app.stage.on('pointerup', handlePointerUp);
	state.app.stage.on('pointerupoutside', handlePointerUp);
	state.app.stage.on('pointerleave', handlePointerLeave);
	state.app.stage.on('wheel', handleWheel);

	// Setup Hammer.js for touch gestures
	setupHammerJS();
}

function setupHammerJS() {
	const canvas = state.app.view as HTMLCanvasElement;

	// Create Hammer instance
	hammer = new Hammer.Manager(canvas);

	// Add recognizers
	const pan = new Hammer.Pan({ direction: Hammer.DIRECTION_ALL, threshold: 0 });
	const pinch = new Hammer.Pinch();
	const tap = new Hammer.Tap();
	const press = new Hammer.Press({ time: TOUCH_HOLD_DURATION });

	// Add recognizers to manager
	hammer.add([pan, pinch, tap, press]);

	// Allow simultaneous recognition of pan and pinch
	pinch.recognizeWith(pan);

	// Set up gesture event listeners
	hammer.on('panstart', handlePanStart);
	hammer.on('panmove', handlePanMove);
	hammer.on('panend', handlePanEnd);

	hammer.on('pinchstart', handlePinchStart);
	hammer.on('pinchmove', handlePinchMove);
	hammer.on('pinchend', handlePinchEnd);

	hammer.on('tap', handleTap);
	hammer.on('press', handleTap);
}

// Check and show tooltip for center pixel on touch devices
async function checkCenterPixelTooltip() {
	const centerPixel = getCenterPixel();
	const pixelKey = `${centerPixel.x},${centerPixel.y}`;

	// Only update if center pixel has changed
	if (pixelKey === lastCenterPixelKey) return;

	lastCenterPixelKey = pixelKey;

	// Check if this pixel has tooltip information
	const pixelInfo = await checkPixelHover(centerPixel.x, centerPixel.y);
	if (pixelInfo) {
		// Show tooltip at center of screen for touch devices
		const centerX = state.app.screen.width / 2;
		const centerY = state.app.screen.height / 2;
		showPixelTooltip(centerX, centerY, pixelInfo.message, pixelInfo.profile, pixelInfo.timestamp);
	} else {
		hidePixelTooltip();
	}
}

// Hammer.js gesture handlers
function handlePanStart(event: HammerInput) {
	if (event.pointerType !== 'touch') return;

	// Try to start preview pixel dragging first (highest priority)
	if (startPreviewDrag(event.center.x, event.center.y)) {
		return;
	}

	// Disable paint dragging for now on touch.
	// // Try paint dragging next if we have a selected color
	// if (state.selectedColor) {
	// 	if (startPaintDrag(event.center.x, event.center.y)) {
	// 		return;
	// 	}
	// }

	// Handle pan for camera movement (fallback)
	state.updatePointerState({
		isDragging: true,
		lastPos: { x: event.center.x, y: event.center.y }
	});
	(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
	// Check for tooltip on center pixel when touch starts
	checkCenterPixelTooltip();
}

function handlePanMove(event: HammerInput) {
	if (event.pointerType !== 'touch') return;

	// Handle paint dragging first
	if (updatePaintDrag(event.center.x, event.center.y)) {
		return;
	}

	// Handle preview pixel dragging
	if (updatePreviewDrag(event.center.x, event.center.y)) {
		return;
	}

	// Handle camera panning for both single finger and during pinch
	if (state.pointerState.isDragging) {
		const dx = event.center.x - state.pointerState.lastPos.x;
		const dy = event.center.y - state.pointerState.lastPos.y;

		state.updateCamera({
			x: state.camera.x - dx / state.camera.scale,
			y: state.camera.y - dy / state.camera.scale
		});

		state.updatePointerState({
			lastPos: { x: event.center.x, y: event.center.y }
		});

		// Check for tooltip on center pixel for touch devices
		checkCenterPixelTooltip();
	}
}

function handlePanEnd(event: HammerInput) {
	if (event.pointerType !== 'touch') return;

	// Handle paint dragging completion first
	if (finishPaintDrag()) {
		return;
	}

	// Handle preview pixel dragging completion
	const { wasDragging } = finishPreviewDrag();
	if (wasDragging) {
		return;
	}

	// Only stop camera panning when all fingers are lifted
	if (event.pointers.length === 0) {
		state.updatePointerState({ isDragging: false });
		(state.app.view as HTMLCanvasElement).style.cursor = 'default';
		// Check for tooltip on center pixel when panning ends
		checkCenterPixelTooltip();
	}
}

let pinchStartData: { scale: number; center: { x: number; y: number }; lastCenter: { x: number; y: number } } | null = null;

function handlePinchStart(event: HammerInput) {
	if (event.pointerType !== 'touch') return;
	pinchStartData = {
		scale: state.camera.scale,
		center: { x: event.center.x, y: event.center.y },
		lastCenter: { x: event.center.x, y: event.center.y }
	};

	// Keep panning active during pinch for simultaneous pan and zoom
}

function handlePinchMove(event: HammerInput) {
	if (event.pointerType !== 'touch') return;
	if (!pinchStartData) return;

	const currentCenter = { x: event.center.x, y: event.center.y };

	// Handle paint dragging during pinch if active
	if (updatePaintDrag(currentCenter.x, currentCenter.y)) {
		// If paint dragging, skip panning but continue with zoom
	} else {
		// Handle preview pixel dragging during pinch if active
		updatePreviewDrag(currentCenter.x, currentCenter.y);
	}

	// Handle panning: check if center has moved since last frame
	const dx = currentCenter.x - pinchStartData.lastCenter.x;
	const dy = currentCenter.y - pinchStartData.lastCenter.y;

	if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
		// Apply panning based on center movement (only if not dragging preview pixels or paint dragging)
		if ((!previewDragState.isDragging || !previewDragState.hasMoved) && !paintDragState.isDragging) {
			state.updateCamera({
				x: state.camera.x - dx / state.camera.scale,
				y: state.camera.y - dy / state.camera.scale
			});
		}
	}

	// Handle zooming
	const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, pinchStartData.scale * event.scale));

	// Get world position at current pinch center before zoom
	const worldPosBeforeZoom = screenToWorld(currentCenter.x, currentCenter.y);

	// Apply new scale
	state.updateCamera({ scale: newScale });

	// Get world position at current pinch center after zoom
	const worldPosAfterZoom = screenToWorld(currentCenter.x, currentCenter.y);

	// Adjust camera position to keep the same world position under the pinch center
	state.updateCamera({
		x: state.camera.x + worldPosBeforeZoom.x - worldPosAfterZoom.x,
		y: state.camera.y + worldPosBeforeZoom.y - worldPosAfterZoom.y
	});

	// Update last center for next frame
	pinchStartData.lastCenter = currentCenter;

	// Check for tooltip on center pixel for touch devices
	checkCenterPixelTooltip();
}

function handlePinchEnd(event: HammerInput) {
	if (event.pointerType !== 'touch') return;
	pinchStartData = null;

	// Reset paint drag state if it was active during pinch
	finishPaintDrag();

	// Reset preview drag state if it was active during pinch
	finishPreviewDrag();

	// Check for tooltip on center pixel when pinching ends
	checkCenterPixelTooltip();
}

async function handleTap(event: HammerInput) {
	if (event.pointerType !== 'touch') return;

	// If we had a drag operation that moved, don't handle as tap
	if (previewDragState.hasMoved) {
		return;
	}

	// Handle tap for pixel placement (similar to mouse click)
	if (state.selectedColor) {
		const worldPos = screenToWorld(event.center.x, event.center.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			// Check if pixel modal should be shown first (for non-preview mode)
			if (!state.previewState.isActive) {
				const pixelInfo = await checkPixelClick(worldPos.x, worldPos.y);
				if (pixelInfo) {
					// Prevent event propagation to avoid clicking modal buttons immediately
					event.preventDefault();
					event.srcEvent.preventDefault();
					event.srcEvent.stopPropagation();

					// Small delay to ensure the tap doesn't interfere with modal interaction
					setTimeout(() => {
						showPixelModal(pixelInfo.message, pixelInfo.url, pixelInfo.profile, pixelInfo.timestamp);
					}, 50);
					return;
				}
			}

			// Enter preview mode if not already active
			if (!state.previewState.isActive) {
				state.enterPreviewMode();
			}
			togglePreviewPixel(pixelX, pixelY, state.selectedColor);
			// Provide haptic feedback
			if (navigator.vibrate) {
				navigator.vibrate(1);
			}
		}
	}
}

function handleKeyDown(event: KeyboardEvent) {
	// Check if user is typing in an input field - if so, don't handle WASD controls
	const activeElement = document.activeElement;
	const isTyping = activeElement && (
		activeElement.tagName === 'INPUT' ||
		activeElement.tagName === 'TEXTAREA' ||
		activeElement.tagName === 'SELECT' ||
		(activeElement as HTMLElement).contentEditable === 'true'
	);

	// Skip WASD camera movement if user is typing in an input field
	if (!isTyping) {
		// Camera movement (WASD or Arrow keys)
		const moveSpeed = 50 / state.camera.scale; // Slower movement when zoomed in

		if (event.key === '=' || event.key === '+') {
			event.preventDefault();
			const centerX = state.app.screen.width / 2;
			const centerY = state.app.screen.height / 2;
			const newScale = state.camera.scale * 1.2;
			smoothZoomToPoint(newScale, centerX, centerY);
		} else if (event.key === '-' || event.key === '_') {
			event.preventDefault();
			const centerX = state.app.screen.width / 2;
			const centerY = state.app.screen.height / 2;
			const newScale = state.camera.scale / 1.2;
			smoothZoomToPoint(newScale, centerX, centerY);
		} else if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') {
			event.preventDefault();
			state.updateCamera({
				y: state.camera.y - moveSpeed
			});
			checkCenterPixelTooltip();
		} else if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') {
			event.preventDefault();
			state.updateCamera({
				y: state.camera.y + moveSpeed
			});
			checkCenterPixelTooltip();
		} else if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
			event.preventDefault();
			state.updateCamera({
				x: state.camera.x - moveSpeed
			});
			checkCenterPixelTooltip();
		} else if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') {
			event.preventDefault();
			state.updateCamera({
				x: state.camera.x + moveSpeed
			});
			checkCenterPixelTooltip();
		}
	}

	// Preview mode shortcuts
	if (state.previewState.isActive) {
		if (event.key === 'Escape') {
			event.preventDefault();
			state.exitPreviewMode();
			return;
		}
	}
}

async function handlePointerDown(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	const globalPos = event.global;

	if (event.button === 0) {
		// Check if pixel modal should be shown first (for non-preview mode)
		if (!state.previewState.isActive) {
			const worldPos = screenToWorld(globalPos.x, globalPos.y);
			const pixelInfo = await checkPixelClick(worldPos.x, worldPos.y);
			if (pixelInfo) {
				showPixelModal(pixelInfo.message, pixelInfo.url, pixelInfo.profile, pixelInfo.timestamp);
				return; // Modal was shown, don't handle preview pixel placement
			}
		}

		// Try to start preview pixel dragging first
		if (startPreviewDrag(globalPos.x, globalPos.y)) {
			return;
		}

		// Try paint dragging next if we have a selected color
		if (state.selectedColor) {
			if (startPaintDrag(globalPos.x, globalPos.y)) {
				return;
			}
		}

		// For mouse: place pixel at cursor position in preview mode
		if (state.pointerState.mouseCursorPixel && state.selectedColor) {
			const pixelX = state.pointerState.mouseCursorPixel.x;
			const pixelY = state.pointerState.mouseCursorPixel.y;

			if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
				// Enter preview mode if not already active
				if (!state.previewState.isActive) {
					state.enterPreviewMode();
				}
				togglePreviewPixel(pixelX, pixelY, state.selectedColor);
			}
		}
	} else if (event.button === 2 || event.button === 1) { // Right click or middle click - start panning
		state.updatePointerState({
			isDragging: true,
			lastPos: { x: globalPos.x, y: globalPos.y }
		});
		(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
	}
}

function handlePointerMove(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	const globalPos = event.global;
	// Update mouse cursor position and coordinates display for mouse events
	const worldPos = screenToWorld(globalPos.x, globalPos.y);
	const pixelX = Math.floor(worldPos.x);
	const pixelY = Math.floor(worldPos.y);

	if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
		state.updatePointerState({
			mouseCursorPixel: { x: pixelX, y: pixelY }
		});
	} else {
		state.updatePointerState({
			mouseCursorPixel: null
		});
	}

	// Handle paint dragging first
	if (updatePaintDrag(globalPos.x, globalPos.y)) {
		return;
	}

	// Handle preview pixel dragging
	if (updatePreviewDrag(globalPos.x, globalPos.y)) {
		return;
	}

	if (state.pointerState.isDragging) {
		// Handle camera panning for mouse
		const dx = globalPos.x - state.pointerState.lastPos.x;
		const dy = globalPos.y - state.pointerState.lastPos.y;

		state.updateCamera({
			x: state.camera.x - dx / state.camera.scale,
			y: state.camera.y - dy / state.camera.scale
		});

		state.updatePointerState({
			lastPos: { x: globalPos.x, y: globalPos.y }
		});
	} else {
		// Check for pixel hover (show tooltip)
		checkPixelHover(worldPos.x, worldPos.y).then(pixelInfo => {
			showPixelTooltip(globalPos.x, globalPos.y, pixelInfo!.message, pixelInfo!.profile, pixelInfo!.timestamp);
		}).catch(() => {
			hidePixelTooltip();
		});
	}
}

function handlePointerUp(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	// Handle paint dragging completion first
	if (finishPaintDrag()) {
		return;
	}

	// Handle preview pixel dragging completion
	const { wasDragging, hasMoved } = finishPreviewDrag();
	if (wasDragging) {
		if (!hasMoved) {
			// This was a tap/click without drag, handle pixel placement/removal
			const globalPos = event.global;
			const worldPos = screenToWorld(globalPos.x, globalPos.y);
			const pixelX = Math.floor(worldPos.x);
			const pixelY = Math.floor(worldPos.y);

			if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE && state.selectedColor) {
				togglePreviewPixel(pixelX, pixelY, state.selectedColor);
			}
		}
		return;
	}

	// Stop dragging for mouse events
	state.updatePointerState({ isDragging: false });
	(state.app.view as HTMLCanvasElement).style.cursor = 'default';
}

function handlePointerLeave(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	// Clean up paint dragging state
	finishPaintDrag();

	// Hide tooltip when mouse leaves canvas
	hidePixelTooltip();

	// Clear mouse cursor position
	state.updatePointerState({
		mouseCursorPixel: null
	});

	// Stop dragging for mouse events
	state.updatePointerState({ isDragging: false });
	(state.app.view as HTMLCanvasElement).style.cursor = 'crosshair';
}

function handleWheel(event: PIXI.FederatedWheelEvent) {
	event.preventDefault();

	const pointer = event.global;
	const zoomFactor = event.deltaY > 0 ? 1 / 1.2 : 1.2;
	const newScale = state.camera.scale * zoomFactor;

	smoothZoomToPoint(newScale, pointer.x, pointer.y);
}

function handleResize() {
	state.app.renderer.resize(window.innerWidth, window.innerHeight); // Full window height
}

function togglePreviewPixel(x: number, y: number, color: string) {
	const pixelKey = `${x},${y}`;
	const existingPreviewPixel = state.previewState.pixels.get(pixelKey);

	if (existingPreviewPixel) {
		// If the color is the same, remove the pixel (toggle off)
		if (existingPreviewPixel.color === color) {
			state.removePreviewPixel(x, y);
		} else {
			// If the color is different, update the pixel with the new color
			state.addPreviewPixel(x, y, color);
		}
	} else {
		// No existing preview pixel, add new one
		state.addPreviewPixel(x, y, color);
	}
}

function moveAllPreviewPixels(worldDx: number, worldDy: number) {
	if (state.previewState.pixels.size === 0) return;

	// Get all current preview pixels
	const currentPixels = Array.from(state.previewState.pixels.values());

	// Clear current preview pixels
	state.previewState.pixels.clear();

	// Move each pixel and add back if within bounds
	for (const pixel of currentPixels) {
		const newX = pixel.x + worldDx;
		const newY = pixel.y + worldDy;

		// Only add the pixel back if it's within world bounds
		if (newX >= 0 && newX < WORLD_SIZE && newY >= 0 && newY < WORLD_SIZE) {
			const newPixelKey = `${newX},${newY}`;
			state.previewState.pixels.set(newPixelKey, {
				x: newX,
				y: newY,
				color: pixel.color
			});
		}
	}

	// Update cost breakdown after moving pixels
	state.updateCostBreakdown();
}

// Add hover detection for pixel messages
export async function checkPixelHover(worldX: number, worldY: number): Promise<{ message?: string; url?: string; profile?: any; timestamp?: number } | null> {
	const pixelX = Math.floor(worldX);
	const pixelY = Math.floor(worldY);

	// Check Nostr canvas pixels
	const nostrPixelEvent = nostrService.canvas.getPixelEvent(pixelX, pixelY);
	if (nostrPixelEvent) {
		let profile = null;

		// Fetch profile if we have a sender pubkey
		if (nostrPixelEvent.senderPubkey) {
			try {
				// For hover, we try to get profile quickly (will return cached if available)
				profile = await nostrService.canvas.fetchProfile(nostrPixelEvent.senderPubkey);
			} catch (error) {
				console.warn('Failed to fetch profile for hover:', error);
			}
		}

		if (nostrPixelEvent.message || nostrPixelEvent.url || profile) {
			return {
				message: nostrPixelEvent.message,
				url: nostrPixelEvent.url,
				profile: profile,
				timestamp: nostrPixelEvent.timestamp
			};
		}
	}

	return null;
}

// Add click handling for pixel modal
export async function checkPixelClick(worldX: number, worldY: number): Promise<{ message?: string; url?: string; profile?: any; timestamp?: number } | null> {
	const pixelX = Math.floor(worldX);
	const pixelY = Math.floor(worldY);

	// Check Nostr canvas pixels
	const nostrPixelEvent = nostrService.canvas.getPixelEvent(pixelX, pixelY);
	if (nostrPixelEvent) {
		let profile = null;

		// Fetch profile if we have a sender pubkey
		if (nostrPixelEvent.senderPubkey) {
			try {
				// For click events, we wait for the profile to load
				profile = await nostrService.canvas.fetchProfile(nostrPixelEvent.senderPubkey);
			} catch (error) {
				console.warn('Failed to fetch profile:', error);
				// Still return pixel info even if profile fetch fails
			}
		}

		if (nostrPixelEvent.message || nostrPixelEvent.url || profile) {
			return {
				message: nostrPixelEvent.message,
				url: nostrPixelEvent.url,
				profile: profile,
				timestamp: nostrPixelEvent.timestamp
			};
		}
	}

	return null;
} 