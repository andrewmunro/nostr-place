import { NostrEvent } from 'nostr-tools';
import * as pako from 'pako';
import { PixelEvent } from './types';

export interface PixelData {
	x: number;
	y: number;
	color: string;
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

	encodePixelEvent(pixelEvent: PixelEvent, debug = false): NostrEvent {
		const encodedContent = encodePixels(pixelEvent.pixels);

		return {
			kind: debug ? 90001 : 9734,
			created_at: Math.floor(Date.now() / 1000),
			content: encodedContent,
			tags: [
				['p', this.canvasPubkey],
				['relays', ...this.relays],
				['amount', (pixelEvent.amount * 1000).toString()],
				['app', 'Zappy Place'],
				['encoding', 'gzip+base64:v1'],
			],
			pubkey: '',
			id: '',
			sig: ''
		};
	}

	decodePixelEvent(event: NostrEvent): PixelEvent {
		return {
			pixels: decodePixels(event.content),
			timestamp: event.created_at,
			senderPubkey: event.pubkey,
			amount: parseInt(event.tags.find(t => t[0] === 'amount')?.[1] || '0', 10)
		};
	}
}