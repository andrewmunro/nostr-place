// World constants
export const WORLD_SIZE = 2000; // 2000x2000 pixel world
export const MIN_SCALE = 0.5; // Prevent zooming out too far
export const MAX_SCALE = 400; // Reasonable maximum zoom
export const DEFAULT_SCALE = 25;

// Preview mode constants
export const PREVIEW_MODE = {
	MAX_PIXELS_PER_BATCH: 300,
	PREVIEW_OPACITY: 1.0,
	EXISTING_PIXEL_DIM: 0.3,
};

export const PRESET_COLORS = [
	'#FFFFFF', '#C4C4C4', '#A6A6A6', '#888888', '#6F6F6F', '#555555', '#3A3A3A', '#222222',
	'#000000', '#003638', '#006600', '#477050', '#1B7400', '#22B14C', '#02BE01', '#51E119',
	'#94E044', '#34EB6B', '#98FB98', '#75CEA9', '#CAFF70', '#FBFF5B', '#E5D900', '#FFCC00',
	'#C1A162', '#E6BE0C', '#E59500', '#FF7000', '#FF3904', '#E50000', '#CE2939', '#FF416A',
	'#9F0000', '#4D082C', '#6B0000', '#440414', '#FF755F', '#A06A42', '#633C1F', '#99530D',
	'#BB4F00', '#FFC49F', '#FFDFCC', '#FF7EBB', '#FFA7D1', '#EC08EC', '#BB276C', '#CF6EE4',
	'#7D26CD', '#820080', '#591C91', '#330077', '#020763', '#5100FF', '#0000EA', '#044BFF',
	'#013182', '#005BA1', '#6583CF', '#36BAFF', '#0083C7', '#00D3DD', '#45FFC8', '#B5E8EE',
];