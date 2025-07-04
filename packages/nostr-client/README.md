# @zappy-place/nostr-client

A TypeScript package for fetching and publishing Nostr events for the zappy-place project.

## Features

- **Nostr Relay Management**: Connect to multiple Nostr relays with automatic reconnection
- **Event Validation**: Validate pixel and zap events according to the nostr-place protocol
- **Canvas State**: Build and maintain canvas state from Nostr events
- **Real-time Updates**: Subscribe to live pixel placement events
- **Lightning Integration Ready**: Built-in support for zap event validation

## Installation

```bash
npm install @zappy-place/nostr-client
```

## Usage

### Basic Setup

```typescript
import { NostrClient, createDefaultConfig } from '@zappy-place/nostr-client';

// Create a client with default configuration
const config = createDefaultConfig();
const client = new NostrClient(config, {
  onPixelUpdate: (pixel) => {
    console.log(`Pixel updated at (${pixel.x}, ${pixel.y}): ${pixel.color}`);
  },
  onRelayStatus: (relay) => {
    console.log(`Relay ${relay.url}: ${relay.status}`);
  },
  onError: (error, context) => {
    console.error(`Error in ${context}:`, error);
  }
});
```

### Connect and Subscribe to Canvas

```typescript
async function startCanvas() {
  // Generate or set user keys
  const { privateKey, publicKey } = client.generateKeys();
  console.log('Your public key:', publicKey);
  
  // Connect to relays
  await client.connect();
  
  // Subscribe to canvas events
  await client.subscribeToCanvas();
  
  // Get current canvas state
  const pixels = client.getPixels();
  console.log(`Canvas has ${pixels.size} pixels`);
}
```

### Publishing Pixel Events

```typescript
async function placePixel(x: number, y: number, color: string) {
  try {
    const eventId = await client.publishPixelEvent(x, y, color);
    console.log(`Published pixel event: ${eventId}`);
  } catch (error) {
    console.error('Failed to place pixel:', error);
  }
}

// Place a red pixel at (100, 100)
await placePixel(100, 100, '#ff0000');
```

### Custom Configuration

```typescript
import { NostrClientConfig } from '@nostr-place/nostr-canvas';

const customConfig: NostrClientConfig = {
  relays: [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.nostr.band'
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

const client = new NostrClient(customConfig, callbacks);
```

### Event Callbacks

```typescript
const callbacks = {
  onPixelUpdate: (pixel) => {
    // Handle pixel updates - called for each pixel change
    updateCanvasPixel(pixel.x, pixel.y, pixel.color);
  },
  
  onRelayStatus: (relay) => {
    // Handle relay connection status changes
    updateRelayIndicator(relay.url, relay.status);
  },
  
  onEventReceived: (event) => {
    // Handle all incoming Nostr events
    console.log('Received event:', event.kind);
  },
  
  onError: (error, context) => {
    // Handle errors
    showErrorNotification(`${context}: ${error.message}`);
  }
};
```

## API Reference

### NostrClient

#### Methods

- `generateKeys()`: Generate a new key pair
- `setKeys(privateKey: string)`: Set existing private key
- `getPublicKey()`: Get current public key
- `connect()`: Connect to all configured relays
- `subscribeToCanvas()`: Subscribe to pixel and zap events
- `publishPixelEvent(x, y, color)`: Publish a new pixel placement
- `getPixels()`: Get current canvas state as Map<string, Pixel>
- `getRelayStatuses()`: Get detailed relay connection info
- `disconnect()`: Disconnect from all relays

#### Event Callbacks

- `onPixelUpdate`: Called when any pixel is updated
- `onRelayStatus`: Relay connection status changed
- `onEventReceived`: Any Nostr event received
- `onError`: Error occurred

#### Getting Individual Pixels

```typescript
// Get all pixels
const pixels = client.getPixels();

// Get specific pixel
const pixel = pixels.get(`${x},${y}`);
if (pixel) {
  console.log(`Pixel at (${x},${y}): ${pixel.color}`);
}
```

## Protocol

This package implements the nostr-place protocol:

- **Pixel Events (kind 30001)**: Represent pixel placements with x, y, color tags
- **Zap Events (kind 9735)**: Lightning payments that validate pixel placements
- **Validation**: Only pixels with valid zap payments are rendered
- **Time Windows**: Zaps must occur within configured time window of pixel event

## License

MIT 