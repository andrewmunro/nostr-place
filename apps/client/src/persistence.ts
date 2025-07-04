import { MAX_SCALE, MIN_SCALE } from './constants';
import { state } from './state';

function debounce<T extends (...args: any[]) => void>(func: T, delay: number): T {
	let timeoutId: number | null = null;

	return ((...args: Parameters<T>) => {
		if (timeoutId !== null) {
			clearTimeout(timeoutId);
		}

		timeoutId = window.setTimeout(() => {
			func(...args);
			timeoutId = null;
		}, delay);
	}) as T;
}

function updateURLImmediate() {
	const hash = `#x=${Math.floor(state.camera.x)}&y=${Math.floor(state.camera.y)}&scale=${state.camera.scale.toFixed(2)}`;
	if (window.location.hash !== hash) {
		window.history.replaceState(null, '', hash);
	}
}

export const updateURL = debounce(updateURLImmediate, 50);

export function loadFromURL() {
	const hash = window.location.hash.slice(1);
	const params = new URLSearchParams(hash);

	const x = params.get('x');
	const y = params.get('y');
	const scale = params.get('scale');

	if (x !== null) state.updateCamera({ x: parseInt(x) });
	if (y !== null) state.updateCamera({ y: parseInt(y) });
	if (scale !== null) {
		const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, parseFloat(scale)));
		state.updateCamera({ scale: newScale });
	}
} 