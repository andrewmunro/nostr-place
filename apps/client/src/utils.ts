export function throttle<T extends (...args: any[]) => void>(func: T, delay: number): T {
	let lastCallTime = 0;
	let timeoutId: number | null = null;

	return ((...args: Parameters<T>) => {
		const now = Date.now();
		const timeSinceLastCall = now - lastCallTime;

		if (timeSinceLastCall >= delay) {
			// Execute immediately if enough time has passed
			lastCallTime = now;
			func(...args);
		} else {
			// Schedule execution for the remaining time
			if (timeoutId !== null) {
				clearTimeout(timeoutId);
			}
			timeoutId = window.setTimeout(() => {
				lastCallTime = Date.now();
				func(...args);
				timeoutId = null;
			}, delay - timeSinceLastCall);
		}
	}) as T;
}