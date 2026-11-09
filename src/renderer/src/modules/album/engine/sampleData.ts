import { AlbumProject, PhotoItem, SpreadItem } from '../album';
import { DEFAULT_PRESET } from './labPresets';
import { getTemplatesForCount, applyLayoutToSpread } from './smartLayoutEngine';

export const SAMPLE_PHOTOS: PhotoItem[] = [
  {
    id: 'p-1',
    fileName: 'Meera_Royal_Portrait_01.jpg',
    url: 'https://images.unsplash.com/photo-1583939003579-730e3918a45a?auto=format&fit=crop&w=1200&q=80',
    width: 2400,
    height: 3600,
    aspectRatio: 0.667,
    rating: 5,
    colorLabel: 'red',
    tags: ['Bride', 'Portrait', 'Jewelry'],
    usedCount: 1
  },
  {
    id: 'p-2',
    fileName: 'Aarav_Groom_Sherwani_02.jpg',
    url: 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80',
    width: 2400,
    height: 3600,
    aspectRatio: 0.667,
    rating: 5,
    colorLabel: 'green',
    tags: ['Groom', 'Portrait'],
    usedCount: 1
  },
  {
    id: 'p-3',
    fileName: 'Varmala_Palace_Wide_03.jpg',
    url: 'https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=1600&q=80',
    width: 4800,
    height: 3200,
    aspectRatio: 1.5,
    rating: 5,
    colorLabel: 'yellow',
    tags: ['Ceremony', 'Varmala', 'Palace'],
    usedCount: 1
  },
  {
    id: 'p-4',
    fileName: 'Pheras_Holy_Fire_04.jpg',
    url: 'https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=1200&q=80',
    width: 3600,
    height: 2400,
    aspectRatio: 1.5,
    rating: 4,
    colorLabel: 'yellow',
    tags: ['Rituals', 'Pheras', 'Fire'],
    usedCount: 1
  },
  {
    id: 'p-5',
    fileName: 'Sindoor_Emotional_05.jpg',
    url: 'https://images.unsplash.com/photo-1544077960-604201fe74bc?auto=format&fit=crop&w=1200&q=80',
    width: 2400,
    height: 3600,
    aspectRatio: 0.667,
    rating: 5,
    colorLabel: 'red',
    tags: ['Ritual', 'Emotional', 'Bride'],
    usedCount: 1
  },
  {
    id: 'p-6',
    fileName: 'Mehendi_Henna_Details_06.jpg',
    url: 'https://images.unsplash.com/photo-1610030469983-98e550d6193c?auto=format&fit=crop&w=1200&q=80',
    width: 3200,
    height: 2400,
    aspectRatio: 1.333,
    rating: 4,
    colorLabel: 'blue',
    tags: ['Mehendi', 'Henna', 'Hands'],
    usedCount: 1
  },
  {
    id: 'p-7',
    fileName: 'Haldi_Celebration_Splash_07.jpg',
    url: 'https://images.unsplash.com/photo-1532712938310-34cb3982ef74?auto=format&fit=crop&w=1200&q=80',
    width: 3600,
    height: 2400,
    aspectRatio: 1.5,
    rating: 5,
    colorLabel: 'yellow',
    tags: ['Haldi', 'Yellow', 'Joy'],
    usedCount: 1
  },
  {
    id: 'p-8',
    fileName: 'Sangeet_Night_Dance_08.jpg',
    url: 'https://images.unsplash.com/photo-1465495976277-4387d4b0b4c6?auto=format&fit=crop&w=1200&q=80',
    width: 3600,
    height: 2400,
    aspectRatio: 1.5,
    rating: 4,
    colorLabel: 'purple',
    tags: ['Sangeet', 'Dance', 'Stage'],
    usedCount: 1
  },
  {
    id: 'p-9',
    fileName: 'Couple_Sunset_Lake_Palace_09.jpg',
    url: 'https://images.unsplash.com/photo-1522673607200-164d1b6ce486?auto=format&fit=crop&w=1600&q=80',
    width: 4800,
    height: 3200,
    aspectRatio: 1.5,
    rating: 5,
    colorLabel: 'green',
    tags: ['Couple', 'Sunset', 'Palace'],
    usedCount: 1
  },
  {
    id: 'p-10',
    fileName: 'Ring_Exchange_CloseUp_10.jpg',
    url: 'https://images.unsplash.com/photo-1515934751635-c81c6bc9a2d8?auto=format&fit=crop&w=1200&q=80',
    width: 3000,
    height: 2000,
    aspectRatio: 1.5,
    rating: 4,
    colorLabel: 'blue',
    tags: ['Rings', 'Hands', 'Macro'],
    usedCount: 0
  },
  {
    id: 'p-11',
    fileName: 'Bride_Entry_Chadar_11.jpg',
    url: 'https://images.unsplash.com/photo-1583939411023-14783179e581?auto=format&fit=crop&w=1200&q=80',
    width: 2400,
    height: 3600,
    aspectRatio: 0.667,
    rating: 5,
    colorLabel: 'red',
    tags: ['Entry', 'Phoolon Ki Chadar'],
    usedCount: 0
  },
  {
    id: 'p-12',
    fileName: 'Family_Blessing_Royal_12.jpg',
    url: 'https://images.unsplash.com/photo-1529636798458-92182e662485?auto=format&fit=crop&w=1200&q=80',
    width: 3600,
    height: 2400,
    aspectRatio: 1.5,
    rating: 4,
    colorLabel: 'none',
    tags: ['Family', 'Blessings'],
    usedCount: 0
  }
];

export function createInitialSampleProject(): AlbumProject {
  // Sheet 0: Front Cover (Half Sheet)
  const frontCover: SpreadItem = {
    id: 'cover-front',
    spreadIndex: 0,
    name: 'Front Cover (Half Sheet)',
    layoutId: '1-full-bleed',
    sheetType: 'front_cover',
    frames: [
      {
        id: 'frame-front-cover',
        photoId: 'p-9',
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        crop: { zoom: 1, panX: 0, panY: 0 },
        filter: 'none',
        rotation: 0,
        pageSide: 'span'
      }
    ],
    textBlocks: [
      {
        id: 't-cover-title',
        text: 'AARAV & MEERA',
        fontFamily: 'The Seasons',
        fontSize: 32,
        fontWeight: '700',
        fontStyle: 'normal',
        color: '#FFFFFF',
        alignment: 'center',
        letterSpacing: 0.25,
        x: 10,
        y: 75,
        width: 80
      },
      {
        id: 't-cover-sub',
        text: 'The Oberoi Udaivilas • Udaipur',
        fontFamily: 'Tenor Sans',
        fontSize: 16,
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#D4C1A3',
        alignment: 'center',
        letterSpacing: 0.15,
        x: 10,
        y: 84,
        width: 80
      }
    ],
    comments: [],
    backgroundColor: '#111417',
    gap: 12,
    margin: 24,
    status: 'approved'
  };

  // Sheet 1: First Half (Page 1 - Right side)
  const firstHalf: SpreadItem = {
    id: 'first-half-p1',
    spreadIndex: 1,
    name: 'Page 01 (First Half)',
    layoutId: '1-centered-hero',
    sheetType: 'first_half',
    frames: [
      {
        id: 'frame-p1',
        photoId: 'p-1',
        x: 10,
        y: 8,
        width: 80,
        height: 72,
        crop: { zoom: 1, panX: 0, panY: 0 },
        filter: 'none',
        rotation: 0,
        pageSide: 'span'
      }
    ],
    textBlocks: [
      {
        id: 't-p1-title',
        text: 'THE BEGINNING OF FOREVER',
        fontFamily: 'Vidaloka',
        fontSize: 18,
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#7A2E33',
        alignment: 'center',
        letterSpacing: 0.2,
        x: 10,
        y: 84,
        width: 80
      }
    ],
    comments: [],
    backgroundColor: '#FAF8F6',
    gap: 12,
    margin: 24,
    status: 'approved'
  };

  // Sheet 2: Spread 01 (Pages 2-3) - Balanced 50/50 Portraits
  const spread2Draft: SpreadItem = {
    id: 'spread-2',
    spreadIndex: 2,
    name: 'Spread 01 (Pages 2-3)',
    layoutId: '2-split-equal',
    sheetType: 'full_spread',
    frames: [],
    textBlocks: [],
    comments: [
      {
        id: 'c-1',
        author: 'Client',
        text: 'We love these two portraits together! Perfect balance.',
        createdAt: 'Yesterday at 4:15 PM',
        resolved: false
      }
    ],
    backgroundColor: '#FAF8F6',
    gap: 16,
    margin: 32,
    status: 'needs_review'
  };
  const spread2 = applyLayoutToSpread(
    spread2Draft,
    getTemplatesForCount(2)[0],
    ['p-1', 'p-2']
  );

  // Sheet 3: Spread 02 (Pages 4-5) - Varmala Ceremony + Details
  const spread3Draft: SpreadItem = {
    id: 'spread-3',
    spreadIndex: 3,
    name: 'Spread 02 (Pages 4-5)',
    layoutId: '3-hero-left-two-right',
    sheetType: 'full_spread',
    frames: [],
    textBlocks: [
      {
        id: 't-3',
        text: 'THE SACRED VARMALA',
        fontFamily: 'The Seasons',
        fontSize: 16,
        fontWeight: '700',
        fontStyle: 'normal',
        color: '#7A2E33',
        alignment: 'left',
        letterSpacing: 0.2,
        x: 3,
        y: 3,
        width: 45
      }
    ],
    comments: [],
    backgroundColor: '#FFFFFF',
    gap: 14,
    margin: 24,
    status: 'draft'
  };
  const spread3 = applyLayoutToSpread(
    spread3Draft,
    getTemplatesForCount(3)[0],
    ['p-3', 'p-4', 'p-5']
  );

  // Sheet 4: Spread 03 (Pages 6-7) - Festivities & Dance
  const spread4Draft: SpreadItem = {
    id: 'spread-4',
    spreadIndex: 4,
    name: 'Spread 03 (Pages 6-7)',
    layoutId: '4-hero-left-three-right',
    sheetType: 'full_spread',
    frames: [],
    textBlocks: [],
    comments: [],
    backgroundColor: '#F7F4EF',
    gap: 10,
    margin: 20,
    status: 'draft'
  };
  const spread4 = applyLayoutToSpread(
    spread4Draft,
    getTemplatesForCount(4)[1] || getTemplatesForCount(4)[0],
    ['p-7', 'p-6', 'p-8', 'p-4']
  );

  // Sheet 5: Last Half (Final Page - Left side)
  const lastHalf: SpreadItem = {
    id: 'last-half-p8',
    spreadIndex: 5,
    name: 'Final Page (Last Half)',
    layoutId: '1-centered-hero',
    sheetType: 'last_half',
    frames: [
      {
        id: 'frame-last',
        photoId: 'p-5',
        x: 10,
        y: 10,
        width: 80,
        height: 70,
        crop: { zoom: 1, panX: 0, panY: 0 },
        filter: 'none',
        rotation: 0,
        pageSide: 'span'
      }
    ],
    textBlocks: [
      {
        id: 't-last-note',
        text: 'AND SO THE ADVENTURE CONTINUES',
        fontFamily: 'Tenor Sans',
        fontSize: 14,
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#7A2E33',
        alignment: 'center',
        letterSpacing: 0.25,
        x: 10,
        y: 85,
        width: 80
      }
    ],
    comments: [],
    backgroundColor: '#FAF8F6',
    gap: 12,
    margin: 24,
    status: 'approved'
  };

  // Sheet 6: Back Cover (Half Sheet)
  const backCover: SpreadItem = {
    id: 'cover-back',
    spreadIndex: 6,
    name: 'Back Cover (Half Sheet)',
    layoutId: '1-centered-hero',
    sheetType: 'back_cover',
    frames: [],
    textBlocks: [
      {
        id: 't-back-logo',
        text: 'BAVARE',
        fontFamily: 'The Seasons',
        fontSize: 22,
        fontWeight: '700',
        fontStyle: 'normal',
        color: '#D4C1A3',
        alignment: 'center',
        letterSpacing: 0.35,
        x: 20,
        y: 46,
        width: 60
      },
      {
        id: 't-back-sub',
        text: 'HANDCRAFTED FINE ART ALBUM',
        fontFamily: 'Tenor Sans',
        fontSize: 11,
        fontWeight: '400',
        fontStyle: 'normal',
        color: '#8C867E',
        alignment: 'center',
        letterSpacing: 0.3,
        x: 10,
        y: 53,
        width: 80
      }
    ],
    comments: [],
    backgroundColor: '#111417',
    gap: 12,
    margin: 24,
    status: 'approved'
  };

  return {
    id: 'bavari-proj-sample',
    title: 'Aarav & Meera Wedding Album',
    clientNames: 'Aarav & Meera Singhania',
    eventType: 'Royal Grand Wedding',
    eventDate: 'December 18, 2026',
    sizePreset: DEFAULT_PRESET,
    targetDpi: 300,
    bindingStyle: 'traditional_halves',
    hasFrontCover: true,
    hasBackCover: true,
    photos: SAMPLE_PHOTOS,
    spreads: [frontCover, firstHalf, spread2, spread3, spread4, lastHalf, backCover],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}
