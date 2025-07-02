import { setupEventListeners } from './events';
import { loadFromURL, updateURL } from './persistence';
import { renderWorld, setupPixiJS } from './renderer';
import './style.css';
import { setupUI } from './ui';

// Initialize the application
async function init() {
	setupUI();
	await setupPixiJS();
	setupEventListeners();
	loadFromURL();
	updateURL();
	renderWorld();
}

// Start the application
init(); 