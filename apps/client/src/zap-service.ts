import { NostrEvent } from 'nostr-tools';
import { encodePixels, PixelData } from './compression';
import { NOSTR_CONFIG } from './constants';
import { PreviewPixel } from './state';

export interface ZapEventData {
	pixels: PreviewPixel[];
	totalAmountMsats: number;
	canvasPubkey: string;
	zapperPubkey: string;
}

export async function createZapRequestEvent(data: ZapEventData): Promise<NostrEvent> {
	// Convert preview pixels to the compression format
	const pixelData: PixelData[] = data.pixels.map(p => ({
		x: p.x,
		y: p.y,
		color: p.color
	}));

	// Encode pixel data
	const encodedContent = encodePixels(pixelData);

	// Create the event
	const event: NostrEvent = {
		kind: 9734,
		created_at: Math.floor(Date.now() / 1000),
		content: encodedContent,
		tags: [
			['p', data.canvasPubkey],
			['relays', ...NOSTR_CONFIG.RELAYS],
			['app', NOSTR_CONFIG.APP_NAME],
			['encoding', 'gzip+base64:v1'],
			['amount', data.totalAmountMsats.toString()]
		],
		pubkey: data.zapperPubkey,
		id: '',
		sig: ''
	};

	return event;
}

export async function submitZapRequest(pixels: PreviewPixel[], totalAmountMsats: number): Promise<void> {
	try {
		// Check if WebLN is available
		if (!window.webln) {
			throw new Error('WebLN not available. Please install a Lightning browser extension like Alby.');
		}

		// Get user's public key
		let zapperPubkey: string;
		if (window.nostr) {
			zapperPubkey = await window.nostr.getPublicKey();
		} else {
			console.warn('Using temporary key - user identity will not persist');
			return;
		}

		// Create the zap request event
		const zapEvent = await createZapRequestEvent({
			pixels,
			totalAmountMsats,
			canvasPubkey: NOSTR_CONFIG.CANVAS_PUBKEY,
			zapperPubkey
		});

		// Sign the event if we have nostr
		let signedEvent: NostrEvent;
		if (window.nostr) {
			signedEvent = await window.nostr.signEvent(zapEvent);
		} else {
			throw new Error('Cannot sign event without Nostr extension');
		}

		// Enable WebLN
		await window.webln.enable();

		// Create Lightning invoice (this would typically come from a zap endpoint)
		// For now, we'll show what the zap request would look like
		console.log('Zap request event:', signedEvent);
		console.log('Total amount:', totalAmountMsats, 'msats');
		console.log('Pixel count:', pixels.length);

		// TODO: Send to zap endpoint to get Lightning invoice
		// TODO: Pay invoice via WebLN
		// TODO: Publish the signed event to relays

		alert(`Zap request created!\nPixels: ${pixels.length}\nCost: ${totalAmountMsats / 1000} sats\n\nFull implementation coming soon.`);

	} catch (error) {
		console.error('Zap submission failed:', error);
		throw error;
	}
}