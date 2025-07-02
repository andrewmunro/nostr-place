import { CanvasConfig, PixelEvent, ValidationResult, ZapEvent } from './types.js';

export class PixelValidator {
	constructor(private config: CanvasConfig) { }

	validatePixelEvent(pixelEvent: PixelEvent): ValidationResult {
		// Check if event has required tags
		const xTag = pixelEvent.tags.find(tag => tag[0] === 'x');
		const yTag = pixelEvent.tags.find(tag => tag[0] === 'y');
		const colorTag = pixelEvent.tags.find(tag => tag[0] === 'color');

		if (!xTag || !yTag || !colorTag) {
			return { isValid: false, reason: 'Missing required tags (x, y, color)' };
		}

		const x = parseInt(xTag[1]);
		const y = parseInt(yTag[1]);

		if (isNaN(x) || isNaN(y)) {
			return { isValid: false, reason: 'Invalid coordinates' };
		}

		if (x < 0 || x >= this.config.canvasSize || y < 0 || y >= this.config.canvasSize) {
			return { isValid: false, reason: 'Coordinates out of bounds' };
		}

		// Validate color format
		const colorRegex = /^#[0-9A-F]{6}$/i;
		if (!colorRegex.test(colorTag[1])) {
			return { isValid: false, reason: 'Invalid color format' };
		}

		return { isValid: true };
	}

	validateZapEvent(zapEvent: ZapEvent, pixelEvent: PixelEvent): ValidationResult {
		// Check if zap references the pixel event
		const eTag = zapEvent.tags.find(tag => tag[0] === 'e');
		if (!eTag || eTag[1] !== pixelEvent.id) {
			return { isValid: false, reason: 'Zap does not reference pixel event' };
		}

		// Check timestamp order
		if (zapEvent.created_at <= pixelEvent.created_at) {
			return { isValid: false, reason: 'Zap timestamp must be after pixel event' };
		}

		// Check time window
		const timeDiff = zapEvent.created_at - pixelEvent.created_at;
		if (timeDiff > this.config.zapTimeWindow) {
			return { isValid: false, reason: 'Zap is outside time window' };
		}

		// Check minimum amount
		const amountTag = zapEvent.tags.find(tag => tag[0] === 'amount');
		if (amountTag) {
			const amount = parseInt(amountTag[1]);
			if (amount < this.config.minZapAmount) {
				return { isValid: false, reason: 'Zap amount below minimum' };
			}
		}

		return { isValid: true };
	}

	extractPixelFromEvent(pixelEvent: PixelEvent, zapEvent?: ZapEvent): {
		x: number;
		y: number;
		color: string;
		eventId: string;
		pubkey: string;
		timestamp: number;
		zapEventId?: string;
		zapAmount?: number;
		isValid: boolean;
	} {
		const xTag = pixelEvent.tags.find(tag => tag[0] === 'x');
		const yTag = pixelEvent.tags.find(tag => tag[0] === 'y');
		const colorTag = pixelEvent.tags.find(tag => tag[0] === 'color');

		const x = parseInt(xTag?.[1] || '0');
		const y = parseInt(yTag?.[1] || '0');
		const color = colorTag?.[1] || '#000000';

		let zapAmount: number | undefined;
		if (zapEvent) {
			const amountTag = zapEvent.tags.find(tag => tag[0] === 'amount');
			zapAmount = amountTag ? parseInt(amountTag[1]) : undefined;
		}

		const pixelValidation = this.validatePixelEvent(pixelEvent);
		const zapValidation = zapEvent ? this.validateZapEvent(zapEvent, pixelEvent) : { isValid: false };

		return {
			x,
			y,
			color,
			eventId: pixelEvent.id,
			pubkey: pixelEvent.pubkey,
			timestamp: pixelEvent.created_at,
			zapEventId: zapEvent?.id,
			zapAmount,
			isValid: pixelValidation.isValid && zapValidation.isValid
		};
	}
} 