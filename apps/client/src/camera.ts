import { MAX_SCALE, MIN_SCALE, WORLD_SIZE } from './constants';
import { updateURL } from './persistence';
import { renderWorld } from './renderer';
import { state } from './state';

export function clampCamera() {
	// Clamp camera position to world bounds
	state.camera.x = Math.max(0, Math.min(WORLD_SIZE, state.camera.x));
	state.camera.y = Math.max(0, Math.min(WORLD_SIZE, state.camera.y));
}

export function updateCamera() {
	clampCamera();

	const centerX = state.app.screen.width / 2;
	const centerY = state.app.screen.height / 2;

	state.app.stage.children[0].position.set(centerX, centerY); // viewport
	state.app.stage.children[0].scale.set(state.camera.scale);
	state.app.stage.children[0].pivot.set(state.camera.x, state.camera.y);
}

export function screenToWorld(screenX: number, screenY: number) {
	const centerX = state.app.screen.width / 2;
	const centerY = state.app.screen.height / 2;

	return {
		x: state.camera.x + (screenX - centerX) / state.camera.scale,
		y: state.camera.y + (screenY - centerY) / state.camera.scale
	};
}

export function worldToScreen(worldX: number, worldY: number) {
	const centerX = state.app.screen.width / 2;
	const centerY = state.app.screen.height / 2;

	return {
		x: centerX + (worldX - state.camera.x) * state.camera.scale,
		y: centerY + (worldY - state.camera.y) * state.camera.scale
	};
}

export function updateCoordinatesDisplay(x?: number, y?: number) {
	const coordsDisplay = document.getElementById('coordinates')!;

	if (x !== undefined && y !== undefined) {
		coordsDisplay.textContent = `${x},${y}`;
	} else {
		coordsDisplay.textContent = `${Math.floor(state.camera.x)},${Math.floor(state.camera.y)}`;
	}
}

export function zoomIn() {
	const zoomFactor = 2;
	state.updateCamera({ scale: Math.min(MAX_SCALE, state.camera.scale * zoomFactor) });
	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
}

export function zoomOut() {
	const zoomFactor = 0.5;
	state.updateCamera({ scale: Math.max(MIN_SCALE, state.camera.scale * zoomFactor) });
	updateCamera();
	updateURL();
	updateCoordinatesDisplay();
	renderWorld();
} 