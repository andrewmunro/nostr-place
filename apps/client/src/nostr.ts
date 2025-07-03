import { createDefaultConfig, NostrClient, Pixel } from '@nostr-place/nostr-canvas';
import { OPTIMSTIC_PIXELS_ENABLED } from './constants';
import { renderCursor } from './renderer';
import { state } from './state';

// UI update functions
function updateConnectionStatus(status: string) {
	const statusEl = document.getElementById('connection-status');
	if (statusEl) {
		statusEl.textContent = status;
	}
}

function updateUserInfo(publicKey?: string) {
	const userInfoEl = document.getElementById('user-info');
	if (userInfoEl && publicKey) {
		userInfoEl.textContent = `🔑 ${publicKey.slice(0, 12)}...`;
		userInfoEl.classList.remove('hidden');
	}
}

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
				updateConnectionStatus('❌ Connection error');
			}
		});
	}

	private updateConnectionUI() {
		const status = this.getConnectionStatus();
		updateConnectionStatus(`🌐 ${status}`);
	}

	async initialize(): Promise<void> {
		if (this.isInitialized) return;

		updateConnectionStatus('🌐 Connecting...');

		try {
			// Generate or load user keys
			const keys = this.client.generateKeys();
			console.log('Generated Nostr keys:', {
				publicKey: keys.publicKey,
				// Don't log private key in production
				hasPrivateKey: !!keys.privateKey
			});

			updateUserInfo(keys.publicKey);

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
			updateConnectionStatus('❌ Connection failed');
			throw error;
		}
	}

	public handlePixelUpdate(pixel: Pixel): void {
		// Update local state
		const pixelKey = `${pixel.x},${pixel.y}`;
		state.pixels.set(pixelKey, pixel);

		// Update canvas texture
		if (pixel.color) {
			state.pixelContext.fillStyle = pixel.color;
			state.pixelContext.fillRect(pixel.x, pixel.y, 1, 1);
		} else {
			state.pixelContext.clearRect(pixel.x, pixel.y, 1, 1);
		}

		state.pixelTexture.update();

		renderCursor();
		console.log(`Updated pixel at (${pixel.x}, ${pixel.y}): ${pixel.color}`);
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
		if (!this.isInitialized) {
			throw new Error('Nostr service not initialized');
		}

		const pixel: Pixel = {
			x,
			y,
			color,
			eventId: `${x}_${y}_${Date.now()}`, // Temporary ID until real event comes back
			pubkey: this.client.getPublicKey() || 'unknown',
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
			// Publish to Nostr in the background
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

	getPublicKey(): string | undefined {
		return this.client.getPublicKey();
	}

	async disconnect(): Promise<void> {
		if (this.isInitialized) {
			await this.client.disconnect();
			this.isInitialized = false;
			updateConnectionStatus('🌐 Disconnected');
		}
	}
}

// Export singleton instance
export const nostrService = new NostrService(); 