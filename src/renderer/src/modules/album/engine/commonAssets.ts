import { StudioAssetItem, SpreadBackgroundConfig } from '../album';

const COMMON_ASSETS_KEY = 'bawaray_common_studio_assets';

export const DEFAULT_COMMON_ASSETS: StudioAssetItem[] = [
  // Clip Arts & Motifs
  {
    id: 'ca-mandala-gold',
    name: 'Royal Gold Mandala',
    category: 'clipart',
    url: '/assets/cliparts/mandala_gold.svg',
    tags: ['Mandala', 'Gold', 'Wedding', 'Spiritual']
  },
  {
    id: 'ca-royal-crest',
    name: 'Regal Monogram Crest',
    category: 'clipart',
    url: '/assets/cliparts/royal_crest.svg',
    tags: ['Crest', 'Laurel', 'Monogram', 'Crown']
  },
  {
    id: 'ca-wedding-rings',
    name: 'Interlocked Diamond Rings',
    category: 'clipart',
    url: '/assets/cliparts/wedding_rings.svg',
    tags: ['Rings', 'Jewelry', 'Gold', 'Diamond']
  },
  {
    id: 'ca-floral-flourish',
    name: 'Botanical Corner Flourish',
    category: 'clipart',
    url: '/assets/cliparts/floral_flourish.svg',
    tags: ['Floral', 'Corner', 'Gold', 'Border']
  },

  // Overlays & Textures
  {
    id: 'ov-golden-bokeh',
    name: 'Golden Light Bokeh Overlay',
    category: 'overlay',
    url: 'https://images.unsplash.com/photo-1519751138087-5bf79df62d5b?auto=format&fit=crop&w=1200&q=80',
    tags: ['Bokeh', 'Glow', 'Lights', 'Golden']
  },
  {
    id: 'ov-light-leak',
    name: 'Warm Sunflare Light Leak',
    category: 'overlay',
    url: 'https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=1200&q=80',
    tags: ['Light Leak', 'Sunflare', 'Warm', 'Film']
  },
  {
    id: 'ov-film-grain',
    name: 'Subtle Film Grain & Dust',
    category: 'overlay',
    url: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=1200&q=80',
    tags: ['Grain', 'Vintage', 'Texture', 'Moody']
  },

  // Fine Art Backgrounds
  {
    id: 'bg-warm-linen',
    name: 'Warm Handcrafted Linen Paper',
    category: 'background',
    url: 'https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?auto=format&fit=crop&w=1600&q=80',
    tags: ['Paper', 'Linen', 'Fine Art', 'Minimal']
  },
  {
    id: 'bg-marble-luxury',
    name: 'White & Gold Luxury Marble',
    category: 'background',
    url: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=1600&q=80',
    tags: ['Marble', 'Luxury', 'Editorial', 'White']
  },
  {
    id: 'bg-deep-velvet',
    name: 'Noir Royal Velvet Texture',
    category: 'background',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=1600&q=80',
    tags: ['Noir', 'Black', 'Moody', 'Velvet']
  },

  // Studio Photos (Universal intro/outro or backdrop shots)
  {
    id: 'ph-palace-sunset',
    name: 'Udaipur Palace Silhouette',
    category: 'photo',
    url: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1600&q=80',
    tags: ['Palace', 'Sunset', 'Silhouette', 'Royal']
  },
  {
    id: 'ph-rose-petals',
    name: 'Red Rose Petals Floral Spread',
    category: 'photo',
    url: 'https://images.unsplash.com/photo-1518895949257-7621c3c786d7?auto=format&fit=crop&w=1600&q=80',
    tags: ['Roses', 'Petals', 'Varmala', 'Romantic']
  }
];

export function getCommonAssets(): StudioAssetItem[] {
  try {
    const stored = localStorage.getItem(COMMON_ASSETS_KEY);
    if (!stored) return DEFAULT_COMMON_ASSETS;
    const customAssets: StudioAssetItem[] = JSON.parse(stored);
    return [...DEFAULT_COMMON_ASSETS, ...customAssets];
  } catch (e) {
    console.error('Failed to parse custom common assets', e);
    return DEFAULT_COMMON_ASSETS;
  }
}

export function saveCommonAsset(asset: StudioAssetItem): void {
  try {
    const stored = localStorage.getItem(COMMON_ASSETS_KEY);
    const customAssets: StudioAssetItem[] = stored ? JSON.parse(stored) : [];
    customAssets.push(asset);
    localStorage.setItem(COMMON_ASSETS_KEY, JSON.stringify(customAssets));
  } catch (e) {
    console.error('Failed to save common asset', e);
  }
}

export function deleteCommonAsset(assetId: string): void {
  try {
    const stored = localStorage.getItem(COMMON_ASSETS_KEY);
    if (!stored) return;
    const customAssets: StudioAssetItem[] = JSON.parse(stored);
    const filtered = customAssets.filter(a => a.id !== assetId);
    localStorage.setItem(COMMON_ASSETS_KEY, JSON.stringify(filtered));
  } catch (e) {
    console.error('Failed to delete common asset', e);
  }
}

/**
 * Creates a blurred background configuration from an image URL
 */
export function createBlurredBackgroundConfig(
  imageUrl: string,
  blur = 24,
  overlayOpacity = 0.4,
  overlayColor = '#000000',
  brightness = 95
): SpreadBackgroundConfig {
  return {
    type: 'image',
    color: '#121419',
    imageUrl,
    blur,
    overlayOpacity,
    overlayColor,
    brightness
  };
}
