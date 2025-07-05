import { createDefaultConfig, NostrClient, Pixel } from '@zappy-place/nostr-client';
import { OPTIMSTIC_PIXELS_ENABLED } from './constants';
import { state } from './state';
import { setConnectionStatus, setUserInfo } from './ui';

function isDebugMode(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('debug');
}

class NostrService {
	private client: NostrClient;
	private isInitialized = false;

	constructor() {
		const config = createDefaultConfig();

		this.client = new NostrClient(config, {
			onPixelUpdate: (pixel: Pixel) => {
				this.handlePixelUpdate(pixel);
			},
			onRelayStatus: (relay) => {
				console.log(`Relay ${relay.url}: ${relay.status}`);
				this.updateConnectionUI();
			},
			onError: (error, context) => {
				console.error(`Nostr error in ${context}:`, error);
				setConnectionStatus('❌ Connection error');
			}
		});
	}

	private updateConnectionUI() {
		const status = this.getConnectionStatus();
		setConnectionStatus(`🌐 ${status}`);
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		setConnectionStatus('🌐 Connecting...');

		try {
			// Connect to relays
			console.log('Connecting to Nostr relays...');
			await this.client.connect();

			await this.client.fetchHistoricalEvents();

			// Subscribe to canvas events
			console.log('Subscribing to canvas events...');
			await this.client.subscribeToCanvas();

			this.isInitialized = true;
			console.log('Nostr service initialized successfully');
			this.updateConnectionUI();
		} catch (error) {
			console.error('Failed to initialize Nostr service:', error);
			setConnectionStatus('❌ Connection failed');
			throw error;
		}
	}

	public handlePixelUpdate(pixel: Pixel): void {
		// Validate and fix pixel data
		const fixedPixel = this.validateAndFixPixel(pixel);

		// Update local state
		const pixelKey = `${pixel.x},${pixel.y}`;
		state.pixels.set(pixelKey, fixedPixel);

		// Mark specific pixel as modified for efficient rendering
		state.markPixelAsModified(pixel.x, pixel.y);

		console.log(`Updated pixel at (${pixel.x}, ${pixel.y}): ${fixedPixel.color}, isValid: ${fixedPixel.isValid}`);
	}

	private validateAndFixPixel(pixel: Pixel): Pixel {
		// Create a copy to avoid modifying the original
		const fixedPixel = { ...pixel };

		// Validate coordinates
		if (typeof pixel.x !== 'number' || typeof pixel.y !== 'number') {
			fixedPixel.isValid = false;
			return fixedPixel;
		}

		// Validate color - accept valid hex colors or null
		if (pixel.color === null || pixel.color === undefined || pixel.color === '') {
			// Null color is valid (means pixel is deleted)
			fixedPixel.color = null;
			fixedPixel.isValid = true;
		} else if (typeof pixel.color === 'string' && pixel.color.match(/^#[0-9A-Fa-f]{6}$/)) {
			// Valid hex color
			fixedPixel.color = pixel.color;
			fixedPixel.isValid = true;
		} else {
			// Invalid color
			console.warn(`Invalid color for pixel at (${pixel.x}, ${pixel.y}): ${pixel.color}`);
			fixedPixel.isValid = false;
			return fixedPixel;
		}

		// Validate timestamp
		if (typeof pixel.timestamp !== 'number' || pixel.timestamp <= 0) {
			fixedPixel.timestamp = Date.now();
		}

		return fixedPixel;
	}

	private dimColor(color: string | null): string | null {
		if (!color) return null;

		// Convert hex color to dimmed version for pending pixels
		if (color.startsWith('#')) {
			const r = parseInt(color.slice(1, 3), 16);
			const g = parseInt(color.slice(3, 5), 16);
			const b = parseInt(color.slice(5, 7), 16);

			// Dim by mixing with background color (make it 50% opacity effect)
			const dimR = Math.floor(r * 0.5 + 255 * 0.5);
			const dimG = Math.floor(g * 0.5 + 255 * 0.5);
			const dimB = Math.floor(b * 0.5 + 255 * 0.5);

			return `#${dimR.toString(16).padStart(2, '0')}${dimG.toString(16).padStart(2, '0')}${dimB.toString(16).padStart(2, '0')}`;
		}
		return color; // fallback for non-hex colors
	}

	async publishPixel(x: number, y: number, color: string | null, isUndo: boolean = false): Promise<void> {
		const isDebug = isDebugMode();
		let publicKey: string | null = null;

		if (!isDebug) {
			try {
				publicKey = await window.nostr!.getPublicKey();
			} catch (error) {
				throw new Error('Please login to place pixels');
			}
		}

		const pixel: Pixel = {
			x,
			y,
			color,
			eventId: `${x}_${y}_${Date.now()}`, // Temporary ID until real event comes back
			pubkey: publicKey,
			timestamp: Date.now(),
		};

		if (!isUndo) {
			state.addToUndoHistory(pixel);
		}

		if (isDebugMode()) {
			this.handlePixelUpdate(pixel);
			return;
		}

		// Optimistically update local state immediately
		if (OPTIMSTIC_PIXELS_ENABLED) {
			// Update local state immediately for instant feedback
			this.handlePixelUpdate({
				...pixel,
				color: this.dimColor(color)
			});
		}

		try {
			if (!this.isInitialized) {
				throw new Error('Nostr service not initialized');
			}

			// Use the client's publishPixelEvent method which now uses window.nostr
			const eventId = await this.client.publishPixelEvent(pixel);
			console.log(`Published pixel event: ${eventId}`);
		} catch (error) {
			console.error('Failed to publish pixel:', error);
			throw error;
		}
	}

	getConnectionStatus(): string {
		const relayStatuses = this.client.getRelayStatuses();
		const connected = relayStatuses.filter(r => r.status === 'connected').length;
		const total = relayStatuses.length;
		return `${connected}/${total} relays connected`;
	}

	async disconnect(): Promise<void> {
		if (this.isInitialized) {
			await this.client.disconnect();
			this.isInitialized = false;
		}
		setConnectionStatus('🌐 Disconnected');
		setUserInfo();
	}
}

// Export singleton instance
export const nostrService = new NostrService(); 