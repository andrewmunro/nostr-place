import { getCenterPixel, zoomIn, zoomOut } from './camera';
import { PRESET_COLORS } from './constants';
import { nostrService } from './nostr';
import { state } from './state';

// Color palette constants
const COLORS_PER_ROW = 2;

export function setupUI() {
	setupColorPalette();
	setupZoomControls();
	setupActionControls();
	setupPreviewControls();
	setupTutorial();

	// Initial palette layout update
	setTimeout(() => updatePaletteLayout(), 0);

	// Show tutorial for first-time users
	if (isFirstTimeUser()) {
		showTutorial();
	}
}

export function updateUI() {
	updateCoordinatesDisplay();
	updateActionButtons();
	updatePreviewModeUI();
}

function setupColorPalette() {
	const colorPalette = document.getElementById('color-palette')!;
	colorPalette.innerHTML = '';

	// Group colors into rows of 2
	for (let i = 0; i < PRESET_COLORS.length; i += COLORS_PER_ROW) {
		const colorRow = document.createElement('div');
		colorRow.className = 'color-row';

		// Add colors to this row
		for (let j = 0; j < COLORS_PER_ROW && i + j < PRESET_COLORS.length; j++) {
			const color = PRESET_COLORS[i + j];
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

			colorRow.appendChild(colorButton);
		}

		colorPalette.appendChild(colorRow);
	}
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



function setupActionControls() {
	const undoBtn = document.getElementById('undo-btn')!;

	undoBtn.addEventListener('click', () => {
		state.undoLastAction();
	});
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

async function handlePreviewSubmit() {
	if (state.previewState.pixels.size === 0) return;

	try {
		// Disable submit button during processing
		const submitBtn = document.getElementById('preview-submit')! as HTMLButtonElement;
		submitBtn.disabled = true;
		submitBtn.textContent = 'Processing...';

		// Submit preview pixels using nostr service
		await nostrService.submitPreviewPixels();

		// If successful, exit preview mode
		handlePreviewCancel();

	} catch (error) {
		console.error('Zap submission failed:', error);

		// Show error to user
		let errorMessage = 'Zap submission failed';
		if (error instanceof Error) {
			errorMessage += ': ' + error.message;
		}
		alert(errorMessage);

		// Re-enable submit button
		const submitBtn = document.getElementById('preview-submit')! as HTMLButtonElement;
		submitBtn.disabled = false;
		const totalSats = state.previewState.costBreakdown.totalSats;
		submitBtn.textContent = `⚡ Zap ${totalSats} sats`;
	}
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
		const totalSats = breakdown.totalSats;
		const pixelCount = state.previewState.pixels.size;

		costSummary.textContent = `${pixelCount} pixel${pixelCount > 1 ? 's' : ''} • ${totalSats} sats`;

		// Format cost breakdown manually since we don't have the helper function
		const parts: string[] = [];
		if (breakdown.pixelCounts.new > 0) {
			parts.push(`${breakdown.pixelCounts.new} new (${breakdown.pixelCounts.new} sat${breakdown.pixelCounts.new > 1 ? 's' : ''})`);
		}
		if (breakdown.pixelCounts.fresh > 0) {
			parts.push(`${breakdown.pixelCounts.fresh} fresh (${breakdown.pixelCounts.fresh * 10} sats)`);
		}
		if (breakdown.pixelCounts.recent > 0) {
			parts.push(`${breakdown.pixelCounts.recent} recent (${breakdown.pixelCounts.recent * 5} sats)`);
		}
		if (breakdown.pixelCounts.older > 0) {
			parts.push(`${breakdown.pixelCounts.older} older (${breakdown.pixelCounts.older * 2} sats)`);
		}
		if (breakdown.pixelCounts.ancient > 0) {
			parts.push(`${breakdown.pixelCounts.ancient} ancient (${breakdown.pixelCounts.ancient} sat${breakdown.pixelCounts.ancient > 1 ? 's' : ''})`);
		}
		costDetails.textContent = parts.length > 0 ? `${parts.join(', ')} = ${totalSats} sats total` : '';

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

	// Update palette layout when preview mode changes
	updatePaletteLayout();
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

export function showTutorial() {
	const tutorialModal = document.getElementById('tutorial-modal')!;
	tutorialModal.classList.remove('hidden');
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



export function updatePaletteLayout() {
	const container = document.getElementById('color-palette-scroll-container')!;
	const paletteContainer = document.getElementById('color-palette-container')!;

	// Calculate available height considering preview panel
	const containerMargin = 20; // Top and bottom margins
	const previewPanel = document.getElementById('preview-panel');
	let previewPanelHeight = 0;

	if (previewPanel && !previewPanel.classList.contains('hidden')) {
		// If preview panel is visible, account for its height
		const previewRect = previewPanel.getBoundingClientRect();
		previewPanelHeight = previewRect.height + 20; // Add some margin
	}

	const availableHeight = window.innerHeight - containerMargin - previewPanelHeight;

	// Set max height for container to enable scrolling when needed
	container.style.maxHeight = `${Math.max(200, availableHeight)}px`;
	paletteContainer.style.maxHeight = `${Math.max(240, availableHeight + 40)}px`;
}

function updateActionButtons() {
	const undoBtn = document.getElementById('undo-btn')! as HTMLButtonElement;

	if (state.previewState.isActive) {
		// In preview mode: enable undo if there are preview actions to undo
		if (state.undoHistory.length > 0) {
			undoBtn.disabled = false;
			undoBtn.title = `Undo preview action (${state.undoHistory.length} actions)`;
		} else {
			undoBtn.disabled = true;
			undoBtn.title = 'No preview actions to undo';
		}
	} else {
		// Not in preview mode: disable undo (no longer supported for published pixels)
		undoBtn.disabled = true;
		undoBtn.title = 'Enter preview mode to use undo';
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

// Tutorial functions
function setupTutorial() {
	const helpButton = document.getElementById('help-button')!;
	const tutorialModal = document.getElementById('tutorial-modal')!;
	const tutorialClose = document.getElementById('tutorial-close')!;
	const tutorialStart = document.getElementById('tutorial-start')!;
	const dontShowAgainCheckbox = document.getElementById('dont-show-again')! as HTMLInputElement;

	// Help button click
	helpButton.addEventListener('click', () => {
		showTutorial();
	});

	// Close button click
	tutorialClose.addEventListener('click', () => {
		hideTutorial();
	});

	// Start button click
	tutorialStart.addEventListener('click', () => {
		const dontShowAgain = dontShowAgainCheckbox.checked;
		if (dontShowAgain) {
			markTutorialAsSeen();
		}
		hideTutorial();
	});

	// Close on background click
	tutorialModal.addEventListener('click', (event) => {
		if (event.target === tutorialModal) {
			hideTutorial();
		}
	});

	// Close on escape key
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !tutorialModal.classList.contains('hidden')) {
			hideTutorial();
		}
	});
}

function hideTutorial() {
	const tutorialModal = document.getElementById('tutorial-modal')!;
	tutorialModal.classList.add('hidden');
}

function isFirstTimeUser(): boolean {
	return !localStorage.getItem('zappy-place-tutorial-seen');
}

function markTutorialAsSeen() {
	localStorage.setItem('zappy-place-tutorial-seen', 'true');
}
