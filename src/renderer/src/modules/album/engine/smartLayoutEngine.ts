import { SpreadFrame, SpreadItem, PhotoItem } from '../album';

export interface LayoutTemplate {
  id: string;
  name: string;
  description: string;
  photoCount: number;
  category: 'Clean' | 'Hero' | 'Grid' | 'Editorial' | 'Panoramic' | 'Minimalist';
  getFrames: (marginPct: number, gapPct: number) => Array<{
    x: number;
    y: number;
    width: number;
    height: number;
    pageSide: 'left' | 'right' | 'span';
  }>;
}

// Helper to convert margin and gap in pixels to percentage based on standard spread aspect ratio
export function normalizeSpacing(marginPx: number, gapPx: number, spreadAspect = 2.5) {
  // Typical canvas width: 1200px
  const baseW = 1200;
  const baseH = baseW / spreadAspect;
  const mx = (marginPx / baseW) * 100;
  const my = (marginPx / baseH) * 100;
  const gx = (gapPx / baseW) * 100;
  const gy = (gapPx / baseH) * 100;
  return { mx, my, gx, gy };
}

export const LAYOUT_TEMPLATES: Record<number, LayoutTemplate[]> = {
  // 1 PHOTO
  1: [
    {
      id: '1-full-bleed',
      name: 'Full Bleed Panoramic',
      description: 'Single heroic image spanning the entire 2-page spread',
      photoCount: 1,
      category: 'Panoramic',
      getFrames: () => [
        { x: 0, y: 0, width: 100, height: 100, pageSide: 'span' }
      ]
    },
    {
      id: '1-centered-hero',
      name: 'Centered Hero with Breathing Room',
      description: 'Elegant fine-art centerpiece with generous luxury border',
      photoCount: 1,
      category: 'Minimalist',
      getFrames: (m) => {
        const margin = Math.max(m, 6);
        return [
          { x: margin * 1.5, y: margin, width: 100 - margin * 3, height: 100 - margin * 2, pageSide: 'span' }
        ];
      }
    },
    {
      id: '1-right-page-hero',
      name: 'Right Page Hero (Left Empty/Text)',
      description: 'Classic museum book layout: art on right page, negative space on left',
      photoCount: 1,
      category: 'Editorial',
      getFrames: (m) => [
        { x: 50 + m, y: m, width: 50 - m * 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '1-left-page-hero',
      name: 'Left Page Hero (Right Negative Space)',
      description: 'Editorial presentation anchored on the left page',
      photoCount: 1,
      category: 'Editorial',
      getFrames: (m) => [
        { x: m, y: m, width: 50 - m * 2, height: 100 - m * 2, pageSide: 'left' }
      ]
    }
  ],

  // 2 PHOTOS
  2: [
    {
      id: '2-split-equal',
      name: 'Balanced 50/50 Pages',
      description: 'One prominent photo on left page, one on right page',
      photoCount: 2,
      category: 'Clean',
      getFrames: (m, g) => [
        { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '2-hero-left-accent-right',
      name: 'Hero Left (65%) + Portrait Right',
      description: 'Grand moment on left with complementary vertical portrait on right',
      photoCount: 2,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: 60 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
        { x: 60 + g / 2, y: m, width: 40 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '2-hero-right-accent-left',
      name: 'Hero Right (65%) + Portrait Left',
      description: 'Feature photo on right with subtle establishing shot on left',
      photoCount: 2,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: 40 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
        { x: 40 + g / 2, y: m, width: 60 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '2-stacked-right-page',
      name: 'Diptych on Right Page',
      description: 'Two stacked photos on right page with open left page',
      photoCount: 2,
      category: 'Editorial',
      getFrames: (m, g) => [
        { x: 50 + m, y: m, width: 50 - m * 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: 50 + m, y: 50 + g / 2, width: 50 - m * 2, height: 50 - m - g / 2, pageSide: 'right' }
      ]
    },
    {
      id: '2-horizontal-stacked-full',
      name: 'Horizontal Cinemascope Split',
      description: 'Two panoramic horizontal strips spanning across the spread',
      photoCount: 2,
      category: 'Panoramic',
      getFrames: (m, g) => [
        { x: m, y: m, width: 100 - m * 2, height: 50 - m - g / 2, pageSide: 'span' },
        { x: m, y: 50 + g / 2, width: 100 - m * 2, height: 50 - m - g / 2, pageSide: 'span' }
      ]
    }
  ],

  // 3 PHOTOS
  3: [
    {
      id: '3-hero-left-two-right',
      name: 'Hero Left + 2 Stacked Right',
      description: 'Classic wedding story: main ceremony shot left, two detail shots right',
      photoCount: 3,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: 50 + g / 2, y: 50 + g / 2, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'right' }
      ]
    },
    {
      id: '3-hero-right-two-left',
      name: '2 Stacked Left + Hero Right',
      description: 'Building anticipation on left leading to climactic portrait on right',
      photoCount: 3,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: m, y: 50 + g / 2, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '3-triptych-vertical',
      name: 'Triptych 3 Vertical Columns',
      description: 'Three sleek vertical columns across the spread with equal rhythm',
      photoCount: 3,
      category: 'Clean',
      getFrames: (m, g) => {
        const colW = (100 - m * 2 - g * 2) / 3;
        return [
          { x: m, y: m, width: colW, height: 100 - m * 2, pageSide: 'left' },
          { x: m + colW + g, y: m, width: colW, height: 100 - m * 2, pageSide: 'span' },
          { x: m + (colW + g) * 2, y: m, width: colW, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    },
    {
      id: '3-hero-top-two-bottom',
      name: 'Cinematic Top Hero + 2 Bottom',
      description: 'Wide horizontal hero on top with two balanced photos below',
      photoCount: 3,
      category: 'Editorial',
      getFrames: (m, g) => [
        { x: m, y: m, width: 100 - m * 2, height: 58 - m - g / 2, pageSide: 'span' },
        { x: m, y: 58 + g / 2, width: 50 - m - g / 2, height: 42 - m - g / 2, pageSide: 'left' },
        { x: 50 + g / 2, y: 58 + g / 2, width: 50 - m - g / 2, height: 42 - m - g / 2, pageSide: 'right' }
      ]
    }
  ],

  // 4 PHOTOS
  4: [
    {
      id: '4-quad-2x2-balanced',
      name: 'Classic 2 × 2 Grid',
      description: 'Symmetrical four-photo grid evenly distributed across pages',
      photoCount: 4,
      category: 'Grid',
      getFrames: (m, g) => [
        { x: m, y: m, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: m, y: 50 + g / 2, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: 50 + g / 2, y: 50 + g / 2, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'right' }
      ]
    },
    {
      id: '4-hero-left-three-right',
      name: 'Hero Left + 3 Strip Right',
      description: 'Dominant left photo paired with 3 vertical sequence shots on right',
      photoCount: 4,
      category: 'Hero',
      getFrames: (m, g) => {
        const rightColW = (50 - m - g * 2.5) / 3;
        return [
          { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + rightColW + g, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + (rightColW + g) * 2, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    },
    {
      id: '4-hero-right-three-left',
      name: '3 Strip Left + Hero Right',
      description: '3 candid moments on left page resolving into bride/groom hero on right',
      photoCount: 4,
      category: 'Hero',
      getFrames: (m, g) => {
        const leftColW = (50 - m - g * 2.5) / 3;
        return [
          { x: m, y: m, width: leftColW, height: 100 - m * 2, pageSide: 'left' },
          { x: m + leftColW + g, y: m, width: leftColW, height: 100 - m * 2, pageSide: 'left' },
          { x: m + (leftColW + g) * 2, y: m, width: leftColW, height: 100 - m * 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    },
    {
      id: '4-four-columns',
      name: '4 Vertical Strip Storyline',
      description: 'Four vertical portraits side-by-side telling a continuous sequence',
      photoCount: 4,
      category: 'Editorial',
      getFrames: (m, g) => {
        const colW = (100 - m * 2 - g * 3) / 4;
        return [
          { x: m, y: m, width: colW, height: 100 - m * 2, pageSide: 'left' },
          { x: m + colW + g, y: m, width: colW, height: 100 - m * 2, pageSide: 'left' },
          { x: m + (colW + g) * 2, y: m, width: colW, height: 100 - m * 2, pageSide: 'right' },
          { x: m + (colW + g) * 3, y: m, width: colW, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    }
  ],

  // 5 PHOTOS
  5: [
    {
      id: '5-hero-left-four-right',
      name: 'Hero Left + 2×2 Grid Right',
      description: 'One key bride/groom portrait on left, four ceremony moments on right',
      photoCount: 5,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: 50 + g / 2 + (50 - m - g * 1.5) / 2 + g, y: m, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: 50 + g / 2, y: 50 + g / 2, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'right' },
        { x: 50 + g / 2 + (50 - m - g * 1.5) / 2 + g, y: 50 + g / 2, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'right' }
      ]
    },
    {
      id: '5-four-left-hero-right',
      name: '2×2 Grid Left + Hero Right',
      description: 'Four rituals leading into the centerpiece portrait on right',
      photoCount: 5,
      category: 'Hero',
      getFrames: (m, g) => [
        { x: m, y: m, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: m + (50 - m - g * 1.5) / 2 + g, y: m, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: m, y: 50 + g / 2, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: m + (50 - m - g * 1.5) / 2 + g, y: 50 + g / 2, width: (50 - m - g * 1.5) / 2, height: 50 - m - g / 2, pageSide: 'left' },
        { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'right' }
      ]
    },
    {
      id: '5-two-left-three-right',
      name: '2 Stacked Left + 3 Columns Right',
      description: 'Asymmetric editorial spread for Haldi or Sangeet dance shots',
      photoCount: 5,
      category: 'Editorial',
      getFrames: (m, g) => {
        const rightColW = (50 - m - g * 2.5) / 3;
        return [
          { x: m, y: m, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
          { x: m, y: 50 + g / 2, width: 50 - m - g / 2, height: 50 - m - g / 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + rightColW + g, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + (rightColW + g) * 2, y: m, width: rightColW, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    }
  ],

  // 6 PHOTOS
  6: [
    {
      id: '6-grid-3x2',
      name: 'Harmonious 3 × 2 Grid',
      description: 'Three photos per page evenly balanced in 2 rows',
      photoCount: 6,
      category: 'Grid',
      getFrames: (m, g) => {
        const colW = (50 - m - g * 1.5) / 2;
        const rowH = 50 - m - g / 2;
        return [
          // Left page: 1 hero top, 2 bottom
          { x: m, y: m, width: 50 - m - g / 2, height: rowH, pageSide: 'left' },
          { x: m, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'left' },
          { x: m + colW + g, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'left' },
          // Right page: 2 top, 1 hero bottom
          { x: 50 + g / 2, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + colW + g, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2, y: 50 + g / 2, width: 50 - m - g / 2, height: rowH, pageSide: 'right' }
        ];
      }
    },
    {
      id: '6-hero-left-five-mosaic',
      name: 'Hero Left + 5 Mosaic Right',
      description: 'One key portrait on left, five lively celebration cuts on right',
      photoCount: 6,
      category: 'Hero',
      getFrames: (m, g) => {
        const rightW = 50 - m - g / 2;
        const rHalfW = (rightW - g) / 2;
        const rThirdW = (rightW - g * 2) / 3;
        const rHalfH = 50 - m - g / 2;
        return [
          { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: rHalfW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2 + rHalfW + g, y: m, width: rHalfW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2, y: 50 + g / 2, width: rThirdW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2 + rThirdW + g, y: 50 + g / 2, width: rThirdW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2 + (rThirdW + g) * 2, y: 50 + g / 2, width: rThirdW, height: rHalfH, pageSide: 'right' }
        ];
      }
    },
    {
      id: '6-symmetrical-3-per-page',
      name: 'Symmetrical 3 + 3 (Diptychs & Columns)',
      description: 'Three structured images on left page and three on right page',
      photoCount: 6,
      category: 'Clean',
      getFrames: (m, g) => {
        const w1 = (50 - m - g * 2.5) / 3;
        return [
          { x: m, y: m, width: w1, height: 100 - m * 2, pageSide: 'left' },
          { x: m + w1 + g, y: m, width: w1, height: 100 - m * 2, pageSide: 'left' },
          { x: m + (w1 + g) * 2, y: m, width: w1, height: 100 - m * 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: w1, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + w1 + g, y: m, width: w1, height: 100 - m * 2, pageSide: 'right' },
          { x: 50 + g / 2 + (w1 + g) * 2, y: m, width: w1, height: 100 - m * 2, pageSide: 'right' }
        ];
      }
    }
  ],

  // 7 PHOTOS
  7: [
    {
      id: '7-hero-left-six-grid',
      name: 'Hero Left + 6 Grid Right (3×2)',
      description: 'Large portrait left paired with six detail & candid moments on right',
      photoCount: 7,
      category: 'Hero',
      getFrames: (m, g) => {
        const rightW = 50 - m - g / 2;
        const colW = (rightW - g * 2) / 3;
        const rowH = 50 - m - g / 2;
        return [
          { x: m, y: m, width: 50 - m - g / 2, height: 100 - m * 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + colW + g, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + (colW + g) * 2, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + colW + g, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + (colW + g) * 2, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'right' }
        ];
      }
    },
    {
      id: '7-three-left-four-right',
      name: '3 Left + 4 Grid Right',
      description: 'Dynamic family and friends portrait collection across spread',
      photoCount: 7,
      category: 'Editorial',
      getFrames: (m, g) => {
        const leftW = 50 - m - g / 2;
        const rightW = 50 - m - g / 2;
        const rHalfW = (rightW - g) / 2;
        const rHalfH = 50 - m - g / 2;
        return [
          { x: m, y: m, width: leftW, height: 50 - m - g / 2, pageSide: 'left' },
          { x: m, y: 50 + g / 2, width: (leftW - g) / 2, height: 50 - m - g / 2, pageSide: 'left' },
          { x: m + (leftW - g) / 2 + g, y: 50 + g / 2, width: (leftW - g) / 2, height: 50 - m - g / 2, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: rHalfW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2 + rHalfW + g, y: m, width: rHalfW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2, y: 50 + g / 2, width: rHalfW, height: rHalfH, pageSide: 'right' },
          { x: 50 + g / 2 + rHalfW + g, y: 50 + g / 2, width: rHalfW, height: rHalfH, pageSide: 'right' }
        ];
      }
    }
  ],

  // 8 PHOTOS
  8: [
    {
      id: '8-balanced-4x2-grid',
      name: 'Clean 4 × 2 Grid (4 Per Page)',
      description: 'Balanced symmetrical four-by-two layout perfect for event rituals',
      photoCount: 8,
      category: 'Grid',
      getFrames: (m, g) => {
        const colW = (50 - m - g * 1.5) / 2;
        const rowH = 50 - m - g / 2;
        return [
          // Left page
          { x: m, y: m, width: colW, height: rowH, pageSide: 'left' },
          { x: m + colW + g, y: m, width: colW, height: rowH, pageSide: 'left' },
          { x: m, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'left' },
          { x: m + colW + g, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'left' },
          // Right page
          { x: 50 + g / 2, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + colW + g, y: m, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'right' },
          { x: 50 + g / 2 + colW + g, y: 50 + g / 2, width: colW, height: rowH, pageSide: 'right' }
        ];
      }
    },
    {
      id: '8-two-hero-six-grid',
      name: '2 Heroes (Top) + 6 Mini-Grid (Bottom)',
      description: 'Two commanding portrait photos above with six supporting moments below',
      photoCount: 8,
      category: 'Hero',
      getFrames: (m, g) => {
        const topH = 58 - m - g / 2;
        const botH = 42 - m - g / 2;
        const colW = (100 - m * 2 - g * 5) / 6;
        return [
          { x: m, y: m, width: 50 - m - g / 2, height: topH, pageSide: 'left' },
          { x: 50 + g / 2, y: m, width: 50 - m - g / 2, height: topH, pageSide: 'right' },
          { x: m, y: 58 + g / 2, width: colW, height: botH, pageSide: 'left' },
          { x: m + (colW + g), y: 58 + g / 2, width: colW, height: botH, pageSide: 'left' },
          { x: m + (colW + g) * 2, y: 58 + g / 2, width: colW, height: botH, pageSide: 'left' },
          { x: 50 + g / 2, y: 58 + g / 2, width: colW, height: botH, pageSide: 'right' },
          { x: 50 + g / 2 + (colW + g), y: 58 + g / 2, width: colW, height: botH, pageSide: 'right' },
          { x: 50 + g / 2 + (colW + g) * 2, y: 58 + g / 2, width: colW, height: botH, pageSide: 'right' }
        ];
      }
    }
  ]
};

// Fallback generator for 9+ photos
export function generateGenericGrid(photoCount: number, m: number, g: number) {
  const leftCount = Math.ceil(photoCount / 2);
  const rightCount = photoCount - leftCount;

  const leftCols = leftCount <= 4 ? 2 : 3;
  const leftRows = Math.ceil(leftCount / leftCols);
  const rightCols = rightCount <= 4 ? 2 : 3;
  const rightRows = Math.ceil(rightCount / rightCols);

  const frames: Array<{ x: number; y: number; width: number; height: number; pageSide: 'left' | 'right' | 'span' }> = [];

  // Left page frames
  const leftW = 50 - m - g / 2;
  const leftColW = (leftW - g * (leftCols - 1)) / leftCols;
  const leftRowH = (100 - m * 2 - g * (leftRows - 1)) / leftRows;

  for (let i = 0; i < leftCount; i++) {
    const col = i % leftCols;
    const row = Math.floor(i / leftCols);
    frames.push({
      x: m + col * (leftColW + g),
      y: m + row * (leftRowH + g),
      width: leftColW,
      height: leftRowH,
      pageSide: 'left'
    });
  }

  // Right page frames
  const rightW = 50 - m - g / 2;
  const rightColW = (rightW - g * (rightCols - 1)) / rightCols;
  const rightRowH = (100 - m * 2 - g * (rightRows - 1)) / rightRows;

  for (let i = 0; i < rightCount; i++) {
    const col = i % rightCols;
    const row = Math.floor(i / rightCols);
    frames.push({
      x: 50 + g / 2 + col * (rightColW + g),
      y: m + row * (rightRowH + g),
      width: rightColW,
      height: rightRowH,
      pageSide: 'right'
    });
  }

  return frames;
}

/**
 * Get available templates for a given photo count
 */
export function getTemplatesForCount(count: number): LayoutTemplate[] {
  if (LAYOUT_TEMPLATES[count]) {
    return LAYOUT_TEMPLATES[count];
  }
  // Generic fallback template
  return [
    {
      id: `generic-${count}-grid`,
      name: `${count} Photo Dynamic Grid`,
      description: `Optimized multi-frame collage for ${count} images`,
      photoCount: count,
      category: 'Grid',
      getFrames: (m, g) => generateGenericGrid(count, m, g)
    }
  ];
}

/**
 * Apply a layout template to a spread, preserving existing photos and filters
 */
export function applyLayoutToSpread(
  spread: SpreadItem,
  template: LayoutTemplate,
  assignedPhotoIds?: string[]
): SpreadItem {
  // Spacing conversion: margin in px (e.g. 24px) -> approx percentage (e.g. 2.5%)
  const marginPct = (spread.margin / 1200) * 100;
  const gapPct = (spread.gap / 1200) * 100;

  const rawFrames = template.getFrames(marginPct, gapPct);

  // Collect photoIds from existing frames or passed photo IDs
  const photoIds: Array<string | null> = assignedPhotoIds
    ? [...assignedPhotoIds]
    : spread.frames.map(f => f.photoId).filter(Boolean);

  const newFrames: SpreadFrame[] = rawFrames.map((rf, idx) => {
    const existing = spread.frames[idx];
    const photoId = photoIds[idx] ?? (existing ? existing.photoId : null);

    return {
      id: existing ? existing.id : `frame-${Date.now()}-${idx}`,
      photoId: photoId,
      x: rf.x,
      y: rf.y,
      width: rf.width,
      height: rf.height,
      pageSide: rf.pageSide,
      crop: existing ? { ...existing.crop } : { zoom: 1.0, panX: 0, panY: 0 },
      filter: existing ? existing.filter : 'none',
      rotation: existing ? existing.rotation : 0,
      borderWidth: 0,
      borderRadius: 0
    };
  });

  // Check for center gutter warning
  const hasGutterWarning = newFrames.some(
    f => f.x < 50 && f.x + f.width > 50 && f.width < 90
  );

  return {
    ...spread,
    layoutId: template.id,
    frames: newFrames,
    hasGutterWarning
  };
}

/**
 * Cycle layout forward (direction = 1) or backward (direction = -1)
 */
export function cycleSpreadLayout(spread: SpreadItem, direction: 1 | -1): SpreadItem {
  const photoCount = Math.max(1, spread.frames.length);
  const templates = getTemplatesForCount(photoCount);

  if (templates.length <= 1) return spread;

  const currentIndex = templates.findIndex(t => t.id === spread.layoutId);
  let nextIndex = (currentIndex + direction) % templates.length;
  if (nextIndex < 0) nextIndex = templates.length - 1;

  const nextTemplate = templates[nextIndex];
  return applyLayoutToSpread(spread, nextTemplate);
}

/**
 * Flip spread horizontally (Mirror left & right pages)
 */
export function flipSpreadHorizontally(spread: SpreadItem): SpreadItem {
  const flippedFrames = spread.frames.map(frame => {
    // If it was on left (x: 2%, w: 45%), new x is 100 - (x + w) -> 100 - 47 = 53%
    const newX = +(100 - (frame.x + frame.width)).toFixed(2);
    let newSide: 'left' | 'right' | 'span' = frame.pageSide;
    if (frame.pageSide === 'left') newSide = 'right';
    else if (frame.pageSide === 'right') newSide = 'left';

    return {
      ...frame,
      x: newX,
      pageSide: newSide
    };
  });

  return {
    ...spread,
    frames: flippedFrames
  };
}

/**
 * Swap two frames within a spread
 */
export function swapFrames(spread: SpreadItem, frameAId: string, frameBId: string): SpreadItem {
  const frameA = spread.frames.find(f => f.id === frameAId);
  const frameB = spread.frames.find(f => f.id === frameBId);

  if (!frameA || !frameB) return spread;

  const newFrames = spread.frames.map(f => {
    if (f.id === frameAId) {
      return {
        ...f,
        photoId: frameB.photoId,
        crop: { ...frameB.crop },
        filter: frameB.filter,
        rotation: frameB.rotation
      };
    }
    if (f.id === frameBId) {
      return {
        ...f,
        photoId: frameA.photoId,
        crop: { ...frameA.crop },
        filter: frameA.filter,
        rotation: frameA.rotation
      };
    }
    return f;
  });

  return {
    ...spread,
    frames: newFrames
  };
}
