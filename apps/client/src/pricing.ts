import { AGE_THRESHOLDS, PRICING } from './constants';
import { CostBreakdown, PreviewPixel } from './state';

export function calculatePixelCost(ageHours: number): number {
	if (ageHours < AGE_THRESHOLDS.FRESH) return PRICING.FRESH_PIXEL;
	if (ageHours < AGE_THRESHOLDS.RECENT) return PRICING.RECENT_PIXEL;
	if (ageHours < AGE_THRESHOLDS.OLDER) return PRICING.OLDER_PIXEL;
	return PRICING.ANCIENT_PIXEL;
}

export function getPixelPrice(existingPixelTimestamp: number | null, currentTimestamp: number = Date.now()): number {
	if (!existingPixelTimestamp) {
		return PRICING.NEW_PIXEL;
	}

	const ageHours = (currentTimestamp - existingPixelTimestamp) / (1000 * 60 * 60);
	return calculatePixelCost(ageHours);
}

export function calculateCostBreakdown(previewPixels: Map<string, PreviewPixel>): CostBreakdown {
	const breakdown: CostBreakdown = {
		newPixels: 0,
		freshPixels: 0,
		recentPixels: 0,
		olderPixels: 0,
		ancientPixels: 0,
		totalCost: 0
	};

	for (const pixel of previewPixels.values()) {
		breakdown.totalCost += pixel.cost;

		if (pixel.isNew) {
			breakdown.newPixels++;
		} else if (pixel.existingPixelAge !== undefined) {
			const age = pixel.existingPixelAge;

			if (age < AGE_THRESHOLDS.FRESH) breakdown.freshPixels++;
			else if (age < AGE_THRESHOLDS.RECENT) breakdown.recentPixels++;
			else if (age < AGE_THRESHOLDS.OLDER) breakdown.olderPixels++;
			else breakdown.ancientPixels++;
		}
	}

	return breakdown;
}

export function formatCostBreakdown(breakdown: CostBreakdown): string {
	const parts: string[] = [];

	if (breakdown.newPixels > 0) {
		parts.push(`${breakdown.newPixels} new (${breakdown.newPixels} sat${breakdown.newPixels > 1 ? 's' : ''})`);
	}
	if (breakdown.freshPixels > 0) {
		parts.push(`${breakdown.freshPixels} fresh (${breakdown.freshPixels * 10} sats)`);
	}
	if (breakdown.recentPixels > 0) {
		parts.push(`${breakdown.recentPixels} recent (${breakdown.recentPixels * 5} sats)`);
	}
	if (breakdown.olderPixels > 0) {
		parts.push(`${breakdown.olderPixels} older (${breakdown.olderPixels * 2} sats)`);
	}
	if (breakdown.ancientPixels > 0) {
		parts.push(`${breakdown.ancientPixels} ancient (${breakdown.ancientPixels} sat${breakdown.ancientPixels > 1 ? 's' : ''})`);
	}

	const totalSats = breakdown.totalCost / 1000;
	return `${parts.join(', ')} = ${totalSats} sats total`;
}

export function getAgeCategory(ageHours: number): 'fresh' | 'recent' | 'older' | 'ancient' {
	if (ageHours < AGE_THRESHOLDS.FRESH) return 'fresh';
	if (ageHours < AGE_THRESHOLDS.RECENT) return 'recent';
	if (ageHours < AGE_THRESHOLDS.OLDER) return 'older';
	return 'ancient';
}

export function getAgeCategoryColor(category: 'fresh' | 'recent' | 'older' | 'ancient'): string {
	switch (category) {
		case 'fresh': return '#FF4444';   // Red - expensive
		case 'recent': return '#FF8800';  // Orange - moderate
		case 'older': return '#FFAA00';   // Yellow - cheap
		case 'ancient': return '#888888'; // Gray - cheapest
		default: return '#888888';
	}
} 