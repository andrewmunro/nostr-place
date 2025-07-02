import { Pixel } from '@nostr-place/nostr-canvas';

const PRESET_COLORS = [
	'#FFFFFF', '#E4E4E4', '#888888', '#222222', '#FFA7D1', '#E50000', '#E59500', '#A06A42',
	'#E5D900', '#94E044', '#02BE01', '#00D3DD', '#0083C7', '#0000EA', '#CF6EE4', '#820080',
	'#FFAEB9', '#FF0000', '#FF7F00', '#FFFF00', '#00FF00', '#0000FF', '#4B0082', '#9400D3'
];

export function generateDummyPixels(): Map<string, Pixel> {
	const pixels = new Map<string, Pixel>();

	// Create a test pattern inspired by the orange/white theme

	// 1. Draw some colored borders around the canvas
	drawBorder(pixels, 0, 0, 2000, 50, '#E59500'); // Orange top border
	drawBorder(pixels, 0, 1950, 2000, 50, '#E59500'); // Orange bottom border
	drawBorder(pixels, 0, 0, 50, 2000, '#E59500'); // Orange left border
	drawBorder(pixels, 1950, 0, 50, 2000, '#E59500'); // Orange right border

	// 2. Create some geometric patterns in the center
	const centerX = 1000;
	const centerY = 1000;

	// Concentric squares
	for (let i = 0; i < 5; i++) {
		const size = 100 + i * 50;
		const color = PRESET_COLORS[i + 8]; // Use different colors
		drawSquareOutline(pixels, centerX - size / 2, centerY - size / 2, size, color);
	}

	// 3. Create some test areas with different patterns

	// Checkerboard pattern (top-left)
	createCheckerboard(pixels, 100, 100, 200, 200, '#FFFFFF', '#222222');

	// Gradient-like pattern (top-right)
	createGradient(pixels, 1500, 100, 300, 200);

	// Random dots pattern (bottom-left)
	createRandomDots(pixels, 100, 1500, 400, 300);

	// Text-like pattern (bottom-right)
	createTextPattern(pixels, 1400, 1600, 'NOSTR');

	// 4. Add some guide lines
	drawLine(pixels, 1000, 0, 1000, 2000, '#888888'); // Vertical center line
	drawLine(pixels, 0, 1000, 2000, 1000, '#888888'); // Horizontal center line

	// 5. Corner markers for navigation testing
	drawCornerMarker(pixels, 50, 50, '#FF0000');
	drawCornerMarker(pixels, 1950, 50, '#00FF00');
	drawCornerMarker(pixels, 50, 1950, '#0000FF');
	drawCornerMarker(pixels, 1950, 1950, '#FFFF00');

	console.log(`Generated ${pixels.size} dummy pixels for testing`);
	return pixels;
}

function drawBorder(pixels: Map<string, Pixel>, x: number, y: number, width: number, height: number, color: string) {
	for (let px = x; px < x + width; px++) {
		for (let py = y; py < y + height; py++) {
			if (px >= 0 && px < 2000 && py >= 0 && py < 2000) {
				const pixel: Pixel = {
					x: px,
					y: py,
					color,
					eventId: `dummy_${px}_${py}_${Date.now()}`,
					pubkey: 'dummy_user',
					timestamp: Date.now(),
					isValid: true
				};
				pixels.set(`${px},${py}`, pixel);
			}
		}
	}
}

function drawSquareOutline(pixels: Map<string, Pixel>, x: number, y: number, size: number, color: string) {
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

function createCheckerboard(pixels: Map<string, Pixel>, x: number, y: number, width: number, height: number, color1: string, color2: string) {
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

function createGradient(pixels: Map<string, Pixel>, x: number, y: number, width: number, height: number) {
	for (let px = 0; px < width; px++) {
		for (let py = 0; py < height; py++) {
			const ratio = px / width;
			const r = Math.floor(255 * ratio);
			const g = Math.floor(255 * (1 - ratio));
			const b = Math.floor(255 * (py / height));
			const color = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
			setPixel(pixels, x + px, y + py, color);
		}
	}
}

function createRandomDots(pixels: Map<string, Pixel>, x: number, y: number, width: number, height: number) {
	const numDots = 1000;
	for (let i = 0; i < numDots; i++) {
		const px = Math.floor(Math.random() * width);
		const py = Math.floor(Math.random() * height);
		const color = PRESET_COLORS[Math.floor(Math.random() * PRESET_COLORS.length)];
		setPixel(pixels, x + px, y + py, color);
	}
}

function createTextPattern(pixels: Map<string, Pixel>, x: number, y: number, text: string) {
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
						setPixel(pixels, x + offsetX + col * 8, y + row * 8, '#000000');
					}
				}
			}
			offsetX += 6 * 8; // Space between letters
		}
	}
}

function drawLine(pixels: Map<string, Pixel>, x1: number, y1: number, x2: number, y2: number, color: string) {
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

function drawCornerMarker(pixels: Map<string, Pixel>, x: number, y: number, color: string) {
	// Draw a 20x20 filled square
	for (let px = 0; px < 20; px++) {
		for (let py = 0; py < 20; py++) {
			setPixel(pixels, x + px, y + py, color);
		}
	}
}

function setPixel(pixels: Map<string, Pixel>, x: number, y: number, color: string) {
	if (x >= 0 && x < 2000 && y >= 0 && y < 2000) {
		const pixel: Pixel = {
			x,
			y,
			color,
			eventId: `dummy_${x}_${y}_${Date.now()}`,
			pubkey: 'dummy_user',
			timestamp: Date.now(),
			isValid: true
		};
		pixels.set(`${x},${y}`, pixel);
	}
} 