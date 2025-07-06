import * as PIXI from 'pixi.js';
import { getCenterPixel, screenToWorld, smoothZoomToPoint } from './camera';
import { MAX_SCALE, MIN_SCALE, WORLD_SIZE } from './constants';
import { loadFromURL } from './persistence';
import { state } from './state';

// Touch control constants
const TOUCH_HOLD_DURATION = 150; // milliseconds to hold for placing pixel
const TOUCH_MOVE_THRESHOLD = 10; // pixels to move before canceling hold
const PINCH_THRESHOLD = 10; // minimum distance change to start pinch

export function setupInput() {
	// Handle URL changes
	window.addEventListener('hashchange', loadFromURL);

	// Prevent context menu on right click
	(state.app.view as HTMLCanvasElement).addEventListener('contextmenu', (e) => e.preventDefault());

	// Keyboard controls for movement
	window.addEventListener('keydown', handleKeyDown);

	// Handle resize
	window.addEventListener('resize', handleResize);

	// Setup PIXI events
	state.app.stage.on('pointerdown', handlePointerDown);
	state.app.stage.on('pointermove', handlePointerMove);
	state.app.stage.on('pointerup', handlePointerUp);
	state.app.stage.on('pointerupoutside', handlePointerUp);
	state.app.stage.on('pointerleave', handlePointerLeave);
	state.app.stage.on('wheel', handleWheel);
}

// Helper function to calculate distance between two points
function calculateDistance(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
	const dx = p2.x - p1.x;
	const dy = p2.y - p1.y;
	return Math.sqrt(dx * dx + dy * dy);
}

// Helper function to calculate center point between two touches
function calculateCenter(p1: { x: number; y: number }, p2: { x: number; y: number }): { x: number; y: number } {
	return {
		x: (p1.x + p2.x) / 2,
		y: (p1.y + p2.y) / 2
	};
}

// Helper function to handle pinch gesture
function handlePinchGesture() {
	if (state.touchState.activeTouches.size !== 2) return;

	const touches = Array.from(state.touchState.activeTouches.values());
	const currentDistance = calculateDistance(touches[0], touches[1]);
	const currentCenter = calculateCenter(touches[0], touches[1]);

	if (!state.touchState.isPinching) {
		// Start pinch if distance changed enough
		const initialDistance = state.touchState.pinchStartDistance;
		if (Math.abs(currentDistance - initialDistance) > PINCH_THRESHOLD) {
			state.updateTouchState({
				isPinching: true,
				pinchCenter: currentCenter
			});
			// Cancel hold timer when pinching starts
			cancelTouchHold();
		}
		return;
	}

	// Continue pinch gesture
	const scale = currentDistance / state.touchState.pinchStartDistance;
	const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.touchState.pinchStartScale * scale));

	// Get world position at pinch center before zoom
	const worldPosBeforeZoom = screenToWorld(state.touchState.pinchCenter!.x, state.touchState.pinchCenter!.y);

	// Apply new scale
	state.updateCamera({ scale: newScale });

	// Get world position at pinch center after zoom
	const worldPosAfterZoom = screenToWorld(state.touchState.pinchCenter!.x, state.touchState.pinchCenter!.y);

	// Adjust camera position to keep the same world position under the pinch center
	state.updateCamera({
		x: state.camera.x + worldPosBeforeZoom.x - worldPosAfterZoom.x,
		y: state.camera.y + worldPosBeforeZoom.y - worldPosAfterZoom.y
	});
}

function handleKeyDown(event: KeyboardEvent) {
	// Zoom controls (zoom to center)
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
	}

	// Camera movement (WASD or Arrow keys)
	const moveSpeed = 50 / state.camera.scale; // Slower movement when zoomed in

	if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') {
		event.preventDefault();
		state.updateCamera({
			y: state.camera.y - moveSpeed
		});
	} else if (event.key === 's' || event.key === 'S' || event.key === 'ArrowDown') {
		event.preventDefault();
		state.updateCamera({
			y: state.camera.y + moveSpeed
		});
	} else if (event.key === 'a' || event.key === 'A' || event.key === 'ArrowLeft') {
		event.preventDefault();
		state.updateCamera({
			x: state.camera.x - moveSpeed
		});
	} else if (event.key === 'd' || event.key === 'D' || event.key === 'ArrowRight') {
		event.preventDefault();
		state.updateCamera({
			x: state.camera.x + moveSpeed
		});
	}

	// Preview mode shortcuts
	if (state.previewState.isActive) {
		if (event.key === 'Escape') {
			event.preventDefault();
			state.exitPreviewMode();
			return;
		} else if (event.key === 'Enter') {
			event.preventDefault();
			if (state.previewState.pixels.size > 0) {
				// Trigger submit (same as clicking submit button)
				const submitBtn = document.getElementById('preview-submit') as HTMLButtonElement;
				if (submitBtn && !submitBtn.disabled) {
					submitBtn.click();
				}
			}
			return;
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			state.clearPreviewPixels();
			return;
		}
	}
}

function startTouchHold(globalPos: { x: number; y: number }) {
	// Only start hold for single touch
	if (state.touchState.activeTouches.size !== 1) return;

	// Clear any existing hold timer
	if (state.touchState.holdTimer) {
		clearTimeout(state.touchState.holdTimer);
	}

	state.updateTouchState({
		touchStartPos: { x: globalPos.x, y: globalPos.y },
		holdTimer: setTimeout(() => {
			// Place pixel at center position in preview mode
			const centerPixel = getCenterPixel();
			if (centerPixel.x >= 0 && centerPixel.x < WORLD_SIZE && centerPixel.y >= 0 && centerPixel.y < WORLD_SIZE && state.selectedColor) {
				// Enter preview mode if not already active
				if (!state.previewState.isActive) {
					state.enterPreviewMode();
				}
				togglePreviewPixel(centerPixel.x, centerPixel.y, state.selectedColor);
				navigator?.vibrate(10);
			}
			state.updateTouchState({ holdTimer: null });
		}, TOUCH_HOLD_DURATION)
	});
}

function cancelTouchHold() {
	if (state.touchState.holdTimer) {
		clearTimeout(state.touchState.holdTimer);
		state.updateTouchState({
			holdTimer: null,
			touchStartPos: null
		});
	}
}

function handlePointerDown(event: PIXI.FederatedPointerEvent) {
	const globalPos = event.global;

	// Check if this is a touch event
	const isTouch = event.pointerType === 'touch';

	if (isTouch) {
		// Prevent default touch behaviors that cause vibration
		event.preventDefault();

		// Mark that touch controls have been used
		state.updateTouchState({ hasTouchBeenUsed: true });

		// Track this touch
		state.touchState.activeTouches.set(event.pointerId, { x: globalPos.x, y: globalPos.y });

		if (state.touchState.activeTouches.size === 1) {
			// Single touch: start camera panning and hold timer
			state.updatePointerState({
				isDragging: true,
				lastPos: { x: globalPos.x, y: globalPos.y }
			});
			startTouchHold(globalPos);
			(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
		} else if (state.touchState.activeTouches.size === 2) {
			// Two touches: prepare for pinch gesture
			const touches = Array.from(state.touchState.activeTouches.values());
			const distance = calculateDistance(touches[0], touches[1]);

			state.updateTouchState({
				pinchStartDistance: distance,
				pinchStartScale: state.camera.scale,
				isPinching: false
			});

			// Stop camera panning when second touch starts
			state.updatePointerState({ isDragging: false });
			// Cancel hold timer when second touch starts
			cancelTouchHold();
			(state.app.view as HTMLCanvasElement).style.cursor = 'default';
		}
	} else if (event.button === 0) { // Left click (mouse)
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
	const globalPos = event.global;

	// Update touch position if it's a touch event
	if (event.pointerType === 'touch' && state.touchState.activeTouches.has(event.pointerId)) {
		// Prevent default touch behaviors
		event.preventDefault();

		state.touchState.activeTouches.set(event.pointerId, { x: globalPos.x, y: globalPos.y });

		// Handle pinch gesture
		if (state.touchState.activeTouches.size === 2) {
			handlePinchGesture();
			return; // Don't handle camera panning during pinch
		}
	}

	if (state.pointerState.isDragging && state.touchState.activeTouches.size <= 1) {
		// Handle camera panning (only for single touch or mouse)
		const dx = globalPos.x - state.pointerState.lastPos.x;
		const dy = globalPos.y - state.pointerState.lastPos.y;

		// For touch: check if we've moved enough to cancel hold
		if (state.touchState.holdTimer !== null && state.touchState.touchStartPos) {
			const touchDx = Math.abs(globalPos.x - state.touchState.touchStartPos.x);
			const touchDy = Math.abs(globalPos.y - state.touchState.touchStartPos.y);

			if (touchDx > TOUCH_MOVE_THRESHOLD || touchDy > TOUCH_MOVE_THRESHOLD) {
				cancelTouchHold();
			}
		}

		state.updateCamera({
			x: state.camera.x - dx / state.camera.scale,
			y: state.camera.y - dy / state.camera.scale
		});

		state.updatePointerState({
			lastPos: { x: globalPos.x, y: globalPos.y }
		});
	} else if (event.pointerType !== 'touch') {
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
	}
}

function handlePointerUp(event: PIXI.FederatedPointerEvent) {
	// Remove touch from tracking
	if (event.pointerType === 'touch') {
		// Prevent default touch behaviors
		event.preventDefault();

		state.touchState.activeTouches.delete(event.pointerId);

		// Reset pinch state when no touches remain
		if (state.touchState.activeTouches.size === 0) {
			state.updateTouchState({
				isPinching: false,
				pinchStartDistance: 0,
				pinchStartScale: 1,
				pinchCenter: null
			});
		} else if (state.touchState.activeTouches.size === 1) {
			// Back to single touch - resume camera panning
			const remainingTouch = Array.from(state.touchState.activeTouches.values())[0];
			state.updatePointerState({
				isDragging: true,
				lastPos: { x: remainingTouch.x, y: remainingTouch.y }
			});
			(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
		}
	}

	// Cancel touch hold if active and no touches remain
	if (state.touchState.activeTouches.size === 0) {
		cancelTouchHold();
	}

	// Stop dragging if no touches remain or it's a mouse event
	if (state.touchState.activeTouches.size === 0 || event.pointerType !== 'touch') {
		state.updatePointerState({ isDragging: false });
		(state.app.view as HTMLCanvasElement).style.cursor = 'default';
	}
}

function handlePointerLeave(event: PIXI.FederatedPointerEvent) {
	// Cancel touch hold if active
	cancelTouchHold();

	// Clear mouse cursor position if it's a mouse event
	if (event.pointerType !== 'touch') {
		state.updatePointerState({ mouseCursorPixel: null });
	}

	// Clear all touch tracking
	state.updateTouchState({
		activeTouches: new Map(),
		isPinching: false,
		pinchStartDistance: 0,
		pinchStartScale: 1,
		pinchCenter: null
	});

	// Stop dragging
	state.updatePointerState({ isDragging: false });
	(state.app.view as HTMLCanvasElement).style.cursor = 'default';
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