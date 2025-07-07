import { Event, NostrEvent } from 'nostr-tools';
import * as pako from 'pako';
import { PixelData, PixelEvent } from './types';

export const getTag = (event: NostrEvent, tag: string) => {
	return event.tags.find(t => t[0] === tag)?.[1];
}

export function encodePixels(pixels: PixelData[]): string {
	// Convert pixels to the expected format: x,y,color\nx,y,color\n...
	const payload = pixels.map(p => `${p.x},${p.y},${p.color}`).join('\n');

	// Compress using gzip
	const compressed = pako.deflate(payload);

	// Convert to base64
	const base64 = btoa(String.fromCharCode(...compressed));

	return base64;
}

export function decodePixels(base64: string): PixelData[] {
	try {
		// Convert from base64
		const binary = atob(base64);
		const byteArray = Uint8Array.from(binary, char => char.charCodeAt(0));

		// Decompress using gzip
		const decompressed = pako.inflate(byteArray, { to: 'string' });

		// Parse the newline-separated format
		const lines = decompressed.trim().split('\n');
		return lines.map(line => {
			const [x, y, color] = line.split(',');
			return {
				x: parseInt(x, 10),
				y: parseInt(y, 10),
				color
			};
		});
	} catch (error) {
		console.error('Failed to decode pixels:', error);
		return [];
	}
}

export class PixelCodec {
	constructor(private canvasPubkey: string, private relays: string[]) { }

	// Create a lightweight zap request for payment (kind 9734) without pixel data
	createZapRequest(pixelEvent: PixelEvent, signedEvent: Event): NostrEvent {
		const tags = [
			['p', this.canvasPubkey],
			['relays', ...this.relays],
			['amount', (pixelEvent.amount * 1000).toString()],
			['app', 'Zappy Place'],
			['pixel_event_id', signedEvent.id],
			['version', '2'],
		];

		return {
			kind: 9734,
			created_at: Math.floor(Date.now() / 1000),
			content: `Zap request for ${pixelEvent.pixels.length} pixels on Zappy Place`,
			tags,
			pubkey: '',
			id: '',
			sig: ''
		};
	}

	encodePixelEvent(pixelEvent: PixelEvent, debug = false): NostrEvent {
		const encodedContent = encodePixels(pixelEvent.pixels);

		const tags = [
			['p', this.canvasPubkey],
			['relays', ...this.relays],
			['amount', (pixelEvent.amount * 1000).toString()],
			['app', 'Zappy Place'],
			['encoding', 'gzip+base64:v1'],
			['version', '2'],
		];

		if (!debug) {
			tags.push(['requires_payment', 'true']);
		}

		// Add message and URL as tags if present
		if (pixelEvent.message) {
			tags.push(['message', pixelEvent.message]);
		}
		if (pixelEvent.url) {
			tags.push(['url', pixelEvent.url]);
		}

		return {
			kind: 90001,
			created_at: Math.floor(Date.now() / 1000),
			content: encodedContent,
			tags,
			pubkey: '',
			id: '',
			sig: ''
		};
	}

	decodePixelEvent(event: NostrEvent): PixelEvent {
		const messageTag = event.tags.find(t => t[0] === 'message');
		const urlTag = event.tags.find(t => t[0] === 'url');

		return {
			pixels: decodePixels(event.content),
			timestamp: event.created_at,
			senderPubkey: event.pubkey,
			amount: parseInt(event.tags.find(t => t[0] === 'amount')?.[1] || '0', 10) / 1000,
			message: messageTag?.[1],
			url: urlTag?.[1]
		};
	}
}