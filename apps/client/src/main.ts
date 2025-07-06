import { updateCamera } from './camera';
import { initDebugMode, isDebugMode } from './debug';
import { setupInput } from './input';
import { nostrService } from './nostr';
import { loadFromURL, updateURL } from './persistence';
import { setupRenderer, updateRenderer } from './renderer';
import { state } from './state';
import { setupUI, setUserInfo, updateUI } from './ui';

// Update user info when authenticated
document.addEventListener('nlAuth', async (e) => {
	try {
		const publicKey = await window.nostr!.getPublicKey();
		setUserInfo(publicKey);
	} catch (error) {
		setUserInfo();
	}
});

function updateLoop() {
	updateCamera();
	updateUI();
	updateURL();
	updateRenderer();
}

// Initialize the application
async function initialize() {
	console.log('Initializing Zappy Place...');
	await setupRenderer();
	setupUI();
	setupInput();
	loadFromURL();

	state.app.ticker.add(updateLoop);

	try {
		// Check for debug mode
		if (isDebugMode()) {
			initDebugMode();
		} else {
			// Initialize Nostr connection
			console.log('Connecting to Nostr...');
			await nostrService.initialize();
		}

		console.log('✅ Zappy Place ready!');
	} catch (error) {
		console.error('❌ Failed to initialize Zappy Place:', error);
	}
}

// Start the application
initialize(); 