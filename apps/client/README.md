# Zappy Place Client App

**Presentation Layer** - A Vite + PixiJS frontend that handles all user interactions and pixel rendering for the zappy-place project.

## Domain Responsibilities

### ✅ What this app OWNS:
- **Pixel Rendering**: PixiJS-based canvas rendering and drawing
- **UI Interactions**: Click handlers, preview mode, batch selection
- **Camera/Viewport**: Zoom, pan, viewport management
- **Input Handling**: Mouse/touch interactions for pixel placement
- **Visual Feedback**: Preview mode, cost display, loading states
- **UI State Management**: UI-specific state (not business logic)

### ❌ What this app NEVER does:
- Import `nostr-tools`, `pako`, or other protocol libraries directly
- Handle event encoding/decoding or compression
- Calculate age-based pricing
- Manage relay connections or Nostr events
- Validate Nostr events or pixel data
- Handle Lightning payments directly
- Contain business logic or domain rules

## Current Files to Refactor

**Files that violate domain boundaries (should be moved to nostr-client):**
- `src/compression.ts` - Pixel encoding/decoding logic
- `src/pricing.ts` - Age-based pricing calculations  
- `src/zap-service.ts` - Lightning payment handling
- `src/nostr.ts` - Should be simplified to use nostr-client interface only

**Files that belong in the client app:**
- `src/renderer.ts` - PixiJS rendering
- `src/ui.ts` - UI interactions and state
- `src/input.ts` - Mouse/touch input handling
- `src/camera.ts` - Viewport and camera management
- `src/main.ts` - App initialization
- `src/style.css` - Styling

## Development

```bash
# Install dependencies
bun install

# Run development server
bun run dev

# Build for production
bun run build
```

## Interface Contract

The client app should ONLY interact with the nostr-client package through its exported interfaces. No direct protocol handling should exist in this app. 