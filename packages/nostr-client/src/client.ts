import { SimplePool } from 'nostr-tools/pool';
import {
	NostrClientConfig,
	RelayConnection
} from './types';

export abstract class NostrClient {
	protected pool: SimplePool;
	protected relays: Map<string, RelayConnection>;
	protected config: NostrClientConfig;
	private reconnectTimers: Map<string, NodeJS.Timeout>;

	constructor(config: NostrClientConfig) {
		this.config = config;
		this.pool = new SimplePool();
		this.relays = new Map();
		this.reconnectTimers = new Map();

		this.initializeRelays();
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
	}

	abstract onRelayStatus(relay: RelayConnection): void;
	abstract onError(error: Error, context: string): void;

	get isConnected(): boolean {
		return [...this.relays.values()].some(relay => relay.status === 'connected');
	}

	get connectedRelays(): string[] {
		return Array.from(this.relays.values())
			.filter(relay => relay.status === 'connected')
			.map(relay => relay.url);
	}

	private async connectToRelay(url: string): Promise<void> {
		const relay = this.relays.get(url);
		if (!relay) return;

		try {
			relay.status = 'connecting';
			this.onRelayStatus?.(relay);

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

			this.onRelayStatus?.(relay);

			// Re-establish real-time subscription if it was active
			// TODO check if needed
			// if (this.isRealTimeSubscriptionActive) {
			// 	this.subscribeToRealTimeEvents();
			// }
		} catch (error) {
			relay.status = 'error';
			relay.errorCount++;

			this.onRelayStatus?.(relay);
			this.onError?.(error as Error, `Connecting to relay ${url}`);

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

	getRelayStatuses(): RelayConnection[] {
		return Array.from(this.relays.values());
	}

	// Cleanup
	async disconnect(): Promise<void> {
		// Clear reconnect timers
		this.reconnectTimers.forEach(timer => clearTimeout(timer));
		this.reconnectTimers.clear();

		// Close pool
		this.pool.close(Array.from(this.relays.keys()));

		// Update state
		this.relays.forEach(relay => {
			relay.status = 'disconnected';
		});
	}
}