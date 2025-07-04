import { MAX_SCALE, MIN_SCALE, WORLD_SIZE } from './constants';
import { state } from './state';

function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

function clampCamera() {
	// Clamp camera position to world bounds
	state.camera.x = Math.max(0, Math.min(WORLD_SIZE, state.camera.x));
	state.camera.y = Math.max(0, Math.min(WORLD_SIZE, state.camera.y));
}

export function updateCamera() {
	// Smooth interpolation towards target values
	const lerpFactor = 0.1; // Adjust this value to control animation speed

	state.camera.x = lerp(state.camera.x, state.camera.targetX, lerpFactor);
	state.camera.y = lerp(state.camera.y, state.camera.targetY, lerpFactor);
	state.camera.scale = lerp(state.camera.scale, state.camera.targetScale, lerpFactor);

	clampCamera();

	const centerX = state.app.screen.width / 2;
	const centerY = state.app.screen.height / 2;

	state.app.stage.children[0].position.set(centerX, centerY); // viewport
	state.app.stage.children[0].scale.set(state.camera.scale);
	state.app.stage.children[0].pivot.set(state.camera.x, state.camera.y);
}

export function smoothZoomToPoint(targetScale: number, screenX: number, screenY: number) {
	const clampedScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));

	// Calculate world position at the mouse cursor with current scale
	const worldPosBeforeZoom = screenToWorld(screenX, screenY);

	// Calculate what the world position would be at the target scale with current camera position
	const centerX = state.app.screen.width / 2;
	const centerY = state.app.screen.height / 2;
	const worldPosAfterZoom = {
		x: state.camera.x + (screenX - centerX) / clampedScale,
		y: state.camera.y + (screenY - centerY) / clampedScale
	};

	// Set target scale and adjust camera position to keep the same world position under the zoom point
	state.camera.targetScale = clampedScale;
	state.camera.targetX = state.camera.x + worldPosBeforeZoom.x - worldPosAfterZoom.x;
	state.camera.targetY = state.camera.y + worldPosBeforeZoom.y - worldPosAfterZoom.y;
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

export function getCenterPixel() {
	return {
		x: Math.floor(state.camera.x),
		y: Math.floor(state.camera.y)
	};
}

export function zoomIn() {
	const zoomFactor = 1.4;
	const newScale = Math.min(MAX_SCALE, state.camera.scale * zoomFactor);
	state.camera.targetScale = newScale;
}

export function zoomOut() {
	const zoomFactor = 1 / 1.4;
	const newScale = Math.max(MIN_SCALE, state.camera.scale * zoomFactor);
	state.camera.targetScale = newScale;
} 