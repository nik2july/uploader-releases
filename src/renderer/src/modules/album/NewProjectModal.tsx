import React, { useState } from 'react';
import { 
  X, 
  BookOpen, 
  Calendar, 
  User, 
  Sparkles, 
  Check, 
  Layers,
  Printer,
  Sliders,
  Info,
  Maximize2
} from 'lucide-react';
import { AlbumSizePreset, AlbumProject, SpreadItem, AlbumBindingStyle } from './album';
import { LAB_PRESETS } from './engine/labPresets';
import { SAMPLE_PHOTOS } from './engine/sampleData';
import { getTemplatesForCount, applyLayoutToSpread } from './engine/smartLayoutEngine';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateProject: (project: AlbumProject) => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({
  isOpen,
  onClose,
  onCreateProject
}) => {
  const [title, setTitle] = useState('Royal Heritage Wedding Album');
  const [clientNames, setClientNames] = useState('Dev & Ananya Singhania');
  const [eventType, setEventType] = useState('Grand Wedding');
  const [eventDate, setEventDate] = useState('December 2026');
  
  // Size selection
  const [selectedPresetId, setSelectedPresetId] = useState(LAB_PRESETS[0].id);
  
  // DPI selection (user requested explicitly)
  const [targetDpi, setTargetDpi] = useState<number>(300);
  const [customDpi, setCustomDpi] = useState<string>('300');
  const [isCustomDpi, setIsCustomDpi] = useState(false);

  // Album Page Structure: Start from full spread or first half & last half
  const [bindingStyle, setBindingStyle] = useState<AlbumBindingStyle>('traditional_halves');
  
  // Front and Back covers option (half sheet each)
  const [includeCovers, setIncludeCovers] = useState<boolean>(true);

  // Load sample photos
  const [loadSamples, setLoadSamples] = useState(true);

  if (!isOpen) return null;

  const preset = LAB_PRESETS.find(p => p.id === selectedPresetId) || LAB_PRESETS[0];
  const effectiveDpi = isCustomDpi ? (parseInt(customDpi) || 300) : targetDpi;

  // Calculate exact pixel dimensions based on chosen size & DPI
  const fullSpreadPixelW = Math.round(preset.spreadWidth * effectiveDpi);
  const fullSpreadPixelH = Math.round(preset.spreadHeight * effectiveDpi);
  const halfSheetPixelW = Math.round(preset.singlePageWidth * effectiveDpi);
  const halfSheetPixelH = Math.round(preset.spreadHeight * effectiveDpi);

  const handleCreate = () => {
    const photos = loadSamples ? SAMPLE_PHOTOS : [];
    const spreads: SpreadItem[] = [];
    let currentIndex = 0;

    // 1. Add Front Cover if requested (Half Sheet)
    if (includeCovers) {
      spreads.push({
        id: `cover-front-${Date.now()}`,
        spreadIndex: currentIndex++,
        name: 'Front Cover (Half Sheet)',
        layoutId: '1-full-bleed',
        sheetType: 'front_cover',
        frames: [
          {
            id: `frame-fc-${Date.now()}`,
            photoId: loadSamples ? 'p-9' : null,
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
            id: `tb-fc-${Date.now()}`,
            text: clientNames.toUpperCase(),
            fontFamily: 'The Seasons',
            fontSize: 28,
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
            id: `tb-fc-sub-${Date.now()}`,
            text: eventType.toUpperCase(),
            fontFamily: 'Tenor Sans',
            fontSize: 14,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#D4C1A3',
            alignment: 'center',
            letterSpacing: 0.2,
            x: 10,
            y: 84,
            width: 80
          }
        ],
        comments: [],
        backgroundColor: '#111417',
        gap: 12,
        margin: 24,
        status: 'draft'
      });
    }

    // 2. Inside Pages based on chosen Binding Style
    if (bindingStyle === 'traditional_halves') {
      // Starts with First Half (Page 1 - Right side)
      spreads.push({
        id: `first-half-${Date.now()}`,
        spreadIndex: currentIndex++,
        name: 'Page 01 (First Half)',
        layoutId: '1-centered-hero',
        sheetType: 'first_half',
        frames: [
          {
            id: `frame-fh-${Date.now()}`,
            photoId: loadSamples ? 'p-1' : null,
            x: 10,
            y: 10,
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
            id: `tb-fh-${Date.now()}`,
            text: 'CELEBRATING LOVE & TOGETHERNESS',
            fontFamily: 'Tenor Sans',
            fontSize: 14,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#7A2E33',
            alignment: 'center',
            letterSpacing: 0.2,
            x: 10,
            y: 86,
            width: 80
          }
        ],
        comments: [],
        backgroundColor: '#FAF8F6',
        gap: 12,
        margin: 24,
        status: 'draft'
      });

      // Spread 01 (Pages 2-3) Full Spread
      const spread1 = applyLayoutToSpread(
        {
          id: `spread-1-${Date.now()}`,
          spreadIndex: currentIndex++,
          name: 'Spread 01 (Pages 2-3)',
          layoutId: '2-split-equal',
          sheetType: 'full_spread',
          frames: [],
          textBlocks: [],
          comments: [],
          backgroundColor: '#FAF8F6',
          gap: 16,
          margin: 32,
          status: 'draft'
        },
        getTemplatesForCount(2)[0],
        loadSamples ? ['p-1', 'p-2'] : []
      );
      spreads.push(spread1);

      // Spread 02 (Pages 4-5) Full Spread
      const spread2 = applyLayoutToSpread(
        {
          id: `spread-2-${Date.now()}`,
          spreadIndex: currentIndex++,
          name: 'Spread 02 (Pages 4-5)',
          layoutId: '3-hero-left-two-right',
          sheetType: 'full_spread',
          frames: [],
          textBlocks: [],
          comments: [],
          backgroundColor: '#FFFFFF',
          gap: 14,
          margin: 28,
          status: 'draft'
        },
        getTemplatesForCount(3)[0],
        loadSamples ? ['p-3', 'p-4', 'p-5'] : []
      );
      spreads.push(spread2);

      // Final Inside Page: Last Half (Single page on Left)
      spreads.push({
        id: `last-half-${Date.now()}`,
        spreadIndex: currentIndex++,
        name: 'Final Page (Last Half)',
        layoutId: '1-centered-hero',
        sheetType: 'last_half',
        frames: [
          {
            id: `frame-lh-${Date.now()}`,
            photoId: loadSamples ? 'p-5' : null,
            x: 10,
            y: 10,
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
            id: `tb-lh-${Date.now()}`,
            text: 'FOREVER & ALWAYS',
            fontFamily: 'The Seasons',
            fontSize: 16,
            fontWeight: '700',
            fontStyle: 'normal',
            color: '#7A2E33',
            alignment: 'center',
            letterSpacing: 0.25,
            x: 10,
            y: 86,
            width: 80
          }
        ],
        comments: [],
        backgroundColor: '#FAF8F6',
        gap: 12,
        margin: 24,
        status: 'draft'
      });
    } else {
      // Starts directly from a Full Spread (Modern Layflat)
      const spread1 = applyLayoutToSpread(
        {
          id: `spread-1-${Date.now()}`,
          spreadIndex: currentIndex++,
          name: 'Spread 01 (Pages 1-2)',
          layoutId: '1-full-bleed',
          sheetType: 'full_spread',
          frames: [],
          textBlocks: [
            {
              id: `tb-s1-${Date.now()}`,
              text: clientNames.toUpperCase(),
              fontFamily: 'The Seasons',
              fontSize: 28,
              fontWeight: '700',
              fontStyle: 'normal',
              color: '#FFFFFF',
              alignment: 'center',
              letterSpacing: 0.25,
              x: 10,
              y: 80,
              width: 80
            }
          ],
          comments: [],
          backgroundColor: '#111417',
          gap: 12,
          margin: 24,
          status: 'draft'
        },
        getTemplatesForCount(1)[0],
        loadSamples ? ['p-9'] : []
      );

      const spread2 = applyLayoutToSpread(
        {
          id: `spread-2-${Date.now()}`,
          spreadIndex: currentIndex++,
          name: 'Spread 02 (Pages 3-4)',
          layoutId: '2-split-equal',
          sheetType: 'full_spread',
          frames: [],
          textBlocks: [],
          comments: [],
          backgroundColor: '#FAF8F6',
          gap: 16,
          margin: 32,
          status: 'draft'
        },
        getTemplatesForCount(2)[0],
        loadSamples ? ['p-1', 'p-2'] : []
      );

      const spread3 = applyLayoutToSpread(
        {
          id: `spread-3-${Date.now()}`,
          spreadIndex: currentIndex++,
          name: 'Spread 03 (Pages 5-6)',
          layoutId: '3-hero-left-two-right',
          sheetType: 'full_spread',
          frames: [],
          textBlocks: [],
          comments: [],
          backgroundColor: '#FFFFFF',
          gap: 14,
          margin: 28,
          status: 'draft'
        },
        getTemplatesForCount(3)[0],
        loadSamples ? ['p-3', 'p-4', 'p-5'] : []
      );

      spreads.push(spread1, spread2, spread3);
    }

    // 3. Add Back Cover if requested (Half Sheet)
    if (includeCovers) {
      spreads.push({
        id: `cover-back-${Date.now()}`,
        spreadIndex: currentIndex++,
        name: 'Back Cover (Half Sheet)',
        layoutId: '1-centered-hero',
        sheetType: 'back_cover',
        frames: [],
        textBlocks: [
          {
            id: `tb-bc-logo-${Date.now()}`,
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
            id: `tb-bc-sub-${Date.now()}`,
            text: 'BESPOKE FINE ART WEDDING ALBUM',
            fontFamily: 'Tenor Sans',
            fontSize: 10,
            fontWeight: '400',
            fontStyle: 'normal',
            color: '#8C867E',
            alignment: 'center',
            letterSpacing: 0.25,
            x: 10,
            y: 53,
            width: 80
          }
        ],
        comments: [],
        backgroundColor: '#111417',
        gap: 12,
        margin: 24,
        status: 'draft'
      });
    }

    const newProject: AlbumProject = {
      id: `proj-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      title,
      clientNames,
      eventType,
      eventDate,
      sizePreset: preset,
      targetDpi: effectiveDpi,
      bindingStyle,
      hasFrontCover: includeCovers,
      hasBackCover: includeCovers,
      photos,
      spreads,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    onCreateProject(newProject);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#111417]/60 backdrop-blur-sm p-4 overflow-y-auto">
      <div className="bg-[#ffffff] border border-[#d4c1a3] rounded-2xl w-full max-w-4xl shadow-[0_25px_70px_rgba(17,20,23,0.18)] overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in duration-200">
        
        {/* Header */}
        <div className="px-8 pt-6 pb-5 border-b border-[#e8dfd8] bg-[#fdfcfb] flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-xl bg-[#7a2e33] p-0.5 shadow-md flex items-center justify-center">
              <div className="w-full h-full border border-[#d4c1a3]/40 rounded-[9px] flex items-center justify-center bg-[#7a2e33]">
                <BookOpen className="w-5 h-5 text-[#d4c1a3]" />
              </div>
            </div>
            <div>
              <h2 className="font-serif text-xl font-semibold text-[#111417]">
                New Album Project <span className="text-[#7a2e33] font-normal italic">Setup</span>
              </h2>
              <p className="text-xs text-[#6b6660]">
                Configure album dimensions, print DPI, and sheet binding architecture.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#6b6660] hover:text-[#111417] p-2 rounded-full hover:bg-[#f2ede4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-8 space-y-7 overflow-y-auto flex-1 bg-[#ffffff]">
          
          {/* Section 1: Project & Client Details */}
          <div>
            <h3 className="font-serif text-sm font-semibold text-[#111417] uppercase tracking-wider mb-3 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7a2e33]" />
              <span>1. Album & Client Metadata</span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-[#111417] mb-1">
                  Album Project Title
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Royal Heritage Wedding Album"
                  className="w-full px-3.5 py-2 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111417] mb-1">
                  Client / Couple Names
                </label>
                <input
                  type="text"
                  value={clientNames}
                  onChange={(e) => setClientNames(e.target.value)}
                  placeholder="e.g. Dev & Ananya Singhania"
                  className="w-full px-3.5 py-2 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111417] mb-1">
                  Event Type
                </label>
                <input
                  type="text"
                  value={eventType}
                  onChange={(e) => setEventType(e.target.value)}
                  placeholder="e.g. Grand Wedding / Pre-Wedding"
                  className="w-full px-3.5 py-2 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#111417] mb-1">
                  Event Date
                </label>
                <input
                  type="text"
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  placeholder="e.g. December 2026"
                  className="w-full px-3.5 py-2 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                />
              </div>
            </div>
          </div>

          {/* Section 2: Album Sheet Size (All sheets will have the same size) */}
          <div className="pt-4 border-t border-[#f2ede4]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-sm font-semibold text-[#111417] uppercase tracking-wider flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7a2e33]" />
                <span>2. Album Sheet Size</span>
              </h3>
              <span className="text-[11px] text-[#7a2e33] font-medium bg-[#f2ede4] px-2.5 py-0.5 rounded-full border border-[#d4c1a3]">
                Rule: All sheets throughout album will have this exact size
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {LAB_PRESETS.map((p) => {
                const isSelected = p.id === selectedPresetId;
                return (
                  <div
                    key={p.id}
                    onClick={() => setSelectedPresetId(p.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? 'border-[#7a2e33] bg-[#fbf4f4] ring-1 ring-[#7a2e33] shadow-sm'
                        : 'border-[#e8dfd8] bg-[#ffffff] hover:border-[#d4c1a3] hover:bg-[#fdfcfb]'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <span className="font-medium text-xs text-[#111417]">
                        {p.name}
                      </span>
                      {isSelected && (
                        <div className="w-4 h-4 rounded-full bg-[#7a2e33] text-white flex items-center justify-center flex-shrink-0 ml-1">
                          <Check className="w-2.5 h-2.5 stroke-[3]" />
                        </div>
                      )}
                    </div>
                    <div className="mt-1.5 flex items-center space-x-2 text-[11px] text-[#6b6660]">
                      <span className="font-mono bg-[#f2ede4] px-1.5 py-0.5 rounded text-[#111417]">
                        Spread: {p.spreadWidth}" × {p.spreadHeight}"
                      </span>
                      <span>•</span>
                      <span>Page: {p.singlePageWidth}" × {p.singlePageHeight}"</span>
                    </div>
                    <p className="mt-1.5 text-[10px] text-[#8c867e] line-clamp-2">
                      {p.description}
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 3: Required Print Resolution (DPI) */}
          <div className="pt-4 border-t border-[#f2ede4]">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-serif text-sm font-semibold text-[#111417] uppercase tracking-wider flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#7a2e33]" />
                <span>3. Required Print Resolution (DPI)</span>
              </h3>
              <span className="text-xs text-[#6b6660] font-sans">
                Controls export sharpness and exact physical pixel rendering
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { dpi: 300, label: '300 DPI', sub: 'Lab Standard (Recommended)', tag: 'Gold Standard' },
                { dpi: 250, label: '250 DPI', sub: 'Standard Indigo Press', tag: 'Fast' },
                { dpi: 200, label: '200 DPI', sub: 'Proofing & Online Client', tag: 'Lightweight' },
                { dpi: 600, label: '600 DPI', sub: 'Ultra Archival Museum Art', tag: 'Ultra HD' }
              ].map((item) => {
                const isSelected = !isCustomDpi && targetDpi === item.dpi;
                return (
                  <div
                    key={item.dpi}
                    onClick={() => {
                      setIsCustomDpi(false);
                      setTargetDpi(item.dpi);
                    }}
                    className={`p-3 rounded-xl border cursor-pointer text-center transition-all ${
                      isSelected
                        ? 'border-[#7a2e33] bg-[#fbf4f4] ring-1 ring-[#7a2e33] shadow-sm'
                        : 'border-[#e8dfd8] bg-[#ffffff] hover:border-[#d4c1a3]'
                    }`}
                  >
                    <div className="flex items-center justify-center space-x-1">
                      <span className="font-mono text-base font-semibold text-[#111417]">
                        {item.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#7a2e33] font-medium block mt-0.5">
                      {item.tag}
                    </span>
                    <span className="text-[10px] text-[#8c867e] block mt-1">
                      {item.sub}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Custom DPI option & Calculated Dimensions Box */}
            <div className="mt-4 p-4 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3] flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center space-x-3">
                <Printer className="w-5 h-5 text-[#7a2e33]" />
                <div>
                  <div className="text-xs font-medium text-[#111417] flex items-center space-x-2">
                    <span>Active Print Resolution:</span>
                    <span className="font-mono font-bold text-[#7a2e33]">{effectiveDpi} DPI</span>
                  </div>
                  <div className="text-[11px] text-[#6b6660] font-mono mt-0.5">
                    Full Sheet: <span className="text-[#111417] font-semibold">{fullSpreadPixelW} × {fullSpreadPixelH} px</span> ({((fullSpreadPixelW * fullSpreadPixelH)/1000000).toFixed(1)} MP)
                    <span className="mx-2">•</span>
                    Half Sheet: <span className="text-[#111417] font-semibold">{halfSheetPixelW} × {halfSheetPixelH} px</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-xs text-[#6b6660]">Custom DPI:</span>
                <input
                  type="number"
                  min="72"
                  max="1200"
                  value={customDpi}
                  onChange={(e) => {
                    setCustomDpi(e.target.value);
                    setIsCustomDpi(true);
                  }}
                  onFocus={() => setIsCustomDpi(true)}
                  className={`w-20 px-2 py-1 text-xs font-mono border rounded-lg focus:outline-none ${
                    isCustomDpi ? 'border-[#7a2e33] bg-white text-[#7a2e33] font-bold' : 'border-[#e8dfd8] bg-white'
                  }`}
                />
              </div>
            </div>
          </div>

          {/* Section 4: Album Page Structure & Covers (Halves vs Full Spread) */}
          <div className="pt-4 border-t border-[#f2ede4]">
            <h3 className="font-serif text-sm font-semibold text-[#111417] uppercase tracking-wider mb-2 flex items-center space-x-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#7a2e33]" />
              <span>4. Album Page Structure & Cover Setup</span>
            </h3>
            <p className="text-xs text-[#6b6660] mb-4">
              Decide whether inside pages start from a single first half page or open directly into a full panorama spread.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Option A: Start with First Half & End with Last Half */}
              <div
                onClick={() => setBindingStyle('traditional_halves')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  bindingStyle === 'traditional_halves'
                    ? 'border-[#7a2e33] bg-[#fbf4f4] ring-1 ring-[#7a2e33] shadow-sm'
                    : 'border-[#e8dfd8] bg-[#ffffff] hover:border-[#d4c1a3]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium text-xs text-[#111417] block">
                      Start from First Half & End with Last Half
                    </span>
                    <span className="text-[10px] text-[#7a2e33] font-medium block mt-0.5">
                      Traditional Fine Art Book Binding
                    </span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    bindingStyle === 'traditional_halves' ? 'border-[#7a2e33] bg-[#7a2e33]' : 'border-gray-400'
                  }`}>
                    {bindingStyle === 'traditional_halves' && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </div>

                {/* Visual miniature diagram */}
                <div className="mt-3 flex items-center space-x-1.5 text-[9px] font-mono text-[#6b6660]">
                  <div className="h-6 w-5 border border-[#7a2e33] bg-white rounded-sm flex items-center justify-center text-[#7a2e33] font-bold">
                    P1
                  </div>
                  <span>→</span>
                  <div className="h-6 w-10 border border-[#d4c1a3] bg-white rounded-sm flex items-center justify-center">
                    P2-3
                  </div>
                  <span>→</span>
                  <div className="h-6 w-10 border border-[#d4c1a3] bg-white rounded-sm flex items-center justify-center">
                    P4-5
                  </div>
                  <span>→</span>
                  <div className="h-6 w-5 border border-[#7a2e33] bg-white rounded-sm flex items-center justify-center text-[#7a2e33] font-bold">
                    End
                  </div>
                </div>

                <p className="mt-2.5 text-[11px] text-[#6b6660]">
                  Inside pages begin with a single right half-sheet (Page 1), continue with full spreads, and conclude with a single left half-sheet.
                </p>
              </div>

              {/* Option B: Start with Full Spread */}
              <div
                onClick={() => setBindingStyle('layflat_full')}
                className={`p-4 rounded-xl border cursor-pointer transition-all ${
                  bindingStyle === 'layflat_full'
                    ? 'border-[#7a2e33] bg-[#fbf4f4] ring-1 ring-[#7a2e33] shadow-sm'
                    : 'border-[#e8dfd8] bg-[#ffffff] hover:border-[#d4c1a3]'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div>
                    <span className="font-medium text-xs text-[#111417] block">
                      Start from Full Spread (Pages 1–2 Flat)
                    </span>
                    <span className="text-[10px] text-[#7a2e33] font-medium block mt-0.5">
                      Modern Seamless Layflat Spreads
                    </span>
                  </div>
                  <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${
                    bindingStyle === 'layflat_full' ? 'border-[#7a2e33] bg-[#7a2e33]' : 'border-gray-400'
                  }`}>
                    {bindingStyle === 'layflat_full' && <Check className="w-2.5 h-2.5 text-white" />}
                  </div>
                </div>

                {/* Visual miniature diagram */}
                <div className="mt-3 flex items-center space-x-1.5 text-[9px] font-mono text-[#6b6660]">
                  <div className="h-6 w-10 border border-[#7a2e33] bg-white rounded-sm flex items-center justify-center text-[#7a2e33] font-bold">
                    P1-2
                  </div>
                  <span>→</span>
                  <div className="h-6 w-10 border border-[#d4c1a3] bg-white rounded-sm flex items-center justify-center">
                    P3-4
                  </div>
                  <span>→</span>
                  <div className="h-6 w-10 border border-[#d4c1a3] bg-white rounded-sm flex items-center justify-center">
                    P5-6
                  </div>
                </div>

                <p className="mt-2.5 text-[11px] text-[#6b6660]">
                  The album opens directly into a full 2-page panorama spread (Pages 1–2 flat). All inside sheets are full spreads.
                </p>
              </div>
            </div>

            {/* Front & Back Cover Checkbox */}
            <div className="mt-4 p-4 rounded-xl bg-[#fdfcfb] border border-[#e8dfd8] flex items-center justify-between">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeCovers}
                  onChange={(e) => setIncludeCovers(e.target.checked)}
                  className="w-4 h-4 text-[#7a2e33] rounded border-[#d4c1a3] focus:ring-[#7a2e33]"
                />
                <div>
                  <span className="text-xs font-medium text-[#111417] block">
                    Include Front & Back Cover (Half Sheet each)
                  </span>
                  <span className="text-[11px] text-[#6b6660] block">
                    Adds Front Cover (right half-sheet: {preset.singlePageWidth}" × {preset.spreadHeight}") and Back Cover (left half-sheet).
                  </span>
                </div>
              </label>
              <span className="text-[10px] bg-[#f2ede4] text-[#7a2e33] font-mono font-medium px-2 py-0.5 rounded border border-[#d4c1a3]">
                Half Sheet Mode
              </span>
            </div>

            {/* Load starter sample photos checkbox */}
            <div className="mt-3 px-4 py-2.5 flex items-center justify-between">
              <label className="flex items-center space-x-2.5 cursor-pointer text-xs text-[#6b6660]">
                <input
                  type="checkbox"
                  checked={loadSamples}
                  onChange={(e) => setLoadSamples(e.target.checked)}
                  className="w-3.5 h-3.5 text-[#7a2e33] rounded border-[#d4c1a3]"
                />
                <span>Include curated wedding starter photos and sample spreads</span>
              </label>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-8 py-4 bg-[#fdfcfb] border-t border-[#e8dfd8] flex items-center justify-between">
          <div className="text-xs text-[#6b6660] font-mono">
            Sheet Spec: {preset.spreadWidth}" × {preset.spreadHeight}" @ {effectiveDpi} DPI
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-[#6b6660] hover:text-[#111417] hover:bg-[#f2ede4] rounded-xl transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              className="flex items-center space-x-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white px-5 py-2.5 rounded-xl text-xs font-semibold shadow-sm transition-all"
            >
              <Sparkles className="w-4 h-4 text-[#d4c1a3]" />
              <span>Create Album Project</span>
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
