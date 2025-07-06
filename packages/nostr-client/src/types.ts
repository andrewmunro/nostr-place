import { NostrEvent } from "nostr-tools";

export interface PixelData {
	x: number;
	y: number;
	color: string;
}

export interface PixelEvent {
	pixels: PixelData[];
	amount: number;
	senderPubkey?: string;
	timestamp?: number;
	message?: string;
	url?: string;
}

export interface CanvasConfig {
	pubkey: string;
	lnurl: string;
}

// Relay connection types
export interface RelayConnection {
	url: string;
	status: 'connecting' | 'connected' | 'disconnected' | 'error';
	lastConnected?: number;
	errorCount: number;
}

export interface NostrClientConfig {
	relays: string[];
	reconnectInterval: number; // milliseconds
	maxReconnectAttempts: number;
	pagination: {
		eventsPerPage: number;
		requestDelay: number; // milliseconds between paginated requests
		since: number; // epoch timestamp - only fetch events since this time
	};
}

// Validation error types
export interface ValidationError {
	type: 'INVALID_COORDINATES' | 'INVALID_COLOR' | 'INVALID_AMOUNT' | 'TOO_MANY_PIXELS' | 'INVALID_TIMESTAMP';
	message: string;
	pixelIndex?: number;
	pixel?: PixelData;
}

// Event callback types
export interface CanvasEventCallbacks {
	onPixelEvent?: (pixel: PixelEvent) => void;
	onValidationError?: (event: PixelEvent, errors: ValidationError[]) => void;
	onRelayStatus?: (relay: RelayConnection) => void;
	onError?: (error: Error, context?: string) => void;
}

export interface NostrClientState {
	isConnected: boolean;
	connectedRelays: string[];
	pixels: Map<string, PixelEvent>;
	// zapEvents: Map<string, ZapEvent>;
}

export interface CostBreakdown {
	totalSats: number;
	pixelCounts: {
		new: number;
		fresh: number;
		recent: number;
		older: number;
		ancient: number;
	};
}

// Browser extension type declarations
declare global {
	interface Window {
		webln?: {
			enable(): Promise<void>;
			makeInvoice(args: { amount: number; defaultMemo?: string }): Promise<{ paymentRequest: string }>;
			sendPayment(paymentRequest: string): Promise<{ preimage: string }>;
		};
		nostr?: {
			getPublicKey(): Promise<string>;
			signEvent(event: NostrEvent): Promise<NostrEvent>;
		};
	}
}