export interface PhotoItem {
  id: string;
  fileName: string;
  url: string;
  width: number;
  height: number;
  aspectRatio: number; // width / height
  rating: number; // 0 to 5
  colorLabel: 'none' | 'red' | 'yellow' | 'green' | 'blue' | 'purple';
  tags?: string[];
  usedCount: number;
}

export type AssetCategory = 'clipart' | 'overlay' | 'background' | 'photo';

export interface StudioAssetItem {
  id: string;
  name: string;
  category: AssetCategory;
  url: string;
  tags?: string[];
  isCustom?: boolean;
}

export interface FrameCrop {
  zoom: number; // 1.0 to 3.0
  panX: number; // -50 to 50 percent
  panY: number; // -50 to 50 percent
}

export type PhotoFilter = 'none' | 'bw' | 'sepia' | 'warm' | 'cool';

export interface SpreadFrame {
  id: string;
  photoId: string | null;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
  height: number; // percentage 0-100
  crop: FrameCrop;
  filter: PhotoFilter;
  rotation: number; // 0, 90, 180, 270
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  pageSide: 'left' | 'right' | 'span';
}

export interface TextBlock {
  id: string;
  text: string;
  fontFamily: 'The Seasons' | 'Vidaloka' | 'Tenor Sans' | 'DM Sans' | 'Inter' | 'Cinzel' | 'Cormorant Garamond' | 'Playfair Display' | 'Newsreader' | 'Roboto Mono';
  fontSize: number; // px
  fontWeight: '300' | '400' | '500' | '600' | '700';
  fontStyle: 'normal' | 'italic';
  color: string;
  alignment: 'left' | 'center' | 'right';
  letterSpacing: number; // em
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  width: number; // percentage 0-100
}

export interface SpreadComment {
  id: string;
  author: 'Client' | 'Studio' | 'Editor';
  text: string;
  createdAt: string;
  resolved: boolean;
  x?: number; // Pin position X
  y?: number; // Pin position Y
}

export interface SpreadBackgroundConfig {
  type: 'color' | 'image';
  color: string; // solid background or fallback
  imageUrl?: string;
  blur?: number; // 0 to 60px
  overlayOpacity?: number; // 0 to 1
  overlayColor?: string; // hex
  brightness?: number; // 50 to 150
}

/**
 * SheetType represents the physical structure of an album sheet:
 * - full_spread: Open 2-page panorama sheet (spreadWidth × spreadHeight)
 * - front_cover: Front cover page (half-sheet: singlePageWidth × spreadHeight)
 * - back_cover: Back cover page (half-sheet: singlePageWidth × spreadHeight)
 * - first_half: Page 1 on the right side (half-sheet: singlePageWidth × spreadHeight)
 * - last_half: Final inside page on the left side (half-sheet: singlePageWidth × spreadHeight)
 */
export type SheetType = 'full_spread' | 'front_cover' | 'back_cover' | 'first_half' | 'last_half';

export interface SpreadItem {
  id: string;
  spreadIndex: number; // 0, 1, 2...
  name: string;
  layoutId: string;
  sheetType?: SheetType;
  frames: SpreadFrame[];
  textBlocks: TextBlock[];
  comments: SpreadComment[];
  backgroundColor: string; // e.g. '#FFFFFF', '#FAF8F5', '#111417'
  backgroundConfig?: SpreadBackgroundConfig;
  gap: number; // px spacing between photos
  margin: number; // px margin from edges
  hasGutterWarning?: boolean;
  hasDpiWarning?: boolean;
  status: 'draft' | 'needs_review' | 'approved';
}

export type GutterType = 'layflat_seamless' | 'flush_mount' | 'split_crease';

export interface AlbumSizePreset {
  id: string;
  name: string;
  category: 'Square' | 'Landscape' | 'Portrait';
  singlePageWidth: number; // inches
  singlePageHeight: number; // inches
  spreadWidth: number; // inches
  spreadHeight: number; // inches
  bleedInches: number;
  safeMarginInches: number;
  gutterType: GutterType;
  description: string;
}

export type AlbumBindingStyle = 'layflat_full' | 'traditional_halves';

export interface AlbumProject {
  id: string;
  title: string;
  clientNames: string;
  eventType: string;
  eventDate: string;
  sizePreset: AlbumSizePreset;
  targetDpi: number; // e.g. 300, 250, 200, 600
  bindingStyle?: AlbumBindingStyle; // 'layflat_full' (starts full spread) or 'traditional_halves' (starts first half, ends last half)
  hasFrontCover?: boolean;
  hasBackCover?: boolean;
  photos: PhotoItem[];
  spreads: SpreadItem[];
  createdAt: string;
  updatedAt: string;
}

export interface LayoutVariation {
  id: string;
  name: string;
  photoCount: number;
  tags: string[];
  generateFrames: (gap: number, margin: number) => Omit<SpreadFrame, 'id' | 'photoId' | 'crop' | 'filter' | 'rotation'>[];
}
