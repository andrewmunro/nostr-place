import { Pixel } from '@nostr-place/nostr-canvas';
import { state } from './state';

export function placePixel(x: number, y: number, color: string) {
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

	state.pixels.set(pixelKey, pixel);

	// Update the texture immediately for this pixel
	state.pixelContext.fillStyle = color;
	state.pixelContext.fillRect(x, y, 1, 1);
	state.pixelTexture.update();

	console.log(`Placed ${color} pixel at (${x}, ${y})`);
} 