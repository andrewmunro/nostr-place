export interface NostrEvent {
	id: string;
	kind: number;
	pubkey: string;
	created_at: number;
	tags: string[][];
	content: string;
	sig: string;
}

export interface PixelEvent extends NostrEvent {
	kind: 90001;
}

export interface ZapEvent extends NostrEvent {
	kind: 9735;
}

export interface Pixel {
	x: number;
	y: number;
	color: string;
	eventId: string;
	pubkey: string;
	timestamp: number;
	zapEventId?: string;
	zapAmount?: number;
	isValid?: boolean;
}

export interface ValidationResult {
	isValid: boolean;
	reason?: string;
}

export interface CanvasConfig {
	minZapAmount: number; // in millisats
	zapTimeWindow: number; // in seconds
	maxPixelAge: number; // in seconds
	canvasSize: number; // canvas dimensions (width/height)
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
	canvasConfig: CanvasConfig;
	reconnectInterval: number; // milliseconds
	maxReconnectAttempts: number;
	pagination: {
		eventsPerPage: number;
		requestDelay: number; // milliseconds between paginated requests
		since: number; // epoch timestamp - only fetch events since this time
	};
}

// Event callback types
export interface CanvasEventCallbacks {
	onPixelUpdate?: (pixel: Pixel) => void;
	onRelayStatus?: (relay: RelayConnection) => void;
	onEventReceived?: (event: NostrEvent) => void;
	onError?: (error: Error, context?: string) => void;
}

export interface NostrClientState {
	isConnected: boolean;
	connectedRelays: string[];
	pixels: Map<string, Pixel>;
	pixelEvents: Map<string, PixelEvent>;
	zapEvents: Map<string, ZapEvent>;
} 