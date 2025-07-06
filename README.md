# 🎨 zappy-place

A fully decentralized, censorship-resistant pixel canvas inspired by Reddit Place — powered by [Nostr](https://nostr.com) and Lightning ⚡ Zaps.

## Inspiration

- https://www.reddit.com/r/place/
- http://www.milliondollarhomepage.com/
- https://pxls.space

## 🚀 Features

- 🧱 Canvas state is **derived from Nostr relays**
- ⚡ **Batched pixel placement** - pay once for multiple pixels (up to 300)
- 🎨 **Smart preview mode** - see your design, cost breakdown, and relocate before submitting
- 💰 **Age-based pricing** - Fresh pixels cost more to overwrite, encouraging collaboration
- 🗜️ **Efficient compression** - gzip + base64 encoding for maximum pixels per event
- 🧩 Built with Vite, Bun, PixiJS, and vanilla HTML/JS
- 🧠 Zero backend infrastructure

---

## 🎨 User Experience

### Preview Mode Workflow
1. **Load Canvas** - View all existing pixels from the network
2. **Start Placing** - Click pixels to enter preview mode
3. **Design Preview** - Existing pixels dim, your pixels glow, cost counter updates
4. **Cost Breakdown** - See detailed pricing: "2 new pixels (2 sats), 3 fresh pixels (30 sats), 1 old pixel (2 sats)"
5. **Smart Relocation** - Drag your entire design to find cheaper placement areas
6. **Submit Batch** - Click submit to zap and broadcast all pixels at once
7. **Live Update** - Your pixels appear permanently as the zap is received

### Cost Structure
- **1 sat per new pixel** - Base pricing for empty spaces
- **Age-based overwrite pricing** - Protects recent work while allowing evolution
  - Fresh pixels (< 1 hour): 10 sats to overwrite
  - Recent pixels (1-24 hours): 5 sats to overwrite
  - Older pixels (1-7 days): 2 sats to overwrite
  - Ancient pixels (> 1 week): 1 sat to overwrite
- **Batched payments** - One zap for multiple pixels reduces fees
- **300 pixel limit** - Maximum pixels per batch to avoid size constraints
- **Real-time cost tracking** - See total cost before submitting (varies by age)
- **Cost breakdown display** - Detailed pricing explanation by pixel age categories
- **Smart relocation tool** - Drag entire designs to find cheaper placement areas
- **Visual age indicators** - Color-coded pixels showing relative placement costs

---

## 📦 Tech Stack

- **[Vite](https://vitejs.dev/)** – lightning-fast build tool
- **[Bun](https://bun.sh/)** – JavaScript runtime and package manager
- **[PixiJS](https://pixijs.com/)** – WebGL renderer for fast canvas drawing
- **[Nostr Tools](https://github.com/nbd-wtf/nostr-tools)** – Nostr client library
- **[WebLN (Alby)](https://getalby.com/)** – For zapping via browser
- **[Pako](https://github.com/nodeca/pako)** – Gzip compression for efficient pixel data encoding

---

## ⚙️ Project Structure

### Domain Boundaries

**`packages/nostr-client`** - **Nostr Domain Layer**
- **All Nostr communication**: connecting to relays, subscribing to events, publishing events
- **Event encoding/decoding**: gzip + base64 compression for pixel data
- **Age-based pricing**: calculating pixel costs based on age
- **Zap request creation**: building kind 9734 zap request events
- **Event validation**: validating incoming zap events and pixel data
- **Canvas state management**: building canvas state from validated events
- **Lightning integration**: handling LNURL-pay and WebLN payment flow

**`apps/client`** - **Presentation Layer**
- **Pixel rendering**: PixiJS-based canvas rendering
- **UI interactions**: click handlers, preview mode, batch selection
- **Camera/viewport**: zoom, pan, viewport management
- **Input handling**: mouse/touch interactions for pixel placement
- **Visual feedback**: preview mode, cost display, loading states
- **State management**: UI state only (not business logic)

## 🖼️ Nostr Event Format

*Note: This section documents the protocol specification. All event handling, encoding/decoding, and validation is implemented in the `@zappy-place/nostr-client` package.*

### 🧱 Batched Pixel Placement Zap Request (kind: 9734)
```json
{
  "kind": 9734,
  "pubkey": "<zapper_pubkey>",
  "created_at": 1234567900,
  "content": "eJyrVkosLcmIz8nPS1WyUoLB+OTi/KLM9FQlKyVnv5BCK6W4oqiYoLSqYnGcmJAUhIwB",
  "tags": [
    ["p", "<canvas_pubkey>"],            // Zap receiver
    ["relays", "wss://relay.example.com"],
    ["app", "zappy-place"],
    ["encoding", "gzip+base64:v1"],
    ["amount", "15000"]                  // Total msat value (varies by pixel age: 1 new + 2 fresh overwrites)
  ]
}
```

**Content Field**: Base64-encoded gzip-compressed pixel data
- Raw format: `x,y,color\nx,y,color\n...` (newline-separated)
- Example raw: `42,19,#ff0000\n43,19,#ff0000\n44,19,#00ff00`
- Compressed and encoded for efficient transmission
- **Limit: 300 pixels per zap** to avoid size constraints

### 🔧 Implementation Details

All encoding/decoding, validation, and event handling is implemented in the `@zappy-place/nostr-client` package. The client app does not need to understand the Nostr protocol details - it only needs to:

1. **Submit pixels**: `await canvas.submitPixels(previewPixels)`
2. **Receive pixel updates**: Handle the `onPixelUpdate` callback
3. **Display costs**: Handle the `onCostUpdate` callback

The nostr-client package handles:
- Gzip compression and base64 encoding
- Age-based pricing calculations
- Event validation and filtering
- Optimistic rendering with retroactive validation
- Lightning payment integration

## ✅ Validation Rules (nostr-client Package)
*These validation rules are implemented in the `@zappy-place/nostr-client` package:*

1. Only accept `kind: 9734` zap request events with pixel data
	- Must contain `["app", "zappy-place"]` tag
	- Must have `["encoding", "gzip+base64:v1"]` tag
	- Must have valid `["amount", "msat_value"]` tag
2. Decode and validate pixel data
	- Decompress base64 + gzip content field
	- Parse newline-separated `x,y,color` format
	- Maximum 300 pixels per zap event
3. Validate zap payment amount with age-based pricing
	- New pixels: 1000 msats (1 sat)
	- Overwriting pixels < 1 hour old: 10000 msats (10 sats)
	- Overwriting pixels 1-24 hours old: 5000 msats (5 sats)
	- Overwriting pixels 1-7 days old: 2000 msats (2 sats)
	- Overwriting pixels > 1 week old: 1000 msats (1 sat)
	- Total amount must equal sum of individual pixel prices
4. Validate pixel coordinates and colors
	- Coordinates must be within canvas bounds
	- Colors must be valid hex format (#rrggbb)
5. Optimistic rendering with retroactive validation
	- Render events immediately for instant feedback
	- Validate pricing as historical data becomes available
	- Remove invalid events from canvas if validation fails
	- Visual indicators for temporary vs confirmed pixels
6. Handle pixel conflicts (same coordinate)
	- Later timestamp wins (most recent zap)
	- Validate bolt11 invoice amount matches declared amount

## Business Logic Flow

### Client App Responsibilities

1. **Canvas Loading & Rendering:**  
   - Initialize PixiJS canvas and camera system
   - Subscribe to pixel updates from nostr-client package
   - Render pixels received via `onPixelUpdate` callback

2. **Preview Mode (UI Layer):**  
   - Detect pixel placement clicks and enter preview mode
   - Dim existing pixels to highlight user's work
   - Display cost breakdown received from `onCostUpdate` callback
   - Handle smart relocation tool for dragging designs
   - Show visual age indicators for placement cost zones
   - Allow multiple pixel placement before submission

3. **Batch Submission (UI Trigger):**  
   - Collect preview pixels from UI state
   - Call `await canvas.submitPixels(previewPixels)` 
   - Handle loading states and error feedback
   - Clear preview mode after successful submission

4. **Visual Feedback:**  
   - Display loading spinners during submissions
   - Show success/error messages
   - Handle optimistic vs confirmed pixel rendering
   - Manage viewport, zoom, and camera controls

### nostr-client Package Responsibilities

1. **Canvas State Management:**  
   - Listen for `kind: 9734` zap request events
   - Validate and decode pixel data from events
   - Maintain canonical canvas state from blockchain
   - Calculate age-based pricing for pixel overwrites

2. **Event Processing:**  
   - Compress pixel data using gzip + base64
   - Create properly formatted zap request events
   - Handle Lightning payment flow (LNURL-pay + WebLN)
   - Validate event amounts match pixel pricing

3. **Optimistic Rendering:**  
   - Immediately notify client of new pixels via `onPixelUpdate`
   - Queue events for validation as historical data loads
   - Remove invalid pixels and notify client if validation fails
   - Handle pixel conflicts by timestamp (latest wins)