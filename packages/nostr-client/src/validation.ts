import { getPixelPrice } from './pricing';
import { PixelData, PixelEvent, ValidationError } from './types';

// Canvas configuration
const WORLD_SIZE = 2000;

export interface ValidationResult {
	isValid: boolean;
	errors: ValidationError[];
}

// Export validation constants for use by client app
export const VALIDATION_CONSTANTS = {
	WORLD_SIZE,
};

// Helper function to get validation summary
export function getValidationSummary(result: ValidationResult): string {
	if (result.isValid) {
		return 'All validations passed';
	}

	const errorCounts = result.errors.reduce((acc, error) => {
		acc[error.type] = (acc[error.type] || 0) + 1;
		return acc;
	}, {} as Record<string, number>);

	const summaryParts = Object.entries(errorCounts).map(([type, count]) => {
		const readableType = type.toLowerCase().replace(/_/g, ' ');
		return `${count} ${readableType} error${count > 1 ? 's' : ''}`;
	});

	return `Validation failed: ${summaryParts.join(', ')}`;
}

// Validate hex color format (#rrggbb)
function isValidHexColor(color: string): boolean {
	return /^#[0-9A-Fa-f]{6}$/.test(color);
}

// Validate pixel coordinates are within canvas bounds
function isValidCoordinate(x: number, y: number): boolean {
	return Number.isInteger(x) && Number.isInteger(y) &&
		x >= 0 && x < WORLD_SIZE &&
		y >= 0 && y < WORLD_SIZE;
}

// Validate individual pixel data
function validatePixel(pixel: PixelData, index: number): ValidationError[] {
	const errors: ValidationError[] = [];

	// Check coordinates
	if (!isValidCoordinate(pixel.x, pixel.y)) {
		errors.push({
			type: 'INVALID_COORDINATES',
			message: `Pixel at index ${index} has invalid coordinates (${pixel.x}, ${pixel.y}). Must be within 0-${WORLD_SIZE - 1}.`,
			pixelIndex: index,
			pixel
		});
	}

	// Check color format
	if (!isValidHexColor(pixel.color)) {
		errors.push({
			type: 'INVALID_COLOR',
			message: `Pixel at index ${index} has invalid color "${pixel.color}". Must be in #rrggbb format.`,
			pixelIndex: index,
			pixel
		});
	}

	return errors;
}

// Validate pixel event against business rules
export function validatePixelEvent(
	pixelEvent: PixelEvent,
	existingPixelGetter: (x: number, y: number) => PixelEvent | undefined
): ValidationResult {
	const errors: ValidationError[] = [];

	// Check if event has pixels
	if (!pixelEvent.pixels || pixelEvent.pixels.length === 0) {
		errors.push({
			type: 'TOO_MANY_PIXELS',
			message: 'Pixel event must contain at least one pixel.'
		});
		return { isValid: false, errors };
	}

	// Check maximum pixels per batch
	// if (pixelEvent.pixels.length > MAX_PIXELS_PER_BATCH) {
	// 	errors.push({
	// 		type: 'TOO_MANY_PIXELS',
	// 		message: `Too many pixels in batch (${pixelEvent.pixels.length}). Maximum allowed: ${MAX_PIXELS_PER_BATCH}.`
	// 	});
	// }

	// Check timestamp validity
	if (pixelEvent.timestamp && pixelEvent.timestamp > Math.floor(Date.now() / 1000) + 60) {
		errors.push({
			type: 'INVALID_TIMESTAMP',
			message: 'Pixel event timestamp is too far in the future.'
		});
	}

	// Validate each pixel
	pixelEvent.pixels.forEach((pixel, index) => {
		const pixelErrors = validatePixel(pixel, index);
		errors.push(...pixelErrors);
	});

	// If there are validation errors for pixels, don't proceed to amount validation
	if (errors.length > 0) {
		return { isValid: false, errors };
	}

	// Calculate expected cost based on existing pixels
	let expectedCost = 0;
	const pixelCosts: Array<{ pixel: PixelData; cost: number }> = [];

	// For validation, use current time if no timestamp is provided in the pixel event
	// This matches how the client app calculates costs
	const validationTime = pixelEvent.timestamp ? pixelEvent.timestamp * 1000 : Date.now();

	for (const pixel of pixelEvent.pixels) {
		const existingPixel = existingPixelGetter(pixel.x, pixel.y);
		const cost = getPixelPrice(
			existingPixel?.timestamp ? existingPixel.timestamp * 1000 : null,
			validationTime
		);
		expectedCost += cost;
		pixelCosts.push({ pixel, cost });
	}

	// Validate payment amount matches expected cost
	if (pixelEvent.amount !== expectedCost) {
		// Create a cost summary instead of listing every pixel
		const costSummary = pixelCosts.reduce((acc, { cost }) => {
			acc[cost] = (acc[cost] || 0) + 1;
			return acc;
		}, {} as Record<number, number>);

		const summaryText = Object.entries(costSummary)
			.map(([cost, count]) => `${count}×${cost} sats`)
			.join(', ');

		errors.push({
			type: 'INVALID_AMOUNT',
			message: `Payment amount (${pixelEvent.amount} sats) does not match expected cost (${expectedCost} sats). ${pixelEvent.pixels.length} pixels: ${summaryText}.`
		});
	}

	return {
		isValid: errors.length === 0,
		errors
	};
}

// Validate pixel event with optimistic rendering support
export function validatePixelEventOptimistic(
	pixelEvent: PixelEvent,
	existingPixelGetter: (x: number, y: number) => PixelEvent | undefined
): ValidationResult {
	// For optimistic rendering, we're more lenient with timing validation
	const result = validatePixelEvent(pixelEvent, existingPixelGetter);

	// Filter out timestamp errors for optimistic validation
	const filteredErrors = result.errors.filter(error => error.type !== 'INVALID_TIMESTAMP');

	return {
		isValid: filteredErrors.length === 0,
		errors: filteredErrors
	};
} 