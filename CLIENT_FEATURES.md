# 🎨 Nostr Place Client Features

A **pxls.space-inspired** pixel canvas client built with **vanilla TypeScript + PixiJS**.

## ✨ **Core Features**

### 🖼️ **Infinite Canvas**
- **2000x2000 pixel world** with smooth navigation
- **Zoom range**: 0.5x to 50x scale
- **Performance optimized** - only renders visible pixels
- **Adaptive grid** - shows grid lines when zoomed in (>2x)
- **🎨 Test Data Included** - Rich dummy pixel patterns for testing

### 🎮 **Navigation Controls**

#### **Mouse Controls**
- **Left Click**: Place pixel at cursor position
- **Right/Middle Click + Drag**: Pan around the canvas
- **Mouse Wheel**: Zoom in/out (centered on cursor position)
- **Hover**: Live coordinates and pixel preview

#### **Keyboard Controls**
- **WASD** or **Arrow Keys**: Move camera around
- **Movement speed** scales with zoom level

### 🎨 **Color System**
- **24 preset colors** (pxls.space palette)
- **Color picker** at bottom of screen
- **Visual selection** with hover effects and selection highlighting
- **Preview cursor** shows where pixel will be placed

### 🌐 **URL Synchronization**
- **Real-time URL updates** with camera position and zoom
- **Format**: `#x=1000&y=1000&scale=4.00`
- **Shareable links** - send exact view to others
- **Browser history** integration

### 🖱️ **User Experience**
- **Fullscreen canvas** with minimal UI
- **Coordinates display** (top-left corner)
- **Scale indicator** shows current zoom level
- **Smooth animations** and transitions
- **No lag** pixel placement and navigation

## 🎭 **Test Data Features**

The canvas includes **rich dummy data** for testing all features:

### **🎯 Navigation Landmarks**
- **Orange borders** around the entire 2000x2000 canvas
- **Colored corner markers** (Red, Green, Blue, Yellow) for orientation
- **Center crosshairs** (gray lines) at (1000, 1000)

### **🎨 Visual Test Patterns**
- **Concentric squares** in the center with different colors
- **Checkerboard pattern** (top-left) for grid alignment testing
- **Color gradient** (top-right) for smooth color transitions  
- **Random dots** (bottom-left) for performance testing
- **"NOSTR" text** (bottom-right) rendered in pixel art

### **🚀 Easy to Remove**
All test data is in `src/dummyData.ts` - simply:
1. Comment out the import in `main.ts` 
2. Replace `generateDummyPixels()` with `new Map<string, Pixel>()`

## 🏗️ **Technical Architecture**

### **Frontend Stack**
- ⚡ **Vite** - Lightning-fast dev server and builds
- 🎭 **PixiJS** - WebGL-accelerated canvas rendering
- 📝 **TypeScript** - Type-safe development
- 🎨 **Modern CSS** - Clean, responsive design

### **Performance Features**
- **Viewport culling** - Only renders visible pixels
- **Efficient rendering** - Separate containers for grid/pixels
- **Camera system** - Smooth zoom and pan
- **Event optimization** - Debounced URL updates

### **Code Organization**
```
apps/client/
├── src/main.ts          # Main application logic
├── src/dummyData.ts     # Test pixel patterns (removable)
├── src/style.css        # pxls.space-inspired styling  
├── index.html           # Minimal HTML structure
└── package.json         # Vanilla JS dependencies
```

## 🎯 **Current State**

### ✅ **Working Features**
- [x] Interactive 2000x2000 pixel canvas
- [x] Smooth zoom and pan controls  
- [x] URL synchronization (#x=1000&y=1000&scale=4.00)
- [x] 24-color palette with selection
- [x] Pixel placement with visual preview
- [x] Keyboard navigation (WASD/arrows)
- [x] Responsive design and performance optimization
- [x] Grid overlay when zoomed in
- [x] Coordinates and scale display
- [x] Rich test data with visual patterns

### 🚧 **Ready for Integration**
- [ ] Nostr event publishing (pixel placement)
- [ ] Lightning zap payments  
- [ ] Canvas state synchronization from relays
- [ ] Real-time pixel updates from other users

## 🎮 **How to Use**

1. **Navigate**: Use mouse wheel to zoom, right-click + drag to pan
2. **Move**: Use WASD or arrow keys for precise movement  
3. **Select Color**: Click any color in the bottom palette
4. **Place Pixel**: Left-click on the canvas
5. **Share**: Copy URL to share exact view with others
6. **Explore**: Check out the test patterns in different areas!

### 🗺️ **Test Pattern Locations**
- **Center (1000,1000)**: Concentric squares and crosshairs
- **Top-left (100,100)**: Black/white checkerboard
- **Top-right (1500,100)**: Colorful gradient  
- **Bottom-left (100,1500)**: Random colored dots
- **Bottom-right (1400,1600)**: "NOSTR" pixel text
- **Corners**: Colored markers for orientation

The client provides a **smooth, responsive experience** similar to pxls.space, ready for Nostr and Lightning integration! 