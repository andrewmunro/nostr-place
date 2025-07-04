import { generateDummyPixels } from './dummyData';
import { setupEventListeners } from './events';
import { nostrService } from './nostr';
import { loadFromURL, updateURL } from './persistence';
import { renderWorld, setupPixiJS } from './renderer';
import { state } from './state';
import './style.css';
import { setupUI } from './ui';

// Check if debug mode is enabled via URL parameter
function isDebugMode(): boolean {
	const urlParams = new URLSearchParams(window.location.search);
	return urlParams.has('debug');
}

// Initialize debug mode with dummy data
function initDebugMode() {
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
	state.textureNeedsUpdate = true;
}

// Initialize the application
async function init() {
	try {
		console.log('Initializing Nostr Place...');

		setupUI();
		await setupPixiJS();
		setupEventListeners();

		// Check for debug mode
		if (isDebugMode()) {
			initDebugMode();
		} else {
			// Initialize Nostr connection
			console.log('Connecting to Nostr...');
			await nostrService.initialize();
			console.log('🌐 Connection status:', nostrService.getConnectionStatus());
		}

		loadFromURL();
		updateURL();
		renderWorld();

		console.log('✅ Nostr Place ready!');
	} catch (error) {
		console.error('❌ Failed to initialize Nostr Place:', error);
		// Still render the UI even if Nostr fails
		loadFromURL();
		updateURL();
		renderWorld();
	}
}

// Start the application
init(); 