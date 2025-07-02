import { Pixel } from '@nostr-place/nostr-canvas';
import { nostrService } from './nostr';
import { renderCursor } from './renderer';
import { state } from './state';

// Check if debug mode is enabled via URL parameter
function isDebugMode(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('debug');
}

// Place pixel locally in debug mode (optimized)
function placePixelLocally(x: number, y: number, color: string) {
	const pixel: Pixel = {
		x,
		y,
		color,
		eventId: `debug_${x}_${y}_${Date.now()}`,
		pubkey: 'debug_user',
		timestamp: Date.now(),
		isValid: true // Always valid in debug mode
	};

	const pixelKey = `${x},${y}`;
	state.pixels.set(pixelKey, pixel);

	// Optimized: Update only this single pixel directly to canvas
	state.pixelContext.fillStyle = color;
	state.pixelContext.fillRect(x, y, 1, 1);
	state.pixelTexture.update();

	// Only update cursor, not the entire world
	renderCursor();

	console.log(`🐛 Debug: Placed ${color} pixel at (${x}, ${y}) locally`);
}

export async function placePixel(x: number, y: number, color: string) {
	if (isDebugMode()) {
		// In debug mode, update local state directly
		placePixelLocally(x, y, color);
		return;
	}

	// Normal mode: publish to Nostr
	try {
		await nostrService.publishPixel(x, y, color);
		console.log(`Publishing ${color} pixel at (${x}, ${y}) to Nostr...`);
	} catch (error) {
		console.error('Failed to place pixel:', error);
		// Could show user notification here
	}
} 