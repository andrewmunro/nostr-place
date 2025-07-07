import { decodePixels, encodePixels, PixelData } from '@zappy-place/nostr-client';
import { MAX_SCALE, MIN_SCALE } from './constants';
import { state } from './state';
import { throttle } from './utils';

function updateURLImmediate() {
	const params = new URLSearchParams();

	// Camera parameters
	params.set('x', Math.floor(state.camera.x).toString());
	params.set('y', Math.floor(state.camera.y).toString());
	params.set('scale', state.camera.scale.toFixed(2));

	// Preview pixels (only if in preview mode and has pixels)
	if (state.previewState.isActive && state.previewState.pixels.size > 0) {
		try {
			const pixelData: PixelData[] = Array.from(state.previewState.pixels.values()).map(p => ({
				x: p.x,
				y: p.y,
				color: p.color
			}));

			const encoded = encodePixels(pixelData);
			params.set('preview', encoded);
		} catch (error) {
			console.warn('Failed to encode preview pixels for URL:', error);
		}
	}

	const hash = `#${params.toString()}`;
	if (window.location.hash !== hash) {
		window.history.replaceState(null, '', hash);
	}
}

export const updateURL = throttle(updateURLImmediate, 500); // Increased throttle for preview pixels

export function loadFromURL() {
	const hash = window.location.hash.slice(1);
	const params = new URLSearchParams(hash);

	// Load camera parameters
	const x = params.get('x');
	const y = params.get('y');
	const scale = params.get('scale');

	if (x !== null) state.updateCamera({ x: parseInt(x) });
	if (y !== null) state.updateCamera({ y: parseInt(y) });
	if (scale !== null) {
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, parseFloat(scale)));
		state.updateCamera({ scale: newScale });
	}

	// Load preview pixels if present
	const previewData = params.get('preview');
	if (previewData) {
		try {
			const pixelData = decodePixels(previewData);
			if (pixelData.length > 0) {
				// Enter preview mode and restore pixels
				state.enterPreviewMode();

				// Add each pixel to preview state
				pixelData.forEach(pixel => {
					state.addPreviewPixel(pixel.x, pixel.y, pixel.color);
				});

				console.log(`Restored ${pixelData.length} preview pixels from URL`);
			}
		} catch (error) {
			console.warn('Failed to decode preview pixels from URL:', error);
		}
	}
}

export function generateShareableURL(pixelCoords: Array<{ x: number, y: number }>, customScale?: number): string {
	if (pixelCoords.length === 0) return window.location.origin;

	// Calculate center of the design
	const minX = Math.min(...pixelCoords.map(p => p.x));
	const maxX = Math.max(...pixelCoords.map(p => p.x));
	const minY = Math.min(...pixelCoords.map(p => p.y));
	const maxY = Math.max(...pixelCoords.map(p => p.y));

	const centerX = Math.floor((minX + maxX) / 2);
	const centerY = Math.floor((minY + maxY) / 2);

	// Calculate appropriate zoom level if not provided
	let scale = customScale;
	if (!scale) {
		const designWidth = maxX - minX + 1;
		const designHeight = maxY - minY + 1;
		const maxDimension = Math.max(designWidth, designHeight);

		// Aim for design to take up about half of screen (assuming ~800px common viewport)
		const targetPixelSize = 400 / maxDimension;
		scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, targetPixelSize));
	}

	// Create URL parameters
	const params = new URLSearchParams();
	params.set('x', centerX.toString());
	params.set('y', centerY.toString());
	params.set('scale', scale.toFixed(2));

	return `https://zappy-place.pages.dev/#${params.toString()}`;
} 