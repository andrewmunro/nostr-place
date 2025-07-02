import { updateCoordinatesDisplay, zoomIn, zoomOut } from './camera';
import { COLORS_PER_ROW, PRESET_COLORS, SCROLL_STEP } from './constants';
import { state } from './state';

export function setupUI() {
	setupColorPalette();
	setupZoomControls();
	setupPaletteScrollControls();

	// Initial palette layout update
	setTimeout(() => updatePaletteLayout(), 0);

	// Update coordinates display
	updateCoordinatesDisplay();
}

function setupColorPalette() {
	const colorPalette = document.getElementById('color-palette')!;
	colorPalette.innerHTML = '';

	PRESET_COLORS.forEach(color => {
		const colorButton = document.createElement('div');
		colorButton.className = 'color-btn';
		colorButton.style.backgroundColor = color;
		if (color === state.selectedColor) {
			colorButton.classList.add('selected');
		}

		colorButton.addEventListener('click', () => {
			selectColor(color);
		});

		colorPalette.appendChild(colorButton);
	});
}

function setupZoomControls() {
	const zoomInBtn = document.getElementById('zoom-in')!;
	const zoomOutBtn = document.getElementById('zoom-out')!;

	zoomInBtn.addEventListener('click', () => {
		zoomIn();
	});

	zoomOutBtn.addEventListener('click', () => {
		zoomOut();
	});
}

function setupPaletteScrollControls() {
	const scrollUpBtn = document.getElementById('palette-scroll-up')!;
	const scrollDownBtn = document.getElementById('palette-scroll-down')!;

	scrollUpBtn.addEventListener('click', () => {
		scrollPalette(-1);
	});

	scrollDownBtn.addEventListener('click', () => {
		scrollPalette(1);
	});
}

export function selectColor(color: string) {
	state.selectedColor = color;

	// Update UI
	document.querySelectorAll('.color-btn').forEach((btn, index) => {
		btn.classList.remove('selected');
		if (PRESET_COLORS[index] === color) {
			btn.classList.add('selected');
		}
	});
}

export function scrollPalette(direction: number) {
	const totalRows = Math.ceil(PRESET_COLORS.length / COLORS_PER_ROW);
	const buttonHeight = 28;
	const scrollButtonHeight = 28;
	const containerMargin = 20;

	// Calculate available space and max visible rows with scroll buttons
	const availableHeight = window.innerHeight - containerMargin;
	const heightWithScrollButtons = availableHeight - (scrollButtonHeight * 2);
	const maxVisibleRows = Math.floor(heightWithScrollButtons / buttonHeight);
	const maxScrollOffset = Math.max(0, totalRows - maxVisibleRows);

	// Update scroll offset
	const newOffset = Math.max(0, Math.min(maxScrollOffset, state.paletteScrollOffset + direction * SCROLL_STEP));
	state.paletteScrollOffset = newOffset;

	updatePaletteLayout();
}

export function updatePaletteLayout() {
	const colorPalette = document.getElementById('color-palette')!;
	const scrollUpBtn = document.getElementById('palette-scroll-up')!;
	const scrollDownBtn = document.getElementById('palette-scroll-down')!;
	const container = document.getElementById('color-palette-scroll-container')!;

	// Calculate dimensions
	const totalRows = Math.ceil(PRESET_COLORS.length / COLORS_PER_ROW);
	const buttonHeight = 28; // 24px height + 4px gap
	const scrollButtonHeight = 28; // Height of scroll buttons when visible
	const containerMargin = 20; // Top and bottom margins

	// Available height for the palette
	const availableHeight = window.innerHeight - containerMargin;
	const maxPossibleRows = Math.floor(availableHeight / buttonHeight);

	// Determine if scrolling is needed
	const needsScrolling = totalRows > maxPossibleRows;

	if (needsScrolling) {
		// Calculate how many rows can fit with scroll buttons
		const heightWithScrollButtons = availableHeight - (scrollButtonHeight * 2);
		const maxVisibleRows = Math.floor(heightWithScrollButtons / buttonHeight);
		const maxScrollOffset = Math.max(0, totalRows - maxVisibleRows);

		// Show scroll buttons and limit scroll offset
		scrollUpBtn.classList.toggle('hidden', state.paletteScrollOffset === 0);
		scrollDownBtn.classList.toggle('hidden', state.paletteScrollOffset >= maxScrollOffset);

		// Ensure scroll offset doesn't exceed maximum
		state.paletteScrollOffset = Math.min(state.paletteScrollOffset, maxScrollOffset);

		// Set container height to fit visible rows
		container.style.height = `${maxVisibleRows * buttonHeight}px`;
	} else {
		// Hide scroll buttons and reset scroll
		scrollUpBtn.classList.add('hidden');
		scrollDownBtn.classList.add('hidden');
		state.paletteScrollOffset = 0;

		// Let container take up space for all colors
		container.style.height = `${totalRows * buttonHeight}px`;
	}

	// Apply scroll transform
	const scrollPixels = state.paletteScrollOffset * buttonHeight;
	colorPalette.style.transform = `translateY(-${scrollPixels}px)`;
} 