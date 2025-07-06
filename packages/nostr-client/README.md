# @zappy-place/nostr-client

**Nostr Domain Layer** - A TypeScript package that handles all Nostr communication, event processing, and business logic for the zappy-place project.

## Domain Responsibilities

### ✅ What this package OWNS:
- **Nostr Communication**: Relay connections, event subscriptions, publishing
- **Event Encoding/Decoding**: Gzip + base64 compression for pixel data
- **Age-based Pricing**: Calculate pixel costs based on placement age
- **Zap Request Creation**: Build kind 9734 zap request events
- **Event Validation**: Validate incoming zap events and pixel data
- **Canvas State Management**: Maintain canonical pixel state from events
- **Lightning Integration**: Handle LNURL-pay and WebLN payment flows

### ❌ What this package NEVER does:
- UI rendering or PixiJS operations
- Input handling or camera/viewport management
- Direct DOM manipulation or user interface logic

## Installation

```bash
npm install @zappy-place/nostr-client
```

## Usage

### Basic Setup

```typescript
import { NostrCanvas } from '@zappy-place/nostr-client';

// Create canvas with event callbacks
const canvas = new NostrCanvas({
  canvasPubkey: 'your-canvas-pubkey',
  relays: ['wss://relay.example.com'],
  onPixelChanged: (pixel) => {
    // Client app should render the pixel changes
    console.log(`Pixel updated at (${pixel.x}, ${pixel.y}): ${pixel.color}`);
  },
  onRelayStatus: (relay) => {
    console.log(`Relay ${relay.url}: ${relay.status}`);
  },
  onError: (error, context) => {
    console.error(`Error in ${context}:`, error);
  }
});

// Initialize and connect
await canvas.initialize();
```

### Submit Pixels

```typescript
// Preview pixels from client UI
const previewPixels = [
  { x: 10, y: 20, color: '#ff0000' },
  { x: 11, y: 20, color: '#00ff00' }
];

// Submit batch (handles pricing, compression, zap creation, payment)
try {
  await canvas.submitPixels(previewPixels);
  console.log('Pixels submitted successfully!');
} catch (error) {
  console.error('Failed to submit pixels:', error);
}
```

### Interface Contract

The client app should ONLY use these exported interfaces:

```typescript
// Main class
export class NostrCanvas {
  initialize(): Promise<void>
  calculateCost(pixels: Pixel[]): CostBreakdown
  submitPixels(pixels: Pixel[]): Promise<void>
  getPixel(x: number, y: number): Pixel | null
  getAllPixels(): Pixel[]
  disconnect(): Promise<void>
}

// Callback interfaces
export interface NostrCanvasCallbacks {
  onPixelChanged: (pixel: Pixel) => void
  onRelayStatus: (relay: RelayStatus) => void
  onError: (error: Error, context: string) => void
}

// Data types
export interface Pixel {
  x: number
  y: number
  color: string
  timestamp?: number
  zapId?: string
  ownerPubkey?: string | null
}

export interface CostBreakdown {
  totalSats: number
  pixelCounts: {
    new: number
    fresh: number
    recent: number
    older: number
    ancient: number
  }
}
```

## Architecture Principles

1. **Clean Interface**: Client app never imports nostr-tools, pako, or other protocol libraries
2. **Callback-based**: All updates flow through callbacks to maintain separation
3. **Business Logic Encapsulation**: All pricing, validation, and encoding logic stays in this package
4. **Error Boundaries**: Package handles all Nostr-related errors internally
5. **Optimistic Updates**: Immediate pixel rendering with retroactive validation
