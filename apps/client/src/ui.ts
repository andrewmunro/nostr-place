import { NostrProfile } from '@zappy-place/nostr-client';
import { npubEncode } from 'nostr-tools/nip19';
import { getCenterPixel, zoomIn, zoomOut } from './camera';
import { PRESET_COLORS } from './constants';
import { nostrService } from './nostr';
import { generateShareableURL } from './persistence';
import { captureDesignScreenshot } from './renderer';
import { state } from './state';
import { throttle } from './utils';

// Color palette constants
const COLORS_PER_ROW = 2;

// Utility function to format relative time
function formatRelativeTime(timestamp: number): string {
	const now = Date.now();
	const timeDiff = now - (timestamp * 1000); // Convert from seconds to milliseconds

	const seconds = Math.floor(timeDiff / 1000);
	const minutes = Math.floor(seconds / 60);
	const hours = Math.floor(minutes / 60);
	const days = Math.floor(hours / 24);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	if (seconds < 60) return 'now';
	if (minutes < 60) return `${minutes} min`;
	if (hours < 24) return `${hours} hr`;
	if (days < 7) return `${days} day${days !== 1 ? 's' : ''}`;
	if (weeks < 4) return `${weeks} week${weeks !== 1 ? 's' : ''}`;
	if (months < 12) return `${months} month${months !== 1 ? 's' : ''}`;
	return `${years} year${years !== 1 ? 's' : ''}`;
}

export function setupUI() {
	setupColorPalette();
	setupZoomControls();
	setupActionControls();
	setupPreviewControls();
	setupTutorial();
	setupPixelTooltip();
	setupPixelModal();
	setupShareModal();

	// Show tutorial for first-time users
	if (isFirstTimeUser()) {
		showTutorial();
	}
}

export const updateUI = throttle(() => {
	updateCoordinatesDisplay();
	updateActionButtons();
	updatePreviewModeUI();
}, 200)

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
	const minimizeBtn = document.getElementById('preview-minimize')!;
	const costModeToggle = document.getElementById('cost-mode-toggle')! as HTMLInputElement;
	const messageInput = document.getElementById('preview-message')! as HTMLTextAreaElement;
	const urlInput = document.getElementById('preview-url')! as HTMLInputElement;

	submitBtn.addEventListener('click', handlePreviewSubmit);
	cancelBtn.addEventListener('click', handlePreviewCancel);
	minimizeBtn.addEventListener('click', handlePreviewMinimize);
	costModeToggle.addEventListener('change', handleCostModeToggle);
	messageInput.addEventListener('input', handleMessageChange);
	urlInput.addEventListener('input', handleUrlChange);
}

function handleCostModeToggle(event: Event) {
	const target = event.target as HTMLInputElement;
	state.updatePreviewState({ showCostMode: target.checked });
}

function handleMessageChange(event: Event) {
	const target = event.target as HTMLTextAreaElement;
	const message = target.value.trim();

	// Validate message length
	const isValid = message.length <= 150;

	// Update validation state
	target.classList.toggle('invalid', !isValid);

	// Update help text
	const helpText = target.parentElement?.querySelector('.input-help') as HTMLElement;
	if (helpText) {
		if (!isValid) {
			helpText.textContent = `Message too long (${message.length}/150 characters)`;
			helpText.classList.add('error');
		} else {
			helpText.textContent = 'Share a message with your pixel art (max 150 characters)';
			helpText.classList.remove('error');
		}
	}

	state.updatePreviewState({
		message: message || undefined,
		validationErrors: {
			...state.previewState.validationErrors,
			message: !isValid ? 'Message too long' : undefined
		}
	});
}

function handleUrlChange(event: Event) {
	const target = event.target as HTMLInputElement;
	const url = target.value.trim();

	// Validate URL format (only if not empty)
	let isValid = true;
	if (url) {
		try {
			new URL(url);
		} catch {
			isValid = false;
		}
	}

	// Update validation state
	target.classList.toggle('invalid', !isValid);

	// Update help text
	const helpText = target.parentElement?.querySelector('.input-help') as HTMLElement;
	if (helpText) {
		if (!isValid) {
			helpText.textContent = 'Please enter a valid URL (e.g., https://example.com)';
			helpText.classList.add('error');
		} else {
			helpText.textContent = 'Add a clickable link to your pixels';
			helpText.classList.remove('error');
		}
	}

	state.updatePreviewState({
		url: url || undefined,
		validationErrors: {
			...state.previewState.validationErrors,
			url: !isValid ? 'Invalid URL format' : undefined
		}
	});
}

async function handlePreviewSubmit() {
	if (state.previewState.pixels.size === 0) return;

	try {
		// Disable submit button during processing
		const submitBtn = document.getElementById('preview-submit')! as HTMLButtonElement;
		submitBtn.disabled = true;
		submitBtn.textContent = 'Processing...';

		// Submit preview pixels using nostr service with message and URL
		await nostrService.submitPreviewPixels(state.previewState.message, state.previewState.url);

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
	// Clear input fields and validation states
	const messageInput = document.getElementById('preview-message')! as HTMLTextAreaElement;
	const urlInput = document.getElementById('preview-url')! as HTMLInputElement;
	messageInput.value = '';
	urlInput.value = '';

	// Clear validation styles
	messageInput.classList.remove('invalid');
	urlInput.classList.remove('invalid');

	// Reset help text
	const messageHelp = messageInput.parentElement?.querySelector('.input-help') as HTMLElement;
	if (messageHelp) {
		messageHelp.textContent = 'Share a message with your pixel art (max 150 characters)';
		messageHelp.classList.remove('error');
	}

	const urlHelp = urlInput.parentElement?.querySelector('.input-help') as HTMLElement;
	if (urlHelp) {
		urlHelp.textContent = 'Add a clickable link to your pixels';
		urlHelp.classList.remove('error');
	}

	state.exitPreviewMode();
	updatePreviewModeUI();
}

function handlePreviewMinimize() {
	state.updatePreviewState({ minimized: !state.previewState.minimized });
	updatePreviewModeUI();
}

function updatePreviewModeUI() {
	const previewPanel = document.getElementById('preview-panel');
	if (!previewPanel) return;

	const costSummary = document.getElementById('cost-summary')!;
	const costDetails = document.getElementById('cost-details')!;
	const submitBtn = document.getElementById('preview-submit')! as HTMLButtonElement;
	const costModeToggle = document.getElementById('cost-mode-toggle')! as HTMLInputElement;
	const minimizeBtn = document.getElementById('preview-minimize')! as HTMLButtonElement;

	// Update minimize button icon and title
	if (state.previewState.minimized) {
		minimizeBtn.textContent = '+';
		minimizeBtn.title = 'Expand panel';
	} else {
		minimizeBtn.textContent = '−';
		minimizeBtn.title = 'Minimize panel';
	}

	// Get content elements to show/hide based on minimized state
	const previewOptions = document.querySelector('.preview-options') as HTMLElement;
	const costBreakdown = document.querySelector('.cost-breakdown') as HTMLElement;
	const previewInputs = document.querySelector('.preview-inputs') as HTMLElement;
	const previewActions = document.querySelector('.preview-actions') as HTMLElement;

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

		// Enable submit button only if no validation errors
		const hasValidationErrors = state.previewState.validationErrors?.message || state.previewState.validationErrors?.url;
		submitBtn.disabled = !!hasValidationErrors;
		submitBtn.textContent = hasValidationErrors ? 'Fix validation errors' : `⚡ Zap ${totalSats} sats`;

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

	// Show/hide content based on minimized state
	if (state.previewState.isActive && state.previewState.minimized) {
		// Hide content when minimized
		if (previewOptions) {
			previewOptions.classList.add('hidden');
		}
		if (costBreakdown) {
			costBreakdown.classList.add('hidden');
		}
		if (previewInputs) {
			previewInputs.classList.add('hidden');
		}
		if (previewActions) {
			previewActions.classList.add('hidden');
		}
	} else {
		// Show content when not minimized
		if (previewOptions) {
			previewOptions.classList.remove('hidden');
		}
		if (costBreakdown) {
			costBreakdown.classList.remove('hidden');
		}
		if (previewInputs) {
			previewInputs.classList.remove('hidden');
		}
		if (previewActions) {
			previewActions.classList.remove('hidden');
		}
	}

	// Sync cost mode toggle with state
	if (costModeToggle) {
		costModeToggle.checked = state.previewState.showCostMode;
	}

	// Update body class to reflect preview panel state for CSS-based layout
	document.body.classList.toggle('preview-active', state.previewState.isActive);
	document.body.classList.toggle('preview-minimized', state.previewState.minimized);
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

function setupPixelTooltip() {
	// Tooltip functionality is handled in the input system
	// This function can be used for any tooltip-specific setup if needed
}

function setupPixelModal() {
	const pixelModal = document.getElementById('pixel-modal')!;
	const pixelModalClose = document.getElementById('pixel-modal-close')!;
	const pixelModalCloseFallback = document.getElementById('pixel-modal-close-fallback')!;

	// Close modal when clicking either close button
	pixelModalClose.addEventListener('click', () => {
		hidePixelModal();
	});

	pixelModalCloseFallback.addEventListener('click', () => {
		hidePixelModal();
	});

	// Close modal when clicking outside
	pixelModal.addEventListener('click', (event) => {
		if (event.target === pixelModal) {
			hidePixelModal();
		}
	});

	// Close modal when pressing escape
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !pixelModal.classList.contains('hidden')) {
			hidePixelModal();
		}
	});
}

export function showPixelTooltip(x: number, y: number, message?: string, profile?: NostrProfile | null, timestamp?: number) {
	const tooltip = document.getElementById('pixel-tooltip')!;
	const tooltipProfilePic = document.getElementById('tooltip-profile-pic')! as HTMLImageElement;
	const tooltipMessage = document.getElementById('tooltip-message')!;
	const tooltipTimestamp = document.getElementById('tooltip-timestamp')!;

	// Set message
	tooltipMessage.textContent = message || '';

	// Set profile picture if available
	if (profile?.picture) {
		tooltipProfilePic.src = profile.picture;
		tooltipProfilePic.classList.remove('hidden');
	} else {
		tooltipProfilePic.classList.add('hidden');
	}

	// Set timestamp if available
	if (timestamp) {
		tooltipTimestamp.textContent = formatRelativeTime(timestamp);
		tooltipTimestamp.classList.remove('hidden');
	} else {
		tooltipTimestamp.classList.add('hidden');
	}

	// Position tooltip
	tooltip.style.left = `${x + 10}px`;
	tooltip.style.top = `${y - 10}px`;
	tooltip.classList.remove('hidden');
}

export function hidePixelTooltip() {
	const tooltip = document.getElementById('pixel-tooltip')!;
	tooltip.classList.add('hidden');
}

export function showPixelModal(message?: string, url?: string, profile?: NostrProfile | null, timestamp?: number) {
	const pixelModal = document.getElementById('pixel-modal')!;
	const pixelModalMessage = document.getElementById('pixel-modal-message')!;
	const pixelModalTimestampProfile = document.getElementById('pixel-modal-timestamp-profile')!;
	const pixelModalTimestampFallback = document.getElementById('pixel-modal-timestamp-fallback')!;
	const pixelModalUrl = document.getElementById('pixel-modal-url')!;
	const pixelModalProfile = document.getElementById('pixel-modal-profile')!;
	const pixelModalFallbackHeader = document.getElementById('pixel-modal-fallback-header')!;
	const pixelModalProfilePic = document.getElementById('pixel-modal-profile-pic')! as HTMLImageElement;
	const pixelModalProfilePicLink = document.getElementById('pixel-modal-profile-pic-link')! as HTMLAnchorElement;
	const pixelModalProfileName = document.getElementById('pixel-modal-profile-name')!;
	const pixelModalProfileAbout = document.getElementById('pixel-modal-profile-about')!;
	const pixelModalProfileLink = document.getElementById('pixel-modal-profile-link')! as HTMLAnchorElement;

	// Show appropriate header based on profile availability
	if (profile) {
		// Set profile picture and link
		if (profile.picture) {
			pixelModalProfilePic.src = profile.picture;
			pixelModalProfilePic.style.display = 'block';
		} else {
			pixelModalProfilePic.style.display = 'none';
		}

		// Set nostr.band link for both the picture and text link
		const nostrBandUrl = `https://nostr.band/${npubEncode(profile.pubkey)}`;
		pixelModalProfilePicLink.href = nostrBandUrl;
		pixelModalProfileLink.href = nostrBandUrl;

		// Set profile name (prefer display_name, fallback to name)
		const displayName = profile.display_name || profile.name;
		if (displayName) {
			pixelModalProfileName.textContent = displayName;
			pixelModalProfileName.style.display = 'block';
		} else {
			pixelModalProfileName.textContent = 'Anonymous';
			pixelModalProfileName.style.display = 'block';
		}

		// Set profile about
		if (profile.about) {
			pixelModalProfileAbout.textContent = profile.about;
			pixelModalProfileAbout.style.display = 'block';
		} else {
			pixelModalProfileAbout.style.display = 'none';
		}

		pixelModalProfile.classList.remove('hidden');
		pixelModalFallbackHeader.classList.add('hidden');
	} else {
		// Show fallback header when no profile
		pixelModalProfile.classList.add('hidden');
		pixelModalFallbackHeader.classList.remove('hidden');
	}

	// Set message content
	if (message) {
		pixelModalMessage.textContent = message;
		pixelModalMessage.style.display = 'block';
	} else {
		pixelModalMessage.style.display = 'none';
	}

	// Set timestamp content in appropriate header
	if (timestamp) {
		const timestampText = `${formatRelativeTime(timestamp)} ago`;
		if (profile) {
			pixelModalTimestampProfile.textContent = timestampText;
			pixelModalTimestampProfile.classList.remove('hidden');
			pixelModalTimestampFallback.classList.add('hidden');
		} else {
			pixelModalTimestampFallback.textContent = timestampText;
			pixelModalTimestampFallback.classList.remove('hidden');
			pixelModalTimestampProfile.classList.add('hidden');
		}
	} else {
		pixelModalTimestampProfile.classList.add('hidden');
		pixelModalTimestampFallback.classList.add('hidden');
	}

	// Set URL content
	if (url) {
		pixelModalUrl.innerHTML = `<a href="${url}" target="_blank" rel="noopener noreferrer">${url.length > 30 ? url.slice(0, 30) + '...' : url}</a>`;
		pixelModalUrl.style.display = 'block';
	} else {
		pixelModalUrl.style.display = 'none';
	}

	// Show modal if there's any content
	if (message || url || profile) {
		pixelModal.classList.remove('hidden');
	}
}

export function hidePixelModal() {
	const pixelModal = document.getElementById('pixel-modal')!;
	pixelModal.classList.add('hidden');
}

function setupShareModal() {
	const shareModal = document.getElementById('share-modal')!;
	const shareModalClose = document.getElementById('share-modal-close')!;
	const shareSkipBtn = document.getElementById('share-skip')!;
	const shareToNostrBtn = document.getElementById('share-to-nostr')! as HTMLButtonElement;
	const copyLinkBtn = document.getElementById('copy-link-btn')!;
	const shareMessageInput = document.getElementById('share-message')! as HTMLTextAreaElement;

	// Close modal handlers
	shareModalClose.addEventListener('click', hideShareModal);
	shareSkipBtn.addEventListener('click', hideShareModal);

	// Close modal when clicking outside
	shareModal.addEventListener('click', (event) => {
		if (event.target === shareModal) {
			hideShareModal();
		}
	});

	// Close modal when pressing escape
	document.addEventListener('keydown', (event) => {
		if (event.key === 'Escape' && !shareModal.classList.contains('hidden')) {
			hideShareModal();
		}
	});

	// Copy link functionality
	copyLinkBtn.addEventListener('click', async () => {
		const linkInput = document.getElementById('share-link')! as HTMLInputElement;
		try {
			await navigator.clipboard.writeText(linkInput.value);
			copyLinkBtn.textContent = '✓';
			copyLinkBtn.classList.add('copied');
			setTimeout(() => {
				copyLinkBtn.textContent = '📋';
				copyLinkBtn.classList.remove('copied');
			}, 2000);
		} catch (error) {
			console.warn('Failed to copy to clipboard:', error);
			// Fallback: select the text
			linkInput.select();
			linkInput.setSelectionRange(0, 99999);
		}
	});

	// Share to Nostr functionality
	shareToNostrBtn.addEventListener('click', async () => {
		try {
			shareToNostrBtn.disabled = true;
			shareToNostrBtn.textContent = 'Sharing...';

			const message = shareMessageInput.value.trim();
			const shareLink = (document.getElementById('share-link')! as HTMLInputElement).value;
			const screenshot = (document.getElementById('share-screenshot')! as HTMLCanvasElement).toDataURL('image/png');

			// Create the full message with link
			const fullMessage = message + '\n\n' + shareLink;

			// Publish to Nostr
			await nostrService.canvas.publishNote(fullMessage, screenshot);

			// Show success state
			shareToNostrBtn.textContent = 'Shared! ✓';
			shareToNostrBtn.style.background = '#28a745';

			// Close modal after a short delay
			setTimeout(() => {
				hideShareModal();
			}, 1500);

		} catch (error) {
			console.error('Failed to share to Nostr:', error);

			// Show error state
			shareToNostrBtn.textContent = 'Failed to share';
			shareToNostrBtn.style.background = '#dc3545';

			// Reset after delay
			setTimeout(() => {
				shareToNostrBtn.disabled = false;
				shareToNostrBtn.textContent = 'Share to Nostr';
				shareToNostrBtn.style.background = '';
			}, 3000);
		}
	});

	// Character counter for message
	shareMessageInput.addEventListener('input', () => {
		const helpText = shareMessageInput.parentElement?.querySelector('.input-help') as HTMLElement;
		if (helpText) {
			const remaining = 280 - shareMessageInput.value.length;
			helpText.textContent = `Customize your message (${remaining} characters remaining)`;
			helpText.style.color = remaining < 20 ? '#dc3545' : '';
		}
	});
}

export function showShareModal(pixelCoords: Array<{ x: number, y: number }>) {
	const shareModal = document.getElementById('share-modal')!;
	const shareMessageInput = document.getElementById('share-message')! as HTMLTextAreaElement;
	const shareLinkInput = document.getElementById('share-link')! as HTMLInputElement;
	const shareScreenshotCanvas = document.getElementById('share-screenshot')! as HTMLCanvasElement;
	const shareToNostrBtn = document.getElementById('share-to-nostr')! as HTMLButtonElement;

	// Generate screenshot
	const screenshotDataUrl = captureDesignScreenshot(pixelCoords);
	if (screenshotDataUrl) {
		const img = new Image();
		img.onload = () => {
			shareScreenshotCanvas.width = img.width;
			shareScreenshotCanvas.height = img.height;
			const ctx = shareScreenshotCanvas.getContext('2d')!;
			ctx.drawImage(img, 0, 0);
		};
		img.src = screenshotDataUrl;
	}

	// Generate shareable URL
	const shareableURL = generateShareableURL(pixelCoords);
	shareLinkInput.value = shareableURL;

	// Set default message
	shareMessageInput.value = 'Check out my pixel art on Zappy Place! 🎨⚡\n\n#zappyplace';

	// Reset button state
	shareToNostrBtn.disabled = false;
	shareToNostrBtn.textContent = 'Share to Nostr';
	shareToNostrBtn.style.background = '';

	// Show modal
	shareModal.classList.remove('hidden');
}

export function hideShareModal() {
	const shareModal = document.getElementById('share-modal')!;
	shareModal.classList.add('hidden');
}
