# 🎨 zappy-place

A fully decentralized, censorship-resistant pixel canvas inspired by Reddit Place — powered by [Nostr](https://nostr.com) and Lightning ⚡ Zaps.

## Inspiration

- https://www.reddit.com/r/place/
- http://www.milliondollarhomepage.com/
- https://pxls.space

## 🚀 Features

- 🧱 Canvas state is **derived from Nostr relays**
- ⚡ Pixel placement requires a **Lightning Zap (NIP-57)**
- 🧩 Built with Vite, Bun, PixiJS, and vanilla HTML/JS
- 🧠 Zero backend infrastructure

---

## 📦 Tech Stack

- **[Vite](https://vitejs.dev/)** – lightning-fast build tool
- **[Bun](https://bun.sh/)** – JavaScript runtime and package manager
- **[PixiJS](https://pixijs.com/)** – WebGL renderer for fast canvas drawing
- **[Nostr Tools](https://github.com/nbd-wtf/nostr-tools)** – Nostr client library
- **[WebLN (Alby)](https://getalby.com/)** – For zapping via browser

---

## ⚙️ Project Structure

- `apps/client` – The React/PixiJS frontend.
- `packages/nostr-canvas` - Package that handles the canvas state and Nostr events. Decoupled from the client to allow movement to a backend server at a later date.


## 🖼️ Nostr Event Format

### 🧱 Pixel Placement Event (kind: 90001)
```json
{
  "kind": 90001,
  "pubkey": "<user_pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["x", "42"],
    ["y", "19"],
    ["color", "#ff0000"],
    ["zap_required", "true"]
  ],
  "content": "Placing red pixel at (42, 19)"
}
```

### 🧱 Zap Request (kind: 9735)
```json
{
  "kind": 9735,
  "pubkey": "<zapper_pubkey>",
  "created_at": 1234567900,
  "tags": [
    ["e", "<pixel_event_id>"],           // Must reference pixel event
    ["p", "<canvas_pubkey>"],            // Zap receiver
    ["x", "42"],                          // Optional: Redundant pixel position
    ["y", "19"],
    ["color", "#ff0000"],
    ["amount", "1000"]                   // Optional: Redundant msat value
  ],
  "content": "Zap for pixel (42,19)"
}
```

## ✅ Validation Rules (Client-Side)
When reconstructing the canvas:

1. Only accept pixel events with a valid Zap event
	- Zap must reference the pixel event ID ("e" tag)
	- Must be within X minutes of the pixel event timestamp
2. One Zap per pixel event
	- Prevent double-use of the same event
3. Zap must meet minimum sats (e.g. 100 sats)
	- Decode bolt11 or amount tag

8. (Optional) Use "x", "y" and "color" tags in the zap event to match metadata

## Business logic

1. **Pixel event creation:**  
   The user creates and publishes a `kind: 30001` pixel event with coordinates and color.

2. **Zap event creation:**  
   The user zaps the pixel event by publishing a `kind: 9735` zap event referencing the pixel event ID.

3. **Client-side validation:**  
   The app listens for `kind: 30001` pixel events and validates each by ensuring there is a corresponding zap event:
   - Zap event must reference the pixel event ID in the `"e"` tag.
   - Zap event timestamp must be *after* the pixel event’s timestamp.
   - Zap payment amount must meet or exceed the minimum cost per pixel.

4. **Pixel rendering:**  
   Only pixels with valid zap proof are rendered on the canvas.

5. **Additional constraints:**  
   - Enforce a time window (e.g., zap within 5 minutes after pixel event).  
   - Accept only one zap per pixel event to avoid double payments.  
   - Latest valid zap (if multiples) wins or decide via business rules.