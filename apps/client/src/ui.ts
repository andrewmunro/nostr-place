import { getCenterPixel, zoomIn, zoomOut } from './camera';
import { PRESET_COLORS } from './constants';
import { formatCostBreakdown } from './pricing';
import { state } from './state';

// Color palette constants
const COLORS_PER_ROW = 2;
const SCROLL_STEP = 2; // Reduced scroll step for smoother navigation

export function setupUI() {
	setupColorPalette();
	setupZoomControls();
	setupPaletteScrollControls();
	setupActionControls();
	setupPreviewModeUI();

	// Initial palette layout update
	setTimeout(() => updatePaletteLayout(), 0);
}

export function updateUI() {
	updateCoordinatesDisplay();
	updateActionButtons();
	updatePreviewModeUI();
}

function setupColorPalette() {
	const colorPalette = document.getElementById('color-palette')!;
	colorPalette.innerHTML = '';

	// Add regular colors
	PRESET_COLORS.forEach(color => {
		const colorButton = document.createElement('div');
		colorButton.className = 'color-btn';
		colorButton.style.backgroundColor = color;
		colorButton.title = color;
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

function setupActionControls() {
	const undoBtn = document.getElementById('undo-btn')!;

	undoBtn.addEventListener('click', () => {
		state.undoLastAction();
	});
}

function setupPreviewModeUI() {
	createPreviewPanel();
	setupPreviewControls();
}

function createPreviewPanel() {
	// Create preview panel if it doesn't exist
	let previewPanel = document.getElementById('preview-panel');
	if (!previewPanel) {
		previewPanel = document.createElement('div');
		previewPanel.id = 'preview-panel';
		previewPanel.className = 'preview-panel hidden';

		previewPanel.innerHTML = `
			<div class="preview-header">
				<h3>🎨 Preview Mode</h3>
				<button id="preview-cancel" class="preview-btn cancel-btn">Cancel</button>
			</div>
			<div class="preview-options">
				<label class="toggle-container">
					<input type="checkbox" id="cost-mode-toggle">
					<span class="toggle-slider"></span>
					<span class="toggle-label">💰 Cost Mode</span>
				</label>
			</div>
			<div class="cost-breakdown">
				<div id="cost-summary">No pixels placed</div>
				<div id="cost-details" class="cost-details"></div>
			</div>
			<div class="preview-actions">
				<button id="preview-submit" class="preview-btn submit-btn" disabled>
					Submit & Zap
				</button>
			</div>
		`;

		document.getElementById('ui-overlay')!.appendChild(previewPanel);
	}
}

function setupPreviewControls() {
	const submitBtn = document.getElementById('preview-submit')!;
	const cancelBtn = document.getElementById('preview-cancel')!;
	const costModeToggle = document.getElementById('cost-mode-toggle')! as HTMLInputElement;

	submitBtn.addEventListener('click', handlePreviewSubmit);
	cancelBtn.addEventListener('click', handlePreviewCancel);
	costModeToggle.addEventListener('change', handleCostModeToggle);
}

function handleCostModeToggle(event: Event) {
	const target = event.target as HTMLInputElement;
	state.updatePreviewState({ showCostMode: target.checked });
}

function handlePreviewSubmit() {
	if (state.previewState.pixels.size === 0) return;

	// TODO: Implement batched zap submission
	console.log('Submitting preview pixels:', state.previewState.pixels);
	console.log('Total cost:', state.previewState.costBreakdown.totalCost);

	// For now, just exit preview mode
	handlePreviewCancel();
}

function handlePreviewCancel() {
	state.exitPreviewMode();
	updatePreviewModeUI();
}

function updatePreviewModeUI() {
	const previewPanel = document.getElementById('preview-panel');
	if (!previewPanel) return;

	const costSummary = document.getElementById('cost-summary')!;
	const costDetails = document.getElementById('cost-details')!;
	const submitBtn = document.getElementById('preview-submit')! as HTMLButtonElement;
	const costModeToggle = document.getElementById('cost-mode-toggle')! as HTMLInputElement;

	if (state.previewState.isActive && state.previewState.pixels.size > 0) {
		// Show preview panel
		previewPanel.classList.remove('hidden');

		// Update cost display
		const breakdown = state.previewState.costBreakdown;
		const totalSats = breakdown.totalCost / 1000;
		const pixelCount = state.previewState.pixels.size;

		costSummary.textContent = `${pixelCount} pixel${pixelCount > 1 ? 's' : ''} • ${totalSats} sats`;
		costDetails.textContent = formatCostBreakdown(breakdown);

		// Enable submit button
		submitBtn.disabled = false;
		submitBtn.textContent = `⚡ Zap ${totalSats} sats`;

	} else if (state.previewState.isActive) {
		// Show panel but with no pixels message
		previewPanel.classList.remove('hidden');
		costSummary.textContent = 'No pixels placed';
		costDetails.textContent = 'Click on the canvas to place pixels • Click again to remove';
		submitBtn.disabled = true;
		submitBtn.textContent = 'Submit & Zap';

	} else {
		// Hide preview panel
		previewPanel.classList.add('hidden');
	}

	// Sync cost mode toggle with state
	if (costModeToggle) {
		costModeToggle.checked = state.previewState.showCostMode;
	}
}

// Add a function to periodically update the UI
export function startUIUpdateLoop() {
	setInterval(() => {
		if (state.previewState.isActive) {
			updatePreviewModeUI();
		}
	}, 500); // Update every 500ms when in preview mode
}

// UI update functions
export function setConnectionStatus(status: string) {
	const statusEl = document.getElementById('connection-status');
	if (statusEl) {
		statusEl.textContent = status;
	}
}

export function setUserInfo(publicKey?: string) {
	const userInfoEl = document.getElementById('user-info');
	if (userInfoEl && publicKey) {
		userInfoEl.textContent = `🔑 ${publicKey.slice(0, 12)}...`;
		userInfoEl.classList.remove('hidden');
	} else if (userInfoEl) {
		userInfoEl.classList.add('hidden');
	}
}

function selectColor(color: string) {
	state.selectedColor = color;

	// Update UI
	document.querySelectorAll('.color-btn').forEach((btn, index) => {
		btn.classList.remove('selected');
		if (PRESET_COLORS[index] === color) {
			btn.classList.add('selected');
		}
	});
}

function scrollPalette(direction: number) {
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

function updateActionButtons() {
	const undoBtn = document.getElementById('undo-btn')! as HTMLButtonElement;

	// Update undo button state
	if (state.undoHistory.length > 0) {
		undoBtn.disabled = false;
		undoBtn.title = `Undo (${state.undoHistory.length} actions)`;
	} else {
		undoBtn.disabled = true;
		undoBtn.title = 'No actions to undo';
	}

	// Disable undo when in preview mode
	if (state.previewState.isActive) {
		undoBtn.disabled = true;
		undoBtn.title = 'Exit preview mode to undo';
	}
}

function updateCoordinatesDisplay(x?: number, y?: number) {
	const coordsDisplay = document.getElementById('coordinates')!;

	if (x !== undefined && y !== undefined) {
		coordsDisplay.textContent = `${x},${y}`;
	} else {
		// Always show center pixel coordinates
		const centerPixel = getCenterPixel();
		coordsDisplay.textContent = `${centerPixel.x},${centerPixel.y}`;
	}
}
