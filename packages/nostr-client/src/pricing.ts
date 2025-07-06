// Age-based pricing constants (in millisats)
export const PRICING = {
	NEW_PIXEL: 1000,        // 1 sat for new pixels
	FRESH_PIXEL: 10000,     // 10 sats for pixels < 1 hour old
	RECENT_PIXEL: 5000,     // 5 sats for pixels 1-24 hours old
	OLDER_PIXEL: 2000,      // 2 sats for pixels 1-7 days old
	ANCIENT_PIXEL: 1000,    // 1 sat for pixels > 1 week old
};

// Age thresholds (in hours)
export const AGE_THRESHOLDS = {
	FRESH: 1,      // < 1 hour
	RECENT: 24,    // 1-24 hours
	OLDER: 168,    // 1-7 days (168 hours)
	ANCIENT: Infinity  // > 1 week
};

export interface CostBreakdown {
	totalSats: number;
	pixelCounts: {
		new: number;
		fresh: number;
		recent: number;
		older: number;
		ancient: number;
	};
}

export interface PreviewPixel {
	x: number;
	y: number;
	color: string;
	cost: number;
	isNew: boolean;
	existingPixelAge?: number;
}

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

export function calculateCostBreakdown(pixels: PreviewPixel[]): CostBreakdown {
	const breakdown: CostBreakdown = {
		totalSats: 0,
		pixelCounts: {
			new: 0,
			fresh: 0,
			recent: 0,
			older: 0,
			ancient: 0
		}
	};

	for (const pixel of pixels) {
		breakdown.totalSats += pixel.cost / 1000; // Convert msats to sats

		if (pixel.isNew) {
			breakdown.pixelCounts.new++;
		} else if (pixel.existingPixelAge !== undefined) {
			const age = pixel.existingPixelAge;
			if (age < AGE_THRESHOLDS.FRESH) breakdown.pixelCounts.fresh++;
			else if (age < AGE_THRESHOLDS.RECENT) breakdown.pixelCounts.recent++;
			else if (age < AGE_THRESHOLDS.OLDER) breakdown.pixelCounts.older++;
			else breakdown.pixelCounts.ancient++;
		}
	}

	return breakdown;
}

export function formatCostBreakdown(breakdown: CostBreakdown): string {
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

	return `${parts.join(', ')} = ${breakdown.totalSats} sats total`;
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
