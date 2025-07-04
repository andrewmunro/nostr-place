import { initDebugMode, isDebugMode } from './debug';
import { setupInput } from './input';
import { nostrService } from './nostr';
import { loadFromURL, updateURL } from './persistence';
import { renderWorld, setupPixiJS } from './renderer';
import './style.css';
import { setupUI, updateUserInfo } from './ui';

// Update user info when authenticated
document.addEventListener('nlAuth', async (e) => {
	try {
		const publicKey = await window.nostr!.getPublicKey();
		updateUserInfo(publicKey);
	} catch (error) {
		updateUserInfo();
	}
});

// Initialize the application
async function init() {

	console.log('Initializing Nostr Place...');

	setupUI();
	await setupPixiJS();
	setupInput();

	loadFromURL();
	updateURL();
	renderWorld();

	try {
		// Check for debug mode
		if (isDebugMode()) {
			initDebugMode();
		} else {
			// Initialize Nostr connection
			console.log('Connecting to Nostr...');
			await nostrService.initialize();
			console.log('🌐 Connection status:', nostrService.getConnectionStatus());
		}

		console.log('✅ Nostr Place ready!');
	} catch (error) {
		console.error('❌ Failed to initialize Nostr Place:', error);
	}
}

// Start the application
init(); 