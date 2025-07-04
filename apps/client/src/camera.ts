import { MAX_SCALE, MIN_SCALE, WORLD_SIZE } from './constants';
import { state } from './state';

// Animation state for smooth zoom
let isAnimating = false;
let animationId: number | null = null;
let startScale = 1;
let targetScale = 1;
let animationProgress = 0;
const ANIMATION_DURATION = 200; // milliseconds

function lerp(start: number, end: number, t: number): number {
	return start + (end - start) * t;
}

function easeOutQuad(t: number): number {
	return 1 - (1 - t) * (1 - t);
}

function animateZoom(timestamp: number) {
	if (!isAnimating) return;

	animationProgress = Math.min(1, animationProgress + (16 / ANIMATION_DURATION)); // Assume 60fps
	const easedProgress = easeOutQuad(animationProgress);
	const currentScale = lerp(startScale, targetScale, easedProgress);

	state.updateCamera({ scale: currentScale });

	if (animationProgress >= 1) {
		isAnimating = false;
		animationId = null;
	} else {
		animationId = requestAnimationFrame(animateZoom);
	}
}

function startZoomAnimation(newTargetScale: number) {
	if (isAnimating && animationId) {
		cancelAnimationFrame(animationId);
	}

	startScale = state.camera.scale;
	targetScale = newTargetScale;
	animationProgress = 0;
	isAnimating = true;
	animationId = requestAnimationFrame(animateZoom);
}

export function smoothZoomToPoint(targetScale: number, screenX: number, screenY: number) {
	if (isAnimating && animationId) {
		cancelAnimationFrame(animationId);
	}

	const worldPosBeforeZoom = screenToWorld(screenX, screenY);

	startScale = state.camera.scale;
	targetScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetScale));
	animationProgress = 0;
	isAnimating = true;

	// Store the zoom point for the animation
	const zoomPoint = { screenX, screenY, worldPos: worldPosBeforeZoom };

	function animateZoomToPoint() {
		if (!isAnimating) return;

		animationProgress = Math.min(1, animationProgress + (16 / ANIMATION_DURATION));
		const easedProgress = easeOutQuad(animationProgress);
		const currentScale = lerp(startScale, targetScale, easedProgress);

		state.updateCamera({ scale: currentScale });

		// Adjust camera position to keep the same world position under the zoom point
		const worldPosAfterZoom = screenToWorld(zoomPoint.screenX, zoomPoint.screenY);
		state.updateCamera({
			x: state.camera.x + zoomPoint.worldPos.x - worldPosAfterZoom.x,
			y: state.camera.y + zoomPoint.worldPos.y - worldPosAfterZoom.y
		});

		if (animationProgress >= 1) {
			isAnimating = false;
			animationId = null;
		} else {
			animationId = requestAnimationFrame(animateZoomToPoint);
		}
	}

	animationId = requestAnimationFrame(animateZoomToPoint);
}

function clampCamera() {
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

export function getCenterPixel() {
	return {
		x: Math.floor(state.camera.x),
		y: Math.floor(state.camera.y)
	};
}

export function zoomIn() {
	const zoomFactor = 1.4;
	const newScale = Math.min(MAX_SCALE, state.camera.scale * zoomFactor);
	startZoomAnimation(newScale);
}

export function zoomOut() {
	const zoomFactor = 1 / 1.4;
	const newScale = Math.max(MIN_SCALE, state.camera.scale * zoomFactor);
	startZoomAnimation(newScale);
} 