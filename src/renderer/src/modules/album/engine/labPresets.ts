import { AlbumSizePreset } from '../album';

export const LAB_PRESETS: AlbumSizePreset[] = [
  {
    id: '12x36_panoramic_royal',
    name: '12 × 36 in (Royal Indian Wedding Spread)',
    category: 'Landscape',
    singlePageWidth: 18,
    singlePageHeight: 12,
    spreadWidth: 36,
    spreadHeight: 12,
    bleedInches: 0.125,
    safeMarginInches: 0.5,
    gutterType: 'layflat_seamless',
    description: 'Gold standard for Indian Grand Weddings (Canvera / Suba / HP Indigo). 3:1 panoramic spread.'
  },
  {
    id: '12x30_panoramic_standard',
    name: '12 × 30 in (Classic Indian Panoramic Spread)',
    category: 'Landscape',
    singlePageWidth: 15,
    singlePageHeight: 12,
    spreadWidth: 30,
    spreadHeight: 12,
    bleedInches: 0.125,
    safeMarginInches: 0.5,
    gutterType: 'layflat_seamless',
    description: 'Most popular Indian wedding size: 12x15 page (12x30 open spread).'
  },
  {
    id: '12x12_square_premium',
    name: '12 × 12 in (Square Wedding Album)',
    category: 'Square',
    singlePageWidth: 12,
    singlePageHeight: 12,
    spreadWidth: 24,
    spreadHeight: 12,
    bleedInches: 0.125,
    safeMarginInches: 0.375,
    gutterType: 'flush_mount',
    description: 'International luxury wedding favorite. 24x12 in spread (Millers / Graphistudio / Kiss).'
  },
  {
    id: '10x10_square_parent',
    name: '10 × 10 in (Parent / Engagement Album)',
    category: 'Square',
    singlePageWidth: 10,
    singlePageHeight: 10,
    spreadWidth: 20,
    spreadHeight: 10,
    bleedInches: 0.125,
    safeMarginInches: 0.375,
    gutterType: 'flush_mount',
    description: 'Standard parent album or pre-wedding album. 20x10 in open spread.'
  },
  {
    id: '11x14_landscape_classic',
    name: '11 × 14 in (Editorial Horizontal)',
    category: 'Landscape',
    singlePageWidth: 14,
    singlePageHeight: 11,
    spreadWidth: 28,
    spreadHeight: 11,
    bleedInches: 0.125,
    safeMarginInches: 0.5,
    gutterType: 'layflat_seamless',
    description: 'Fine-art landscape spread. 28x11 in open spread.'
  },
  {
    id: '8x8_square_pocket',
    name: '8 × 8 in (Coffee Table Mini / Guestbook)',
    category: 'Square',
    singlePageWidth: 8,
    singlePageHeight: 8,
    spreadWidth: 16,
    spreadHeight: 8,
    bleedInches: 0.125,
    safeMarginInches: 0.25,
    gutterType: 'flush_mount',
    description: 'Compact keepsake album. 16x8 in open spread.'
  },
  {
    id: '12x8_portrait_vertical',
    name: '12 × 8 in (Vertical Fine Art Portrait)',
    category: 'Portrait',
    singlePageWidth: 8,
    singlePageHeight: 12,
    spreadWidth: 16,
    spreadHeight: 12,
    bleedInches: 0.125,
    safeMarginInches: 0.375,
    gutterType: 'split_crease',
    description: 'Fashion & portrait spread. 16x12 in open spread.'
  }
];

export const DEFAULT_PRESET = LAB_PRESETS[0]; // 12x36 or 12x30
