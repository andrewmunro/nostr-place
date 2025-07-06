import { Filter, NostrEvent } from 'nostr-tools';
import { NostrClient } from './client';
import { PixelCodec } from './codec';
import { LIGHTNING_CONFIG } from './constants';
import { fetchLightningInvoice } from './lightning';
import { calculateCostBreakdown, getPixelPrice, PreviewPixel } from './pricing';
import { CanvasEventCallbacks, CostBreakdown, NostrClientConfig, PixelEvent, RelayConnection } from './types';

export class NostrCanvas extends NostrClient {
	private callbacks: CanvasEventCallbacks;
	private codec: PixelCodec;
	private pixels: Map<string, PixelEvent> = new Map();

	constructor(config: Partial<NostrClientConfig> = {}, callbacks: CanvasEventCallbacks) {
		const fullConfig = { ...createDefaultConfig(), ...config };
		super(fullConfig);

		this.callbacks = callbacks;
		this.codec = new PixelCodec(LIGHTNING_CONFIG.PUBKEY, this.config.relays);
	}

	async initialize(): Promise<void> {
		await this.connect();
		await this.fetchHistoricalEvents();
		this.subscribeToRealTimeEvents();
	}

	onRelayStatus(relay: RelayConnection): void {
		this.callbacks.onRelayStatus(relay);
	}

	onError(error: Error, context: string): void {
		this.callbacks.onError(error, context);
	}

	async fetchHistoricalEvents(until: number = Math.floor(Date.now() / 1000)): Promise<void> {
		if (!this.isConnected) {
			throw new Error('No connected relays');
		}

		let currentUntil = until;
		let pagesFetched = 0;
		const { since, eventsPerPage, requestDelay } = this.config.pagination;

		while (true) {
			const filter: Filter = {
				kinds: [90001, 9735],
				limit: eventsPerPage,
				until: currentUntil
			};

			let pageEvents = 0;
			let oldestInPage: number | undefined;
			let resolveFn!: () => void;

			await new Promise<void>((resolve) => {
				resolveFn = resolve;

				this.pool.subscribe(this.connectedRelays, filter, {
					onevent: (event: NostrEvent) => {
						if (event.created_at <= since) return;

						pageEvents++;
						this.handlePixelEvent(event);

						if (!oldestInPage || event.created_at < oldestInPage) {
							oldestInPage = event.created_at;
						}
					},
					oneose: () => {
						resolveFn();
					}
				});
			});

			pagesFetched++;

			const noProgress = !oldestInPage || oldestInPage >= currentUntil;
			const reachedSince = oldestInPage && oldestInPage <= since;

			if (pageEvents === 0 || reachedSince || noProgress) {
				break;
			}

			currentUntil = oldestInPage;
			await new Promise((res) => setTimeout(res, requestDelay));
		}
	}

	private subscribeToRealTimeEvents(): void {
		const filter: Filter = {
			kinds: [90001, 9735],
			since: Math.floor(Date.now() / 1000)
		};

		this.pool.subscribe(this.connectedRelays, filter, {
			onevent: (event: NostrEvent) => {
				this.handlePixelEvent(event);
			},
			onclose: () => {
				console.log('Real-time subscription ended, restarting...');
				this.subscribeToRealTimeEvents();
			},
		});
	}

	private handlePixelEvent(event: NostrEvent): void {
		if (event.kind !== 90001 && event.kind !== 9735) return;
		if (!event.tags.some(t => t[0] === 'app' && t[1] === 'Zappy Place')) return;

		const pixelEvent = this.codec.decodePixelEvent(event);

		// TODO validate pixel against business rules
		// validatePixelEvent(pixelEvent);

		for (const pixel of pixelEvent.pixels) {
			const pixelKey = `${pixel.x},${pixel.y}`;
			this.pixels.set(pixelKey, pixelEvent);
		}

		this.callbacks.onPixelEvent?.(pixelEvent);
	}

	// Event publishing
	async publishPixelEvent(pixelEvent: PixelEvent, debug = false) {
		if (!this.isConnected) {
			throw new Error('No connected relays');
		}

		const encodedEvent = this.codec.encodePixelEvent(pixelEvent, debug);
		const signedEvent = await window.nostr.signEvent(encodedEvent);

		if (debug) {
			console.log('Debug pixel event:', signedEvent);
			this.pool.publish(this.connectedRelays, signedEvent);
		} else {
			const lnurlResponse = await fetchLightningInvoice(pixelEvent, signedEvent);
			if (lnurlResponse.pr) {
				// // Show the invoice modal
				// showLightningInvoice(lnurlResponse.pr, amount, !!window.webln);

				// // Start polling for payment confirmation
				// const paymentHash = extractPaymentHash(lnurlResponse.pr);
				// pollForZapReceipt(window.NostrTools.nip19.decode(npub).data, amount, eventId, paymentHash);

				// Try to pay with WebLN if available
				if (window.webln) {
					try {
						await window.webln.enable();
						const result = await window.webln.sendPayment(lnurlResponse.pr);
						if (result.preimage) {
							// Payment successful through WebLN
							// The polling will detect it and show success
						}
					} catch (e) {
						// WebLN payment failed, user needs to pay manually
						console.log('WebLN payment failed, waiting for manual payment');
					}
				}
			}
		}
	}

	calculateCost(pixels: Array<{ x: number; y: number; color: string }>): CostBreakdown {
		const previewPixels: PreviewPixel[] = pixels.map(p => {
			const existingPixel = this.pixels.get(`${p.x},${p.y}`);
			const cost = getPixelPrice(existingPixel?.timestamp ? existingPixel.timestamp * 1000 : null);
			const isNew = !existingPixel;
			let existingPixelAge: number | undefined;

			if (existingPixel && existingPixel.timestamp) {
				existingPixelAge = (Date.now() - existingPixel.timestamp * 1000) / (1000 * 60 * 60);
			}

			return {
				x: p.x,
				y: p.y,
				color: p.color,
				cost,
				isNew,
				existingPixelAge
			};
		});

		return calculateCostBreakdown(previewPixels);
	}

	async disconnect(): Promise<void> {
		await this.disconnect();
	}
}

// Default configuration creator
export function createDefaultConfig(): NostrClientConfig {
	return {
		relays: [
			'wss://relay.nostr.band',
			'wss://relay.primal.net',
			// 'wss://relay.damus.io',
			// 'wss://nos.lol',
			// 'wss://offchain.pub'
		],
		reconnectInterval: 5000, // 5 seconds
		maxReconnectAttempts: 10,
		pagination: {
			eventsPerPage: 100,
			requestDelay: 1000, // 1 second between pages
			since: Math.floor(Date.now() / 1000) - 86400 * 1 // 1 days ago
		}
	};
} 