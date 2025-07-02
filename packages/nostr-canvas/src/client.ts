import { Filter } from 'nostr-tools';
import { SimplePool } from 'nostr-tools/pool';
import { finalizeEvent, generateSecretKey, getPublicKey } from 'nostr-tools/pure';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import {
	CanvasEventCallbacks,
	NostrClientConfig,
	NostrClientState,
	Pixel,
	PixelEvent,
	RelayConnection,
	ZapEvent
} from './types.js';
import { PixelValidator } from './validator.js';

type NostrEvent = {
	id: string;
	kind: number;
	pubkey: string;
	created_at: number;
	tags: string[][];
	content: string;
	sig: string;
};

export class NostrClient {
	private pool: SimplePool;
	private relays: Map<string, RelayConnection>;
	private state: NostrClientState;
	private config: NostrClientConfig;
	private callbacks: CanvasEventCallbacks;
	private validator: PixelValidator;
	private reconnectTimers: Map<string, NodeJS.Timeout>;
	private privateKey?: string;
	private publicKey?: string;

	constructor(config: NostrClientConfig, callbacks: CanvasEventCallbacks = {}) {
		this.config = config;
		this.callbacks = callbacks;
		this.pool = new SimplePool();
		this.relays = new Map();
		this.reconnectTimers = new Map();
		this.validator = new PixelValidator(config.canvasConfig);

		this.state = {
			isConnected: false,
			connectedRelays: [],
			pixels: new Map(),
			pixelEvents: new Map(),
			zapEvents: new Map()
		};

		this.initializeRelays();
	}

	// Key management
	generateKeys(): { privateKey: string; publicKey: string } {
		const secretKey = generateSecretKey();
		this.privateKey = bytesToHex(secretKey);
		this.publicKey = getPublicKey(secretKey);
		return { privateKey: this.privateKey, publicKey: this.publicKey };
	}

	setKeys(privateKey: string): void {
		this.privateKey = privateKey;
		const secretKeyBytes = hexToBytes(privateKey);
		this.publicKey = getPublicKey(secretKeyBytes);
	}

	getPublicKey(): string | undefined {
		return this.publicKey;
	}

	// Connection management
	private initializeRelays(): void {
		this.config.relays.forEach(url => {
			this.relays.set(url, {
				url,
				status: 'disconnected',
				errorCount: 0
			});
		});
	}

	async connect(): Promise<void> {
		const connectionPromises = Array.from(this.relays.keys()).map(url =>
			this.connectToRelay(url)
		);

		await Promise.allSettled(connectionPromises);
		this.updateConnectionState();
	}

	private async connectToRelay(url: string): Promise<void> {
		const relay = this.relays.get(url);
		if (!relay) return;

		try {
			relay.status = 'connecting';
			this.callbacks.onRelayStatus?.(relay);

			// Test connection by attempting to connect
			await this.pool.ensureRelay(url);

			relay.status = 'connected';
			relay.lastConnected = Date.now();
			relay.errorCount = 0;

			this.callbacks.onRelayStatus?.(relay);
		} catch (error) {
			relay.status = 'error';
			relay.errorCount++;

			this.callbacks.onRelayStatus?.(relay);
			this.callbacks.onError?.(error as Error, `Connecting to relay ${url}`);

			this.scheduleReconnect(url);
		}
	}

	private scheduleReconnect(url: string): void {
		const relay = this.relays.get(url);
		if (!relay || relay.errorCount >= this.config.maxReconnectAttempts) {
			return;
		}

		const existingTimer = this.reconnectTimers.get(url);
		if (existingTimer) {
			clearTimeout(existingTimer);
		}

		const delay = Math.min(
			this.config.reconnectInterval * Math.pow(2, relay.errorCount - 1),
			30000 // Max 30 seconds
		);

		const timer = setTimeout(() => {
			this.connectToRelay(url);
			this.reconnectTimers.delete(url);
		}, delay);

		this.reconnectTimers.set(url, timer);
	}

	private updateConnectionState(): void {
		const connected = Array.from(this.relays.values())
			.filter(relay => relay.status === 'connected')
			.map(relay => relay.url);

		this.state.connectedRelays = connected;
		this.state.isConnected = connected.length > 0;
	}

	// Event subscription
	async subscribeToCanvas(): Promise<void> {
		if (this.state.connectedRelays.length === 0) {
			throw new Error('No connected relays');
		}

		// Subscribe to pixel placement events (kind 30001)
		this.subscribeToEvents({
			kinds: [90001],
		});

		// // Subscribe to zap events (kind 9735)
		// this.subscribeToEvents({
		// 	kinds: [9735],
		// });
	}

	private subscribeToEvents(filter: Filter): void {
		this.pool.subscribe(this.state.connectedRelays, filter, {
			onevent: (event: NostrEvent) => {
				this.handleEvent(event);
			},
			oneose: () => {
				// End of stored events - could log if needed
			}
		});
	}

	// Event handling
	private handleEvent(event: NostrEvent): void {
		try {
			this.callbacks.onEventReceived?.(event);

			if (event.kind === 90001) {
				this.handlePixelEvent(event as PixelEvent);
			} else if (event.kind === 9735) {
				this.handleZapEvent(event as ZapEvent);
			}
		} catch (error) {
			this.callbacks.onError?.(error as Error, `Processing event ${event.id}`);
		}
	}

	private handlePixelEvent(pixelEvent: PixelEvent): void {
		// Store the pixel event
		this.state.pixelEvents.set(pixelEvent.id, pixelEvent);

		// Check if we already have a zap for this pixel
		const zapEvent = this.findZapForPixel(pixelEvent.id);

		// Extract pixel data and validate
		const pixel = this.validator.extractPixelFromEvent(pixelEvent, zapEvent);

		// Update canvas state
		const pixelKey = `${pixel.x},${pixel.y}`;
		const existingPixel = this.state.pixels.get(pixelKey);

		const shouldUpdate = !existingPixel ||
			(pixel.isValid && !existingPixel.isValid) ||
			(pixel.isValid === existingPixel.isValid && pixel.timestamp > existingPixel.timestamp)

		// Only update if this pixel is newer or more valid
		if (shouldUpdate) {
			this.state.pixels.set(pixelKey, pixel);
			this.callbacks.onPixelUpdate?.(pixel);
		}
	}

	private handleZapEvent(zapEvent: ZapEvent): void {
		// Store the zap event
		this.state.zapEvents.set(zapEvent.id, zapEvent);

		// Find the referenced pixel event
		const eTag = zapEvent.tags.find(tag => tag[0] === 'e');
		if (!eTag) return;

		const pixelEventId = eTag[1];
		const pixelEvent = this.state.pixelEvents.get(pixelEventId);

		if (pixelEvent) {
			// Re-validate the pixel with the new zap
			const pixel = this.validator.extractPixelFromEvent(pixelEvent, zapEvent);

			const pixelKey = `${pixel.x},${pixel.y}`;
			const existingPixel = this.state.pixels.get(pixelKey);

			// Update if this makes the pixel valid or if it's newer
			if (!existingPixel ||
				(pixel.isValid && !existingPixel.isValid) ||
				(pixel.isValid === existingPixel.isValid && pixel.timestamp > existingPixel.timestamp)) {

				this.state.pixels.set(pixelKey, pixel);
				this.callbacks.onPixelUpdate?.(pixel);
			}
		}
	}

	private findZapForPixel(pixelEventId: string): ZapEvent | undefined {
		for (const zapEvent of this.state.zapEvents.values()) {
			const eTag = zapEvent.tags.find(tag => tag[0] === 'e');
			if (eTag && eTag[1] === pixelEventId) {
				return zapEvent;
			}
		}
		return undefined;
	}

	// Event publishing
	async publishPixelEvent(x: number, y: number, color: string): Promise<string> {
		if (!this.privateKey) {
			throw new Error('No private key set. Call generateKeys() or setKeys() first.');
		}

		if (this.state.connectedRelays.length === 0) {
			throw new Error('No connected relays');
		}

		const event = {
			kind: 90001,
			created_at: Math.floor(Date.now() / 1000),
			tags: [
				['x', x.toString()],
				['y', y.toString()],
				['color', color],
				['zap_required', 'true']
			],
			content: `Placing ${color} pixel at (${x}, ${y})`
		};

		const privateKeyBytes = hexToBytes(this.privateKey);
		const signedEvent = finalizeEvent(event, privateKeyBytes);

		const publishPromises = this.state.connectedRelays.map(relayUrl =>
			this.pool.publish([relayUrl], signedEvent)
		);

		await Promise.allSettled(publishPromises);
		return signedEvent.id;
	}

	// State getters
	getPixels(): Map<string, Pixel> {
		return new Map(this.state.pixels);
	}

	getRelayStatuses(): RelayConnection[] {
		return Array.from(this.relays.values());
	}

	// Cleanup
	async disconnect(): Promise<void> {
		// Clear reconnect timers
		this.reconnectTimers.forEach(timer => clearTimeout(timer));
		this.reconnectTimers.clear();

		// Close pool
		this.pool.close(this.state.connectedRelays);

		// Update state
		this.state.isConnected = false;
		this.state.connectedRelays = [];
		this.relays.forEach(relay => {
			relay.status = 'disconnected';
		});
	}
}

// Default configuration factory
export function createDefaultConfig(): NostrClientConfig {
	return {
		relays: [
			// 'wss://relay.damus.io',
			'wss://relay.nostr.band',
			'wss://relay.primal.net',
			// 'wss://nos.lol',
			// 'wss://relay.getalby.com/v1'
		],
		canvasConfig: {
			minZapAmount: 1000, // 1 sat in millisats
			zapTimeWindow: 300, // 5 minutes
			maxPixelAge: 86400, // 24 hours
			canvasSize: 2000
		},
		reconnectInterval: 5000, // 5 seconds
		maxReconnectAttempts: 5
	};
} 