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
	private paginationState: {
		oldestTimestamp?: number;
		isComplete: boolean;
		pagesFetched: number;
	};
	private isRealTimeSubscriptionActive: boolean = false;

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
			const connection = await this.pool.ensureRelay(url);
			connection.onclose = () => {
				console.log('Relay closed');
				this.scheduleReconnect(url);
			}
			connection.onnotice = (notice: string) => {
				console.log('Relay notice:', notice);
			}

			relay.status = 'connected';
			relay.lastConnected = Date.now();
			relay.errorCount = 0;

			this.callbacks.onRelayStatus?.(relay);
			this.updateConnectionState();

			// Re-establish real-time subscription if it was active
			if (this.isRealTimeSubscriptionActive) {
				this.subscribeToRealTimeEvents();
			}
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

	async fetchHistoricalEvents(): Promise<void> {
		if (this.state.connectedRelays.length === 0) {
			throw new Error('No connected relays');
		}

		this.paginationState = {
			isComplete: false,
			oldestTimestamp: Math.floor(Date.now() / 1000),
			pagesFetched: 0
		};

		await this.scheduleFetchNextPage(this.config.pagination);
	}

	// Event subscription
	async subscribeToCanvas(): Promise<void> {
		this.isRealTimeSubscriptionActive = true;
		this.subscribeToRealTimeEvents();
	}

	private subscribeToRealTimeEvents(): void {
		const filter: Filter = {
			kinds: [90001],
			since: Math.floor(Date.now() / 1000)
		};

		this.pool.subscribe(this.state.connectedRelays, filter, {
			onevent: (event: NostrEvent) => {
				this.handleEvent(event);
			},
			onclose: () => {
				console.log('Real-time subscription ended, restarting...');
				this.subscribeToRealTimeEvents();
			},
		});
	}

	private async fetchNextPage(paginationConfig: NostrClientConfig['pagination']): Promise<void> {
		return new Promise((resolve) => {
			const filter: Filter = {
				kinds: [90001],
				limit: paginationConfig.eventsPerPage
			};

			// Add until filter if we have an oldest timestamp from previous page
			if (this.paginationState.oldestTimestamp) {
				filter.until = this.paginationState.oldestTimestamp;
			}

			let pageEvents = 0;
			let oldestInThisPage: number | undefined;

			this.pool.subscribe(this.state.connectedRelays, filter, {
				onevent: (event: NostrEvent) => {
					// Skip events that are older than or equal to our "since" timestamp
					if (event.created_at <= paginationConfig.since) {
						return;
					}

					pageEvents++;
					this.handleEvent(event);

					// Track the oldest timestamp in this page
					if (!oldestInThisPage || event.created_at < oldestInThisPage) {
						oldestInThisPage = event.created_at;
					}
				},
				oneose: () => {
					// Store the previous oldest timestamp to detect if we're making progress
					const previousOldest = this.paginationState.oldestTimestamp;

					// Update pagination state with the oldest timestamp from this page
					if (oldestInThisPage) {
						this.paginationState.oldestTimestamp = oldestInThisPage;
					}

					this.paginationState.pagesFetched++;

					// Mark pagination as complete if:
					// 1. We got no events
					// 2. We've reached or passed the "since" timestamp
					// 3. We're not making progress (same oldest timestamp as before)
					if (pageEvents === 0 ||
						(this.paginationState.oldestTimestamp && this.paginationState.oldestTimestamp <= paginationConfig.since) ||
						(previousOldest && this.paginationState.oldestTimestamp === previousOldest)) {
						this.paginationState.isComplete = true;
					}

					resolve();
				}
			});
		});
	}

	private async scheduleFetchNextPage(paginationConfig: NostrClientConfig['pagination']): Promise<void> {
		if (this.paginationState.isComplete) {
			return;
		}

		setTimeout(async () => {
			await this.fetchNextPage(paginationConfig);

			// Schedule next page if not complete
			if (!this.paginationState.isComplete) {
				this.scheduleFetchNextPage(paginationConfig);
			}
		}, paginationConfig.requestDelay);
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
		// Mark real-time subscription as inactive
		this.isRealTimeSubscriptionActive = false;

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

	// Stop real-time subscription
	stopRealTimeSubscription(): void {
		this.isRealTimeSubscriptionActive = false;
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
		reconnectInterval: 5000,
		maxReconnectAttempts: 5,
		pagination: {
			eventsPerPage: 500,
			requestDelay: 0,
			since: 1751410800
		}
	};
} 