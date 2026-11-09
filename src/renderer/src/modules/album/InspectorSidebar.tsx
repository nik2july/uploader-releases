import React, { useState } from 'react';
import { 
  Sliders, 
  Palette, 
  Maximize, 
  ShieldCheck, 
  AlertTriangle, 
  MessageSquare, 
  Square, 
  CheckCircle, 
  Plus, 
  Image as ImageIcon, 
  Layers, 
  Trash2, 
  RefreshCw,
  Printer,
  BookOpen
} from 'lucide-react';
import { SpreadItem, SpreadFrame, PhotoItem, PhotoFilter, AlbumProject, SheetType } from './album';

interface InspectorSidebarProps {
  spread: SpreadItem;
  project: AlbumProject;
  selectedFrame: SpreadFrame | null;
  selectedPhoto: PhotoItem | null;
  onUpdateSpread: (updated: Partial<SpreadItem>) => void;
  onUpdateFrame: (frameId: string, updated: Partial<SpreadFrame>) => void;
  onAddComment: (text: string) => void;
  onToggleCommentResolved: (commentId: string) => void;
  onSetBlurredBackground: (photoUrl: string) => void;
}

export const InspectorSidebar: React.FC<InspectorSidebarProps> = ({
  spread,
  project,
  selectedFrame,
  selectedPhoto,
  onUpdateSpread,
  onUpdateFrame,
  onAddComment,
  onToggleCommentResolved,
  onSetBlurredBackground
}) => {
  const [commentText, setCommentText] = useState('');

  const bgConfig = spread.backgroundConfig;
  const hasImageBg = bgConfig?.type === 'image' && !!bgConfig.imageUrl;

  const isHalfSheet = spread.sheetType === 'front_cover' || 
                      spread.sheetType === 'back_cover' || 
                      spread.sheetType === 'first_half' || 
                      spread.sheetType === 'last_half';

  const widthInches = isHalfSheet ? project.sizePreset.singlePageWidth : project.sizePreset.spreadWidth;
  const heightInches = project.sizePreset.spreadHeight;
  const dpi = project.targetDpi || 300;
  const pixelW = Math.round(widthInches * dpi);
  const pixelH = Math.round(heightInches * dpi);

  return (
    <aside className="w-76 bg-[#ffffff] border-l border-[#e8dfd8] flex flex-col z-20 select-none overflow-y-auto shadow-[-1px_0_4px_rgba(17,20,23,0.02)]">
      {/* Inspector Header */}
      <div className="h-12 px-4 border-b border-[#e8dfd8] flex items-center justify-between bg-[#fdfcfb]">
        <div className="flex items-center space-x-1.5 text-xs text-[#111417] font-semibold">
          <Sliders className="w-3.5 h-3.5 text-[#7a2e33]" />
          <span>Sheet Inspector</span>
        </div>
        <span className="text-[10px] bg-[#f2ede4] text-[#7a2e33] px-2 py-0.5 rounded font-mono font-medium border border-[#d4c1a3]">
          {spread.name}
        </span>
      </div>

      <div className="p-4 space-y-5 text-xs">
        
        {/* Section 1: Sheet Architecture & Dimensions */}
        <div className="space-y-3">
          <span className="text-[11px] font-semibold tracking-wider text-[#111417] uppercase flex items-center space-x-1.5">
            <BookOpen className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span>Sheet Format & Print Size</span>
          </span>

          {/* Sheet Type Selector */}
          <div className="space-y-1">
            <label className="text-[11px] text-[#6b6660]">Sheet Structure:</label>
            <select
              value={spread.sheetType || 'full_spread'}
              onChange={(e) => onUpdateSpread({ sheetType: e.target.value as SheetType })}
              className="w-full px-2.5 py-1.5 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] font-medium"
            >
              <option value="full_spread">Full Spread (2 Pages Flat)</option>
              <option value="front_cover">Front Cover (Half Sheet — Right)</option>
              <option value="back_cover">Back Cover (Half Sheet — Left)</option>
              <option value="first_half">First Half — Page 1 (Right)</option>
              <option value="last_half">Last Half — Final Page (Left)</option>
            </select>
          </div>

          {/* Dimensions & DPI Indicator Box */}
          <div className="p-2.5 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3] text-[11px] space-y-1">
            <div className="flex items-center justify-between text-[#111417] font-medium">
              <span>Dimensions:</span>
              <span className="font-mono text-[#7a2e33]">{widthInches}" × {heightInches}"</span>
            </div>
            <div className="flex items-center justify-between text-[#6b6660]">
              <span>Resolution:</span>
              <span className="font-mono">{dpi} DPI</span>
            </div>
            <div className="flex items-center justify-between text-[#6b6660] font-mono text-[10px] pt-1 border-t border-[#e8dfd8]">
              <span>Print Pixels:</span>
              <span className="font-semibold text-[#111417]">{pixelW} × {pixelH} px</span>
            </div>
          </div>
        </div>

        <div className="h-px bg-[#f2ede4]" />

        {/* Section 2: Spacing & Margins */}
        <div className="space-y-3">
          <span className="text-[11px] font-semibold tracking-wider text-[#111417] uppercase flex items-center space-x-1.5">
            <Maximize className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span>Spacing & Margins</span>
          </span>

          {/* Photo Gap Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#111417]">
              <span>Photo Gap:</span>
              <span className="font-mono text-[#6b6660]">{spread.gap} px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              step="2"
              value={spread.gap}
              onChange={(e) => onUpdateSpread({ gap: parseInt(e.target.value) })}
              className="w-full accent-[#7a2e33] cursor-pointer"
            />
          </div>

          {/* Spread Outer Margin Slider */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-[#111417]">
              <span>Sheet Margin:</span>
              <span className="font-mono text-[#6b6660]">{spread.margin} px</span>
            </div>
            <input
              type="range"
              min="0"
              max="60"
              step="4"
              value={spread.margin}
              onChange={(e) => onUpdateSpread({ margin: parseInt(e.target.value) })}
              className="w-full accent-[#7a2e33] cursor-pointer"
            />
          </div>
        </div>

        <div className="h-px bg-[#f2ede4]" />

        {/* Section 3: Spread Background (Solid or Blurred Image) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold tracking-wider text-[#111417] uppercase flex items-center space-x-1.5">
              <Palette className="w-3.5 h-3.5 text-[#7a2e33]" />
              <span>Background & Tone</span>
            </span>
            {hasImageBg && (
              <span className="text-[9px] bg-[#fbf4f4] text-[#7a2e33] px-2 py-0.5 rounded-full font-medium border border-[#d4c1a3]">
                Blurred Image
              </span>
            )}
          </div>

          {/* If Blurred Image is Active: Full Blur & Overlay Controls */}
          {hasImageBg && bgConfig ? (
            <div className="bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <div className="w-10 h-7 rounded overflow-hidden border border-[#d4c1a3] bg-black flex-shrink-0">
                    <img src={bgConfig.imageUrl} alt="" className="w-full h-full object-cover" />
                  </div>
                  <span className="text-[11px] text-[#111417] font-medium">Image Backdrop</span>
                </div>

                <button
                  onClick={() => onUpdateSpread({
                    backgroundConfig: { type: 'color', color: spread.backgroundColor || '#FFFFFF' }
                  })}
                  className="p-1 text-red-600 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
                  title="Remove Blurred Background"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Blur Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#111417]">
                  <span>Gaussian Blur:</span>
                  <span className="font-mono text-[#7a2e33] font-semibold">{bgConfig.blur ?? 24} px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="60"
                  step="2"
                  value={bgConfig.blur ?? 24}
                  onChange={(e) => onUpdateSpread({
                    backgroundConfig: { ...bgConfig, blur: parseInt(e.target.value) }
                  })}
                  className="w-full accent-[#7a2e33] cursor-pointer"
                />
              </div>

              {/* Overlay Tint Opacity Slider */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-[#111417]">
                  <span>Overlay Tint:</span>
                  <span className="font-mono text-[#6b6660]">{Math.round((bgConfig.overlayOpacity ?? 0.4) * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="0.85"
                  step="0.05"
                  value={bgConfig.overlayOpacity ?? 0.4}
                  onChange={(e) => onUpdateSpread({
                    backgroundConfig: { ...bgConfig, overlayOpacity: parseFloat(e.target.value) }
                  })}
                  className="w-full accent-[#7a2e33] cursor-pointer"
                />
              </div>

              {/* Tint Color Selector */}
              <div className="flex items-center justify-between pt-1 text-[10px] text-[#6b6660]">
                <span>Tint Tone:</span>
                <div className="flex items-center space-x-1.5">
                  <button
                    onClick={() => onUpdateSpread({
                      backgroundConfig: { ...bgConfig, overlayColor: '#000000' }
                    })}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      bgConfig.overlayColor === '#000000' || !bgConfig.overlayColor
                        ? 'bg-[#111417] text-white font-medium'
                        : 'text-[#6b6660] hover:text-[#111417]'
                    }`}
                  >
                    Dark
                  </button>
                  <button
                    onClick={() => onUpdateSpread({
                      backgroundConfig: { ...bgConfig, overlayColor: '#FFFFFF' }
                    })}
                    className={`px-2 py-0.5 rounded text-[10px] ${
                      bgConfig.overlayColor === '#FFFFFF'
                        ? 'bg-[#7a2e33] text-white font-medium'
                        : 'text-[#6b6660] hover:text-[#111417]'
                    }`}
                  >
                    Light
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Solid Colors Palette */
            <div className="grid grid-cols-4 gap-2 pt-1">
              {[
                { color: '#FFFFFF', name: 'White' },
                { color: '#FAF8F6', name: 'Ivory' },
                { color: '#F2EDE4', name: 'Sand' },
                { color: '#111417', name: 'Noir' }
              ].map(bg => (
                <button
                  key={bg.color}
                  onClick={() => onUpdateSpread({ 
                    backgroundColor: bg.color,
                    backgroundConfig: { type: 'color', color: bg.color }
                  })}
                  className={`flex flex-col items-center p-1.5 rounded-xl border transition-all ${
                    spread.backgroundColor === bg.color && !hasImageBg
                      ? 'border-[#7a2e33] ring-1 ring-[#7a2e33] bg-[#fbf4f4]'
                      : 'border-[#e8dfd8] hover:border-[#d4c1a3] bg-[#fdfcfb]'
                  }`}
                >
                  <div
                    style={{ backgroundColor: bg.color }}
                    className="w-6 h-6 rounded-md border border-[#d4c1a3] shadow-xs mb-1"
                  />
                  <span className="text-[10px] text-[#6b6660]">{bg.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="h-px bg-[#f2ede4]" />

        {/* Section 4: Selected Frame Settings */}
        {selectedFrame ? (
          <div className="space-y-3 bg-[#fdfcfb] p-3.5 rounded-xl border border-[#d4c1a3]">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold tracking-wider text-[#7a2e33] uppercase flex items-center space-x-1">
                <Square className="w-3 h-3" />
                <span>Selected Photo Frame</span>
              </span>
            </div>

            {selectedPhoto ? (
              <div className="space-y-2.5">
                <div className="text-[11px] text-[#111417] truncate font-medium">
                  {selectedPhoto.fileName}
                </div>
                <div className="flex items-center space-x-2 text-[10px] text-[#6b6660] font-mono">
                  <span>{selectedPhoto.width} × {selectedPhoto.height} px</span>
                  <span>•</span>
                  <span>{selectedPhoto.rating} ★</span>
                </div>

                {/* 1-Click: Set this photo as blurred spread background */}
                <button
                  onClick={() => onSetBlurredBackground(selectedPhoto.url)}
                  className="w-full flex items-center justify-center space-x-1.5 bg-[#ffffff] hover:bg-[#fbf4f4] text-[#7a2e33] py-1.5 px-2 rounded-lg border border-[#d4c1a3] font-medium text-[11px] transition-colors shadow-2xs"
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Duplicate to Background (Blurred)</span>
                </button>

                {/* Filter Selector */}
                <div className="space-y-1">
                  <span className="text-[#6b6660] text-[10px]">Color Tone / Filter:</span>
                  <div className="grid grid-cols-3 gap-1">
                    {(['none', 'bw', 'sepia', 'warm', 'cool'] as PhotoFilter[]).map((f) => (
                      <button
                        key={f}
                        onClick={() => onUpdateFrame(selectedFrame.id, { filter: f })}
                        className={`px-2 py-1 rounded-md text-[10px] capitalize transition-colors ${
                          selectedFrame.filter === f
                            ? 'bg-[#7a2e33] text-white font-medium'
                            : 'bg-[#ffffff] text-[#111417] border border-[#e8dfd8] hover:bg-[#f2ede4]'
                        }`}
                      >
                        {f === 'none' ? 'Original' : f}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Corner Radius */}
                <div className="space-y-1 pt-1">
                  <div className="flex items-center justify-between text-[#111417] text-[10px]">
                    <span>Corner Radius:</span>
                    <span className="font-mono text-[#6b6660]">{selectedFrame.borderRadius || 0} px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="24"
                    value={selectedFrame.borderRadius || 0}
                    onChange={(e) => onUpdateFrame(selectedFrame.id, { borderRadius: parseInt(e.target.value) })}
                    className="w-full accent-[#7a2e33] cursor-pointer"
                  />
                </div>
              </div>
            ) : (
              <div className="py-4 text-center text-[#8c867e] text-xs">
                <span>Drag a photo from below into this frame</span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-[#f9f8f6] border border-[#e8dfd8] text-center text-[#8c867e] text-[11px]">
            Click on any photo frame on the canvas to inspect its zoom, filters, and crop.
          </div>
        )}

        <div className="h-px bg-[#f2ede4]" />

        {/* Section 5: Studio Comments */}
        <div className="space-y-2.5">
          <span className="text-[11px] font-semibold tracking-wider text-[#111417] uppercase flex items-center space-x-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span>Studio Notes ({spread.comments.length})</span>
          </span>

          <div className="space-y-2 max-h-36 overflow-y-auto">
            {spread.comments.map((comment) => (
              <div
                key={comment.id}
                onClick={() => onToggleCommentResolved(comment.id)}
                className={`p-2 rounded-lg border text-[11px] cursor-pointer transition-all ${
                  comment.resolved
                    ? 'border-[#e8dfd8] bg-[#f9f8f6] opacity-60'
                    : 'border-[#d4c1a3] bg-[#ffffff] shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between text-[10px] text-[#6b6660] mb-1">
                  <span className="font-medium text-[#7a2e33]">{comment.author}</span>
                  <span>{comment.createdAt}</span>
                </div>
                <p className={`text-[#111417] ${comment.resolved ? 'line-through text-[#8c867e]' : ''}`}>
                  {comment.text}
                </p>
              </div>
            ))}
          </div>

          <div className="flex space-x-1.5">
            <input
              type="text"
              placeholder="Add note..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && commentText.trim()) {
                  onAddComment(commentText.trim());
                  setCommentText('');
                }
              }}
              className="flex-1 px-2.5 py-1.5 bg-[#fdfcfb] border border-[#e8dfd8] rounded-xl text-xs text-[#111417] placeholder-[#8c867e] focus:outline-none focus:border-[#7a2e33]"
            />
            <button
              onClick={() => {
                if (commentText.trim()) {
                  onAddComment(commentText.trim());
                  setCommentText('');
                }
              }}
              className="p-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>

      </div>
    </aside>
  );
};
