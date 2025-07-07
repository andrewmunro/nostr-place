import { NostrCanvas, NostrClientConfig, PixelEvent } from '@zappy-place/nostr-client';
import { state } from './state';
import { setConnectionStatus, setUserInfo, showShareModal } from './ui';

function isDebugMode(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('debug');
}

function isFreePlacement(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('free');
}

class NostrService {
	canvas: NostrCanvas;
	isInitialized = false;

	constructor(config: Partial<NostrClientConfig> = {}) {
		this.canvas = new NostrCanvas(config, {
			onPixelEvent: (pixel: PixelEvent) => {
				this.handlePixelUpdate(pixel);
			},
			onRelayStatus: (relay) => {
				console.log(`Relay ${relay.url}: ${relay.status}`);
			},
			onError: (error, context) => {
				console.error(`Nostr error in ${context}:`, error);
				setConnectionStatus('❌ Connection error');
			}
		});
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		setConnectionStatus('🌐 Connecting...');

		try {
			console.log('Connecting to Nostr relays...');
			await this.canvas.initialize();

			this.isInitialized = true;
			console.log('Nostr service initialized successfully');
			setConnectionStatus('🌐 Connected');
		} catch (error) {
			console.error('Failed to initialize Nostr service:', error);
			setConnectionStatus('❌ Connection failed');
			throw error;
		}
	}

	public handlePixelUpdate(pixelEvent: PixelEvent): void {
		for (const pixel of pixelEvent.pixels) {
			state.setPixel(pixel);
		}

		// Update preview costs if in preview mode
		if (state.previewState.isActive) {
			state.updateCostBreakdown();
		}
	}

	// Submit preview pixels as a batch
	async submitPreviewPixels(message?: string, url?: string): Promise<void> {
		if (!state.previewState.isActive || state.previewState.pixels.size === 0) {
			throw new Error('No preview pixels to submit');
		}

		const pixelEvent: PixelEvent = {
			pixels: Array.from(state.previewState.pixels.values()),
			amount: state.previewState.costBreakdown.totalSats,
			message,
			url
		}

		if (isDebugMode()) {
			this.handlePixelUpdate(pixelEvent);
			// Get pixel coordinates for sharing before clearing preview
			const pixelCoords = Array.from(state.previewState.pixels.values()).map(p => ({ x: p.x, y: p.y }));

			// Clear preview after successful submission
			state.exitPreviewMode();

			// Show share modal to prompt user to share their design
			showShareModal(pixelCoords);
			return;
		}

		try {
			await this.canvas.publishPixelEvent(pixelEvent, isFreePlacement());

			// Get pixel coordinates for sharing before clearing preview
			const pixelCoords = Array.from(state.previewState.pixels.values()).map(p => ({ x: p.x, y: p.y }));

			// Clear preview after successful submission
			state.exitPreviewMode();

			// Show share modal to prompt user to share their design
			showShareModal(pixelCoords);
		} catch (error) {
			console.error('Failed to submit preview pixels:', error);
			throw error;
		}
	}

	async disconnect(): Promise<void> {
		if (this.isInitialized) {
			await this.canvas.disconnect();
			this.isInitialized = false;
		}
		setConnectionStatus('🌐 Disconnected');
		setUserInfo();
	}
}

export const nostrService = new NostrService(); 