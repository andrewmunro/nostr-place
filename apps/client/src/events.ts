import * as PIXI from 'pixi.js';
import { screenToWorld, updateCamera as updateCameraView, updateCoordinatesDisplay } from './camera';
import { WORLD_SIZE } from './constants';
import { loadFromURL, updateURL } from './persistence';
import { placePixel } from './pixels';
import { renderCursor, renderWorld } from './renderer';
import { state } from './state';
import { updatePaletteLayout } from './ui';

export function setupEventListeners() {
	// Handle URL changes
	window.addEventListener('hashchange', loadFromURL);

	// Prevent context menu on right click
	(state.app.view as HTMLCanvasElement).addEventListener('contextmenu', (e) => e.preventDefault());

	// Keyboard controls for movement
	window.addEventListener('keydown', handleKeyDown);

	// Handle resize
	window.addEventListener('resize', handleResize);

	// Update palette layout on window resize
	window.addEventListener('resize', updatePaletteLayout);

	// Setup PIXI events
	state.app.stage.on('pointerdown', handlePointerDown);
	state.app.stage.on('pointermove', handlePointerMove);
	state.app.stage.on('pointerup', handlePointerUp);
	state.app.stage.on('pointerupoutside', handlePointerUp);
	state.app.stage.on('pointerleave', handlePointerLeave);
	state.app.stage.on('wheel', handleWheel);
}

function handleKeyDown(event: KeyboardEvent) {
	const moveSpeed = 20 / state.camera.scale; // Move speed inversely proportional to zoom

	switch (event.key.toLowerCase()) {
		case 'w':
		case 'arrowup':
			state.updateCamera({ y: state.camera.y - moveSpeed });
			break;
		case 's':
		case 'arrowdown':
			state.updateCamera({ y: state.camera.y + moveSpeed });
			break;
		case 'a':
		case 'arrowleft':
			state.updateCamera({ x: state.camera.x - moveSpeed });
			break;
		case 'd':
		case 'arrowright':
			state.updateCamera({ x: state.camera.x + moveSpeed });
			break;
		default:
			return; // Don't prevent default for other keys
	}

	event.preventDefault();
	updateCameraView();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function handlePointerDown(event: PIXI.FederatedPointerEvent) {
	const globalPos = event.global;

	if (event.button === 0) { // Left click
		const worldPos = screenToWorld(globalPos.x, globalPos.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			// Handle async pixel placement
			placePixel(pixelX, pixelY, state.selectedColor).catch(error => {
				console.error('Error placing pixel:', error);
			});
		}
	} else if (event.button === 2 || event.button === 1) { // Right click or middle click - start panning
		state.updatePointerState({
			isDragging: true,
			lastPos: { x: globalPos.x, y: globalPos.y },
			cursorPixel: null
		});
		(state.app.view as HTMLCanvasElement).style.cursor = 'grabbing';
	}
}

function handlePointerMove(event: PIXI.FederatedPointerEvent) {
	const globalPos = event.global;

	if (state.pointerState.isDragging) {
		const dx = globalPos.x - state.pointerState.lastPos.x;
		const dy = globalPos.y - state.pointerState.lastPos.y;

		state.updateCamera({
			x: state.camera.x - dx / state.camera.scale,
			y: state.camera.y - dy / state.camera.scale
		});

		state.updatePointerState({
			lastPos: { x: globalPos.x, y: globalPos.y }
		});

		updateCameraView();
		updateURL();
		updateCoordinatesDisplay();
		renderWorld(); // Update grid and pixels when panning
	} else {
		// Update coordinates display and cursor preview
		const worldPos = screenToWorld(globalPos.x, globalPos.y);
		const pixelX = Math.floor(worldPos.x);
		const pixelY = Math.floor(worldPos.y);

		if (pixelX >= 0 && pixelX < WORLD_SIZE && pixelY >= 0 && pixelY < WORLD_SIZE) {
			state.updatePointerState({
				cursorPixel: { x: pixelX, y: pixelY }
			});
		} else {
			state.updatePointerState({
				cursorPixel: null
			});
		}

		updateCoordinatesDisplay(pixelX, pixelY);
		renderCursor(); // Re-render to show cursor
	}
}

function handlePointerUp() {
	state.updatePointerState({ isDragging: false });
	(state.app.view as HTMLCanvasElement).style.cursor = 'default';
}

function handlePointerLeave() {
	state.updatePointerState({ cursorPixel: null });
	renderCursor();
}

function handleWheel(event: PIXI.FederatedWheelEvent) {
	event.preventDefault();

	const pointer = event.global;
	const worldPosBeforeZoom = screenToWorld(pointer.x, pointer.y);

	const zoomFactor = event.deltaY > 0 ? 0.2 : 5;
	state.updateCamera({ scale: Math.max(0.5, Math.min(400, state.camera.scale * zoomFactor)) });

	const worldPosAfterZoom = screenToWorld(pointer.x, pointer.y);

	// Adjust camera position to keep the same world position under the mouse
	state.updateCamera({
		x: state.camera.x + worldPosBeforeZoom.x - worldPosAfterZoom.x,
		y: state.camera.y + worldPosBeforeZoom.y - worldPosAfterZoom.y
	});

	updateCameraView();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

function handleResize() {
	state.app.renderer.resize(window.innerWidth, window.innerHeight); // Full window height
	updateCameraView();
	renderWorld();
	updatePaletteLayout(); // Update palette layout on resize
} 