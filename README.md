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

- `apps/client` – The React/PixiJS frontend.
- `packages/nostr-canvas` - Package that handles the canvas state and Nostr events. Decoupled from the client to allow movement to a backend server at a later date.


## 🖼️ Nostr Event Format

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

### 🔧 Encoding/Decoding Process
```javascript
import pako from "pako";

// Encode pixels for transmission
function encodePixels(pixels) {
  const payload = pixels.map(p => `${p.x},${p.y},${p.color}`).join('\n');
  const compressed = pako.deflate(payload);
  const base64 = btoa(String.fromCharCode(...compressed));
  return base64;
}

// Decode pixels from zap event
function decodePixels(base64) {
  const binary = atob(base64);
  const byteArray = Uint8Array.from(binary, char => char.charCodeAt(0));
  const decompressed = pako.inflate(byteArray, { to: 'string' });
  
  const lines = decompressed.trim().split('\n');
  return lines.map(line => {
    const [x, y, color] = line.split(',');
    return { x: parseInt(x), y: parseInt(y), color };
  });
}

// Relay filter for pixel zaps
const filter = {
  kinds: [9734],
  "#app": ["zappy-place"],
  since: Math.floor(Date.now() / 86400) * 86400 // today
};

// Age-based pricing validation
function validateZapEvent(zapEvent, currentPixels) {
  const pixels = decodePixels(zapEvent.content);
  const declaredAmount = parseInt(zapEvent.tags.find(t => t[0] === 'amount')[1]);
  const zapTimestamp = zapEvent.created_at * 1000;
  
  let expectedAmount = 0;
  for (const pixel of pixels) {
    const pixelKey = `${pixel.x},${pixel.y}`;
    const existingPixel = currentPixels.get(pixelKey);
    
    if (!existingPixel) {
      expectedAmount += 1000; // 1 sat for new pixels
    } else {
      // Calculate age-based pricing
      const ageHours = (zapTimestamp - existingPixel.timestamp) / (1000 * 60 * 60);
      expectedAmount += getAgePricing(ageHours);
    }
  }
  
  return declaredAmount === expectedAmount;
}

function getAgePricing(ageHours) {
  if (ageHours < 1) return 10000;      // 10 sats (< 1 hour)
  if (ageHours < 24) return 5000;      // 5 sats (1-24 hours)
  if (ageHours < 168) return 2000;     // 2 sats (1-7 days)
  return 1000;                         // 1 sat (> 1 week)
}

// Optimistic rendering with retroactive validation
function handleIncomingEvent(zapEvent) {
  // 1. Immediately render pixels for instant feedback
  renderPixelsOptimistically(zapEvent);
  
  // 2. Queue for validation as historical data becomes available
  queueForValidation(zapEvent);
  
  // 3. Remove if validation fails
  validateEventAsync(zapEvent).then(isValid => {
    if (!isValid) {
      removeInvalidPixels(zapEvent);
      console.log(`Removed invalid event: ${zapEvent.id}`);
    } else {
      markPixelsAsConfirmed(zapEvent);
    }
  });
}
```

## ✅ Validation Rules (Client-Side)
When reconstructing the canvas:

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

## Business logic

1. **Canvas Loading:**  
   The user loads the canvas which displays all existing pixels from validated zap events.

2. **Preview Mode:**  
   When the user starts placing pixels, the canvas enters preview mode:
   - Existing pixels are dimmed to highlight the user's work
   - A detailed cost breakdown shows pricing by category (new, fresh, recent, old, ancient)
   - Smart relocation tool allows dragging the entire design to find cheaper areas
   - Visual age indicators help identify expensive vs cheap placement zones
   - User can place multiple pixels before submitting

3. **Batch Submission:**  
   Once satisfied with their design, the user clicks submit:
   - Creates a single `kind: 9734` zap request with compressed pixel data
   - Zap amount equals sum of pixel prices (age-based pricing)
   - All pixels are gzip-compressed and base64-encoded in the content field
   - Maximum 300 pixels per batch to avoid size limits

4. **Client-side validation:**  
   The app listens for `kind: 9734` zap request events and validates each:
   - Decompresses and parses pixel data from content field
   - Zap amount must match sum of pixel prices (age-based validation)
   - All pixel coordinates must be within canvas bounds
   - Colors must be valid hex format

5. **Pixel rendering (Optimistic):**  
   Pixels are rendered immediately for instant feedback:
   - Render pixels as soon as zap events are received
   - Mark pixels as "temporary" until validation completes
   - Remove invalid pixels if validation fails with historical data
   - Visual indicators distinguish confirmed vs temporary pixels
   - Handle conflicts by timestamp (latest wins)