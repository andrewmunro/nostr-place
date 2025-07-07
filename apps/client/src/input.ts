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

// Hammer.js instance
let hammer: HammerManager | null = null;

// Touch tooltip state
let lastCenterPixelKey: string | null = null;

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
function checkCenterPixelTooltip() {
	const centerPixel = getCenterPixel();
	const pixelKey = `${centerPixel.x},${centerPixel.y}`;

	// Only update if center pixel has changed
	if (pixelKey === lastCenterPixelKey) return;

	lastCenterPixelKey = pixelKey;

	// Check if this pixel has tooltip information
	const pixelInfo = checkPixelHover(centerPixel.x, centerPixel.y);
	if (pixelInfo && pixelInfo.message) {
		// Show tooltip at center of screen for touch devices
		const centerX = state.app.screen.width / 2;
		const centerY = state.app.screen.height / 2;
		showPixelTooltip(centerX, centerY, pixelInfo.message);
	} else {
		hidePixelTooltip();
	}
}

// Hammer.js gesture handlers
function handlePanStart(event: HammerInput) {
	if (event.pointerType !== 'touch') return;
	// Handle pan for both single finger and during pinch
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
	// Handle pan for both single finger and during pinch
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
	// Only stop panning when all fingers are lifted
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

	// Handle panning: check if center has moved since last frame
	const dx = currentCenter.x - pinchStartData.lastCenter.x;
	const dy = currentCenter.y - pinchStartData.lastCenter.y;

	if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
		// Apply panning based on center movement
		state.updateCamera({
			x: state.camera.x - dx / state.camera.scale,
			y: state.camera.y - dy / state.camera.scale
		});
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
	// Check for tooltip on center pixel when pinching ends
	checkCenterPixelTooltip();
}

function handleTap(event: HammerInput) {
	if (event.pointerType !== 'touch') return;
	// Handle tap for pixel placement (similar to mouse click)
	if (state.selectedColor) {
		const worldPos = screenToWorld(event.center.x, event.center.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			// Check if pixel modal should be shown first (for non-preview mode)
			if (!state.previewState.isActive) {
				const pixelInfo = checkPixelClick(worldPos.x, worldPos.y);
				if (pixelInfo) {
					// Prevent event propagation to avoid clicking modal buttons immediately
					event.preventDefault();
					event.srcEvent.preventDefault();
					event.srcEvent.stopPropagation();

					// Small delay to ensure the tap doesn't interfere with modal interaction
					setTimeout(() => {
						showPixelModal(pixelInfo.message, pixelInfo.url);
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

	// Zoom controls (zoom to center) - allow these even when typing
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

	// Skip WASD camera movement if user is typing in an input field
	if (!isTyping) {
		// Camera movement (WASD or Arrow keys)
		const moveSpeed = 50 / state.camera.scale; // Slower movement when zoomed in

		if (event.key === 'w' || event.key === 'W' || event.key === 'ArrowUp') {
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

function handlePointerDown(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	const globalPos = event.global;

	// Check if pixel modal should be shown first (for non-preview mode)
	if (!state.previewState.isActive && event.button === 0) {
		const worldPos = screenToWorld(globalPos.x, globalPos.y);
		const pixelInfo = checkPixelClick(worldPos.x, worldPos.y);
		if (pixelInfo) {
			showPixelModal(pixelInfo.message, pixelInfo.url);
			return; // Modal was shown, don't handle preview pixel placement
		}
	}

	if (event.button === 0) { // Left click (mouse)
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

		// Check for pixel hover (show tooltip)
		const pixelInfo = checkPixelHover(worldPos.x, worldPos.y);
		if (pixelInfo && pixelInfo.message) {
			showPixelTooltip(globalPos.x, globalPos.y, pixelInfo.message);
		} else {
			hidePixelTooltip();
		}
	}
}

function handlePointerUp(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

	// Stop dragging for mouse events
	state.updatePointerState({ isDragging: false });
	(state.app.view as HTMLCanvasElement).style.cursor = 'default';
}

function handlePointerLeave(event: PIXI.FederatedPointerEvent) {
	// Only handle mouse events now (touch events are handled by Hammer.js)
	if (event.pointerType === 'touch') return;

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

// Add hover detection for pixel messages
export function checkPixelHover(worldX: number, worldY: number): { message?: string; url?: string } | null {
	const pixelX = Math.floor(worldX);
	const pixelY = Math.floor(worldY);

	// Check debug mode pixels first
	const debugPixelData = state.pixels.get(`${pixelX},${pixelY}`);
	if (debugPixelData) {
		// For debug mode, hardcode test messages for specific coordinates
		if (pixelX === 1000 && pixelY === 1000) {
			return { message: '🚀 Welcome to Zappy Place!', url: 'https://github.com/andrewmunro/zappy-place' };
		} else if (pixelX === 1001 && pixelY === 1000) {
			return { message: 'This is a test message for the tooltip system. Hover over me!' };
		} else if (pixelX === 1002 && pixelY === 1000) {
			return { message: 'Click me to see the modal!', url: 'https://nostr.com' };
		} else if (pixelX === 1003 && pixelY === 1000) {
			return { url: 'https://bitcoin.org' };
		} else if (pixelX === 1004 && pixelY === 1000) {
			return { message: '🎨 Collaborative pixel art powered by Nostr + Lightning!', url: 'https://zappy.place' };
		} else if (pixelX === 500 && pixelY === 500) {
			return { message: '🔥 This is awesome!' };
		} else if (pixelX === 501 && pixelY === 500) {
			return { message: '💎 HODL Bitcoin!', url: 'https://bitcoin.org' };
		} else if (pixelX === 502 && pixelY === 500) {
			return { message: '⚡ Lightning fast!' };
		} else if (pixelX === 500 && pixelY === 501) {
			return { message: '🌈 So many colors!' };
		} else if (pixelX === 501 && pixelY === 501) {
			return { message: 'Check out our repo!', url: 'https://github.com/andrewmunro/zappy-place' };
		}
	}

	// Check Nostr canvas pixels
	const nostrPixelEvent = nostrService.canvas.getPixelEvent(pixelX, pixelY);
	if (nostrPixelEvent && (nostrPixelEvent.message || nostrPixelEvent.url)) {
		return { message: nostrPixelEvent.message, url: nostrPixelEvent.url };
	}

	return null;
}

// Add click handling for pixel modal
export function checkPixelClick(worldX: number, worldY: number): { message?: string; url?: string } | null {
	const pixelX = Math.floor(worldX);
	const pixelY = Math.floor(worldY);

	// Check debug mode pixels first
	const debugPixelData = state.pixels.get(`${pixelX},${pixelY}`);
	if (debugPixelData) {
		// For debug mode, hardcode test messages for specific coordinates
		if (pixelX === 1000 && pixelY === 1000) {
			return { message: '🚀 Welcome to Zappy Place!', url: 'https://github.com/andrewmunro/zappy-place' };
		} else if (pixelX === 1001 && pixelY === 1000) {
			return { message: 'This is a test message for the tooltip system. Hover over me!' };
		} else if (pixelX === 1002 && pixelY === 1000) {
			return { message: 'Click me to see the modal!', url: 'https://nostr.com' };
		} else if (pixelX === 1003 && pixelY === 1000) {
			return { url: 'https://bitcoin.org' };
		} else if (pixelX === 1004 && pixelY === 1000) {
			return { message: '🎨 Collaborative pixel art powered by Nostr + Lightning!', url: 'https://zappy.place' };
		} else if (pixelX === 500 && pixelY === 500) {
			return { message: '🔥 This is awesome!' };
		} else if (pixelX === 501 && pixelY === 500) {
			return { message: '💎 HODL Bitcoin!', url: 'https://bitcoin.org' };
		} else if (pixelX === 502 && pixelY === 500) {
			return { message: '⚡ Lightning fast!' };
		} else if (pixelX === 500 && pixelY === 501) {
			return { message: '🌈 So many colors!' };
		} else if (pixelX === 501 && pixelY === 501) {
			return { message: 'Check out our repo!', url: 'https://github.com/andrewmunro/zappy-place' };
		}
	}

	// Check Nostr canvas pixels
	const nostrPixelEvent = nostrService.canvas.getPixelEvent(pixelX, pixelY);
	if (nostrPixelEvent && (nostrPixelEvent.message || nostrPixelEvent.url)) {
		return { message: nostrPixelEvent.message, url: nostrPixelEvent.url };
	}

	return null;
} 