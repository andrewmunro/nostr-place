import { Filter, NostrEvent } from 'nostr-tools';
import { NostrClient } from './client';
import { PixelCodec } from './codec';
import { LIGHTNING_CONFIG } from './constants';
import { fetchLightningInvoice } from './lightning';
import { calculateCostBreakdown, getPixelPrice, PreviewPixel } from './pricing';
import { CanvasEventCallbacks, CostBreakdown, NostrClientConfig, NostrProfile, PixelEvent, RelayConnection } from './types';
import { validatePixelEvent, validatePixelEventOptimistic } from './validation';

export class NostrCanvas extends NostrClient {
	private callbacks: CanvasEventCallbacks;
	private codec: PixelCodec;
	private pixels: Map<string, PixelEvent> = new Map();
	private processedEventIds: Set<string> = new Set(); // Track processed event IDs
	private profileCache: Map<string, NostrProfile> = new Map();

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
		const allEvents: NostrEvent[] = []; // Collect all events first

		// Collect all historical events
		while (true) {
			const filter: Filter = {
				kinds: [90001, 9735],
				'#p': [LIGHTNING_CONFIG.PUBKEY],
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
						allEvents.push(event); // Collect instead of processing immediately

						if (!oldestInPage || event.created_at < oldestInPage) {
							oldestInPage = event.created_at - 1;
						}
					},
					oneose: () => {
						resolveFn();
					}
				});
			});

			pagesFetched++;

			const lessThanLimit = pageEvents < eventsPerPage;
			const noProgress = !oldestInPage || oldestInPage >= currentUntil;
			const reachedSince = oldestInPage && oldestInPage <= since;

			if (pageEvents === 0 || lessThanLimit || reachedSince || noProgress) {
				break;
			}

			currentUntil = oldestInPage;
			await new Promise((res) => setTimeout(res, requestDelay));
		}

		// Sort events by timestamp (oldest first) for proper chronological processing
		allEvents.sort((a, b) => a.created_at - b.created_at);

		console.log(`Processing ${allEvents.length} historical events in chronological order...`);

		// Process events in chronological order (oldest to newest)
		for (const event of allEvents) {
			this.handlePixelEvent(event);
		}

		console.log(`Finished processing ${allEvents.length} historical events`);
	}

	private subscribeToRealTimeEvents(): void {
		const filter: Filter = {
			kinds: [90001, 9735],
			'#p': [LIGHTNING_CONFIG.PUBKEY],
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

		if (event.kind === 9735) {
			const description = JSON.parse(event.tags.find(t => t[0] === 'description')?.[1] || '{}');
			event = description;
		}

		// Deduplicate events by ID
		if (this.processedEventIds.has(event.id)) {
			return; // Skip already processed events
		}

		if (!event.tags.some(t => t[0] === 'app' && t[1] === 'Zappy Place')) return;

		const pixelEvent = this.codec.decodePixelEvent(event);

		// Validate pixel event against business rules
		const validationResult = validatePixelEventOptimistic(pixelEvent, (x, y) => this.getPixelEvent(x, y));

		if (!validationResult.isValid) {
			console.warn('Invalid pixel event received:', validationResult.errors);
			if (this.callbacks.onValidationError) {
				this.callbacks.onValidationError(pixelEvent, validationResult.errors);
			}
			return;
		}

		// Mark event as processed
		this.processedEventIds.add(event.id);

		// Store pixels from the event
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

		// Validate the pixel event before publishing
		const validationResult = validatePixelEvent(pixelEvent, (x, y) => this.getPixelEvent(x, y));

		if (!validationResult.isValid) {
			const errorMessage = `Cannot publish invalid pixel event: ${validationResult.errors.map(e => e.message).join(', ')}`;
			throw new Error(errorMessage);
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
					await window.webln.enable();
					const result = await window.webln.sendPayment(lnurlResponse.pr);
					if (result.preimage) {
						// Payment successful through WebLN
						// The polling will detect it and show success
					}
				}
			}
		}
	}

	calculateCost(pixels: Array<{ x: number; y: number; color: string }>): CostBreakdown {
		const previewPixels: PreviewPixel[] = pixels.map(p => {
			const existingPixel = this.getPixelEvent(p.x, p.y);
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

	getPixelEvent(x: number, y: number): PixelEvent | undefined {
		return this.pixels.get(`${x},${y}`);
	}

	// Profile fetching functionality
	async fetchProfile(pubkey: string): Promise<NostrProfile | null> {
		// Check cache first
		const cached = this.profileCache.get(pubkey);
		if (cached) {
			return cached;
		}

		try {
			// Create filter for kind 0 events (profile metadata)
			const filter: Filter = {
				kinds: [0],
				authors: [pubkey],
				limit: 1
			};

			return new Promise<NostrProfile | null>((resolve) => {
				let resolved = false;
				let profile: NostrProfile | null = null;

				const timeout = setTimeout(() => {
					if (!resolved) {
						resolved = true;
						// Return cached profile if available, even if expired
						resolve(cached || null);
					}
				}, 3000); // 3 second timeout

				this.pool.subscribe(this.connectedRelays, filter, {
					onevent: (event: NostrEvent) => {
						if (resolved) return;

						try {
							const metadata = JSON.parse(event.content);
							profile = {
								pubkey,
								name: metadata.name,
								display_name: metadata.display_name,
								about: metadata.about,
								picture: metadata.picture,
								nip05: metadata.nip05,
								website: metadata.website,
								lud16: metadata.lud16,
								banner: metadata.banner,
								fetchedAt: Date.now(),
								lastUpdated: event.created_at * 1000
							};

							// Cache the profile
							this.profileCache.set(pubkey, profile);
						} catch (error) {
							console.warn('Failed to parse profile metadata:', error);
						}
					},
					oneose: () => {
						if (!resolved) {
							resolved = true;
							clearTimeout(timeout);
							resolve(profile);
						}
					},
					onclose: () => {
						if (!resolved) {
							resolved = true;
							clearTimeout(timeout);
							resolve(cached || null);
						}
					}
				});
			});
		} catch (error) {
			console.error('Failed to fetch profile:', error);
			// Return cached profile if available
			return cached || null;
		}
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
			since: 1751821200 // Sunday, 6 July 2025 17:00:00
		}
	};
} 