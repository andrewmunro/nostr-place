import { PixelData } from '@zappy-place/nostr-client';
import { PRESET_COLORS } from './constants';
import { state } from './state';

export function isDebugMode(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('debug');
}

export function initDebugMode() {
	console.log('🐛 Debug mode enabled - using dummy data');

	// Update UI to show debug status
	const statusEl = document.getElementById('connection-status');
	if (statusEl) {
		statusEl.textContent = '🐛 Debug Mode';
	}

	const userInfoEl = document.getElementById('user-info');
	if (userInfoEl) {
		userInfoEl.textContent = '🎨 Local Development';
		userInfoEl.classList.remove('hidden');
	}

	// Load dummy pixels
	state.pixels = generateDummyPixels();
	state.modifiedPixels = new Set(state.pixels.keys());
}

function generateDummyPixels(): Map<string, PixelData> {
	const pixels = new Map<string, PixelData>();

	// Create a test pattern inspired by the orange/white theme

	// 1. Draw some colored borders around the canvas
	drawBorder(pixels, 0, 0, 2000, 50, PRESET_COLORS[27]!); // Orange border (#FF7000)
	drawBorder(pixels, 0, 1950, 2000, 50, PRESET_COLORS[27]!); // Orange border
	drawBorder(pixels, 0, 0, 50, 2000, PRESET_COLORS[27]!); // Orange border
	drawBorder(pixels, 1950, 0, 50, 2000, PRESET_COLORS[27]!); // Orange border

	// 2. Create some geometric patterns in the center
	const centerX = 1000;
	const centerY = 1000;

	// Concentric squares using different colors
	const squareColors = [PRESET_COLORS[13], PRESET_COLORS[29], PRESET_COLORS[54], PRESET_COLORS[22], PRESET_COLORS[45]]; // Green, red, blue, yellow, purple
	for (let i = 0; i < 5; i++) {
		const size = 100 + i * 50;
		const color = squareColors[i]!;
		drawSquareOutline(pixels, centerX - size / 2, centerY - size / 2, size, color);
	}

	// 3. Create some test areas with different patterns

	// Checkerboard pattern (top-left) - white and black
	createCheckerboard(pixels, 100, 100, 200, 200, PRESET_COLORS[0]!, PRESET_COLORS[8]!); // white and black

	// Gradient-like pattern (top-right)
	createGradient(pixels, 1500, 100, 300, 200);

	// Random dots pattern (bottom-left)
	createRandomDots(pixels, 100, 1500, 400, 300);

	// Text-like pattern (bottom-right)
	createTextPattern(pixels, 1400, 1600, 'NOSTR');

	// 4. Add some guide lines - gray
	drawLine(pixels, 1000, 0, 1000, 2000, PRESET_COLORS[3]!); // Vertical center line (gray)
	drawLine(pixels, 0, 1000, 2000, 1000, PRESET_COLORS[3]!); // Horizontal center line (gray)

	// 5. Corner markers for navigation testing
	drawCornerMarker(pixels, 50, 50, PRESET_COLORS[29]!); // red
	drawCornerMarker(pixels, 1950, 50, PRESET_COLORS[13]!); // green
	drawCornerMarker(pixels, 50, 1950, PRESET_COLORS[54]!); // blue
	drawCornerMarker(pixels, 1950, 1950, PRESET_COLORS[22]!); // yellow

	// 6. Add test pixels near the center for testing
	setPixel(pixels, 1000, 1000, PRESET_COLORS[29]!);
	setPixel(pixels, 1001, 1000, PRESET_COLORS[13]!);
	setPixel(pixels, 1002, 1000, PRESET_COLORS[54]!);
	setPixel(pixels, 1003, 1000, PRESET_COLORS[22]!);
	setPixel(pixels, 1004, 1000, PRESET_COLORS[8]!);

	// Create a small cluster of test pixels
	setPixel(pixels, 500, 500, PRESET_COLORS[12]!);
	setPixel(pixels, 501, 500, PRESET_COLORS[15]!);
	setPixel(pixels, 502, 500, PRESET_COLORS[18]!);
	setPixel(pixels, 500, 501, PRESET_COLORS[21]!);
	setPixel(pixels, 501, 501, PRESET_COLORS[24]!);

	console.log(`Generated ${pixels.size} dummy pixels for testing`);
	return pixels;
}

function drawBorder(pixels: Map<string, PixelData>, x: number, y: number, width: number, height: number, color: string) {
	for (let px = x; px < x + width; px++) {
		for (let py = y; py < y + height; py++) {
			if (px >= 0 && px < 2000 && py >= 0 && py < 2000) {
				const pixel: PixelData = {
					x: px,
					y: py,
					color,
				};
				pixels.set(`${px},${py}`, pixel);
			}
		}
	}
}

function drawSquareOutline(pixels: Map<string, PixelData>, x: number, y: number, size: number, color: string) {
	// Top and bottom lines
	for (let px = x; px < x + size; px++) {
		setPixel(pixels, px, y, color);
		setPixel(pixels, px, y + size - 1, color);
	}
	// Left and right lines
	for (let py = y; py < y + size; py++) {
		setPixel(pixels, x, py, color);
		setPixel(pixels, x + size - 1, py, color);
	}
}

function createCheckerboard(pixels: Map<string, PixelData>, x: number, y: number, width: number, height: number, color1: string, color2: string) {
	const squareSize = 20;
	for (let px = 0; px < width; px++) {
		for (let py = 0; py < height; py++) {
			const squareX = Math.floor(px / squareSize);
			const squareY = Math.floor(py / squareSize);
			const color = (squareX + squareY) % 2 === 0 ? color1 : color2;
			setPixel(pixels, x + px, y + py, color);
		}
	}
}

function createGradient(pixels: Map<string, PixelData>, x: number, y: number, width: number, height: number) {
	// Create a "gradient" effect using preset colors
	for (let px = 0; px < width; px++) {
		for (let py = 0; py < height; py++) {
			const xRatio = px / width;
			const yRatio = py / height;

			// Use a combination of position to select from preset colors
			const colorIndex = Math.floor((xRatio * 8 + yRatio * 8) % PRESET_COLORS.length);
			const color = PRESET_COLORS[colorIndex]!;
			setPixel(pixels, x + px, y + py, color);
		}
	}
}

function createRandomDots(pixels: Map<string, PixelData>, x: number, y: number, width: number, height: number) {
	const numDots = 1000;
	for (let i = 0; i < numDots; i++) {
		const px = Math.floor(Math.random() * width);
		const py = Math.floor(Math.random() * height);
		const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)]!;
		setPixel(pixels, x + px, y + py, color);
	}
}

function createTextPattern(pixels: Map<string, PixelData>, x: number, y: number, text: string) {
	// Simple 5x7 font patterns for each letter
	const letters: Record<string, number[][]> = {
		'N': [
			[1, 0, 0, 0, 1],
			[1, 1, 0, 0, 1],
			[1, 0, 1, 0, 1],
			[1, 0, 0, 1, 1],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1]
		],
		'O': [
			[0, 1, 1, 1, 0],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[0, 1, 1, 1, 0]
		],
		'S': [
			[0, 1, 1, 1, 1],
			[1, 0, 0, 0, 0],
			[1, 0, 0, 0, 0],
			[0, 1, 1, 1, 0],
			[0, 0, 0, 0, 1],
			[0, 0, 0, 0, 1],
			[1, 1, 1, 1, 0]
		],
		'T': [
			[1, 1, 1, 1, 1],
			[0, 0, 1, 0, 0],
			[0, 0, 1, 0, 0],
			[0, 0, 1, 0, 0],
			[0, 0, 1, 0, 0],
			[0, 0, 1, 0, 0],
			[0, 0, 1, 0, 0]
		],
		'R': [
			[1, 1, 1, 1, 0],
			[1, 0, 0, 0, 1],
			[1, 0, 0, 0, 1],
			[1, 1, 1, 1, 0],
			[1, 0, 1, 0, 0],
			[1, 0, 0, 1, 0],
			[1, 0, 0, 0, 1]
		]
	};

	let offsetX = 0;
	for (const char of text) {
		const pattern = letters[char];
		if (pattern) {
			for (let row = 0; row < pattern.length; row++) {
				for (let col = 0; col < pattern[row].length; col++) {
					if (pattern[row][col]) {
						setPixel(pixels, x + offsetX + col * 8, y + row * 8, PRESET_COLORS[8]!); // black
					}
				}
			}
			offsetX += 6 * 8; // Space between letters
		}
	}
}

function drawLine(pixels: Map<string, PixelData>, x1: number, y1: number, x2: number, y2: number, color: string) {
	const dx = Math.abs(x2 - x1);
	const dy = Math.abs(y2 - y1);
	const sx = x1 < x2 ? 1 : -1;
	const sy = y1 < y2 ? 1 : -1;
	let err = dx - dy;

	let x = x1;
	let y = y1;

	while (true) {
		setPixel(pixels, x, y, color);

		if (x === x2 && y === y2) break;

		const e2 = 2 * err;
		if (e2 > -dy) {
			err -= dy;
			x += sx;
		}
		if (e2 < dx) {
			err += dx;
			y += sy;
		}
	}
}

function drawCornerMarker(pixels: Map<string, PixelData>, x: number, y: number, color: string) {
	// Draw a 20x20 filled square
	for (let px = 0; px < 20; px++) {
		for (let py = 0; py < 20; py++) {
			setPixel(pixels, x + px, y + py, color);
		}
	}
}

function setPixel(pixels: Map<string, PixelData>, x: number, y: number, color: string) {
	if (x >= 0 && x < 2000 && y >= 0 && y < 2000) {
		const pixel: PixelData = {
			x,
			y,
			color
		};
		pixels.set(`${x},${y}`, pixel);
	}
} 