import React, { useState } from 'react';
import { 
  Plus, 
  Copy, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  CheckCircle, 
  AlertCircle, 
  BookMarked,
  ChevronDown,
  Layers,
  Sparkles
} from 'lucide-react';
import { SpreadItem, PhotoItem, AlbumSizePreset, SheetType } from './album';

interface SpreadNavigatorProps {
  spreads: SpreadItem[];
  activeSpreadIndex: number;
  preset: AlbumSizePreset;
  photos: PhotoItem[];
  onSelectSpread: (index: number) => void;
  onAddSpread: (type?: SheetType) => void;
  onDuplicateSpread: (index: number) => void;
  onDeleteSpread: (index: number) => void;
  onMoveSpread: (fromIndex: number, toIndex: number) => void;
}

export const SpreadNavigator: React.FC<SpreadNavigatorProps> = ({
  spreads,
  activeSpreadIndex,
  preset,
  photos,
  onSelectSpread,
  onAddSpread,
  onDuplicateSpread,
  onDeleteSpread,
  onMoveSpread
}) => {
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);

  const photoMap = new Map<string, PhotoItem>();
  photos.forEach(p => photoMap.set(p.id, p));

  const fullSpreadAspect = preset.spreadWidth / preset.spreadHeight;
  const halfSheetAspect = preset.singlePageWidth / preset.spreadHeight;

  return (
    <aside className="w-64 bg-[#ffffff] border-r border-[#e8dfd8] flex flex-col z-20 select-none shadow-[1px_0_4px_rgba(17,20,23,0.02)]">
      {/* Navigator Header */}
      <div className="h-12 px-3.5 border-b border-[#e8dfd8] flex items-center justify-between bg-[#fdfcfb]">
        <div className="flex items-center space-x-1.5 text-xs text-[#111417] font-semibold">
          <BookMarked className="w-4 h-4 text-[#7a2e33]" />
          <span>Sheets ({spreads.length})</span>
        </div>

        <div className="relative">
          <button
            onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
            className="flex items-center space-x-1 bg-[#7a2e33] hover:bg-[#5a2226] text-xs text-[#ffffff] px-2.5 py-1.5 rounded-lg transition-colors shadow-xs"
            title="Add Spread or Half Sheet"
          >
            <Plus className="w-3.5 h-3.5" />
            <span className="font-medium">Add</span>
            <ChevronDown className="w-3 h-3 ml-0.5" />
          </button>

          {/* Add Sheet Type Dropdown Menu */}
          {isAddMenuOpen && (
            <div 
              className="absolute right-0 top-9 w-52 bg-[#ffffff] border border-[#d4c1a3] rounded-xl shadow-lg z-50 py-1.5 animate-in fade-in zoom-in-95 duration-150"
              onClick={() => setIsAddMenuOpen(false)}
            >
              <div className="px-3 py-1 text-[10px] uppercase font-semibold text-[#8c867e] border-b border-[#f2ede4]">
                Choose Sheet Format
              </div>
              
              <button
                onClick={() => onAddSpread('full_spread')}
                className="w-full text-left px-3 py-2 text-xs text-[#111417] hover:bg-[#fbf4f4] hover:text-[#7a2e33] flex items-center justify-between transition-colors"
              >
                <span className="font-medium">+ Full Spread (2 Pages)</span>
                <span className="text-[10px] font-mono text-[#8c867e]">{preset.spreadWidth}" × {preset.spreadHeight}"</span>
              </button>

              <button
                onClick={() => onAddSpread('front_cover')}
                className="w-full text-left px-3 py-2 text-xs text-[#111417] hover:bg-[#fbf4f4] hover:text-[#7a2e33] flex items-center justify-between transition-colors"
              >
                <span className="font-medium">+ Front Cover (Half)</span>
                <span className="text-[10px] font-mono text-[#7a2e33]">Half Sheet</span>
              </button>

              <button
                onClick={() => onAddSpread('first_half')}
                className="w-full text-left px-3 py-2 text-xs text-[#111417] hover:bg-[#fbf4f4] hover:text-[#7a2e33] flex items-center justify-between transition-colors"
              >
                <span className="font-medium">+ First Half (Page 1)</span>
                <span className="text-[10px] font-mono text-[#7a2e33]">Right Page</span>
              </button>

              <button
                onClick={() => onAddSpread('last_half')}
                className="w-full text-left px-3 py-2 text-xs text-[#111417] hover:bg-[#fbf4f4] hover:text-[#7a2e33] flex items-center justify-between transition-colors"
              >
                <span className="font-medium">+ Last Half (Final Page)</span>
                <span className="text-[10px] font-mono text-[#7a2e33]">Left Page</span>
              </button>

              <button
                onClick={() => onAddSpread('back_cover')}
                className="w-full text-left px-3 py-2 text-xs text-[#111417] hover:bg-[#fbf4f4] hover:text-[#7a2e33] flex items-center justify-between transition-colors border-t border-[#f2ede4]"
              >
                <span className="font-medium">+ Back Cover (Half)</span>
                <span className="text-[10px] font-mono text-[#7a2e33]">Half Sheet</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Spreads List */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-[#fdfcfb]">
        {spreads.map((spread, idx) => {
          const isActive = idx === activeSpreadIndex;
          const photoCount = spread.frames.filter(f => f.photoId).length;
          const isHalfSheet = spread.sheetType === 'front_cover' || 
                              spread.sheetType === 'back_cover' || 
                              spread.sheetType === 'first_half' || 
                              spread.sheetType === 'last_half';

          let typeBadgeText = 'Full Spread';
          let typeBadgeClass = 'bg-[#f2ede4] text-[#6b6660]';
          if (spread.sheetType === 'front_cover') {
            typeBadgeText = 'Front Cover';
            typeBadgeClass = 'bg-[#7a2e33] text-white';
          } else if (spread.sheetType === 'back_cover') {
            typeBadgeText = 'Back Cover';
            typeBadgeClass = 'bg-[#111417] text-[#d4c1a3]';
          } else if (spread.sheetType === 'first_half') {
            typeBadgeText = 'Page 1 (Half)';
            typeBadgeClass = 'bg-[#fbf4f4] text-[#7a2e33] border border-[#d4c1a3]';
          } else if (spread.sheetType === 'last_half') {
            typeBadgeText = 'Final Page (Half)';
            typeBadgeClass = 'bg-[#fbf4f4] text-[#7a2e33] border border-[#d4c1a3]';
          }

          return (
            <div
              key={spread.id}
              onClick={() => onSelectSpread(idx)}
              className={`group relative rounded-xl border p-2.5 cursor-pointer transition-all ${
                isActive
                  ? 'border-[#7a2e33] bg-[#fbf4f4] shadow-sm ring-1 ring-[#7a2e33]/20'
                  : 'border-[#e8dfd8] bg-[#ffffff] hover:border-[#d4c1a3] hover:shadow-xs'
              }`}
            >
              {/* Header inside spread card */}
              <div className="flex items-center justify-between text-[11px] mb-1.5">
                <div className="flex items-center space-x-1.5">
                  <span className={`font-semibold ${isActive ? 'text-[#7a2e33]' : 'text-[#111417]'}`}>
                    {idx + 1}.
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.2 rounded ${typeBadgeClass}`}>
                    {typeBadgeText}
                  </span>
                </div>

                <div className="flex items-center space-x-1">
                  {spread.status === 'approved' && (
                    <CheckCircle className="w-3 h-3 text-emerald-600" />
                  )}
                  {spread.hasGutterWarning && (
                    <AlertCircle className="w-3 h-3 text-amber-500" />
                  )}
                  <span className="text-[10px] text-[#8c867e] font-mono">
                    {photoCount} {photoCount === 1 ? 'photo' : 'photos'}
                  </span>
                </div>
              </div>

              {/* Spread Miniature Visual Preview Container */}
              <div className="w-full flex justify-center py-1 bg-[#f9f8f6] rounded border border-[#f0eae1]">
                <div
                  style={{
                    width: isHalfSheet ? '50%' : '100%',
                    aspectRatio: isHalfSheet ? `${halfSheetAspect}` : `${fullSpreadAspect}`,
                    backgroundColor: spread.backgroundColor || '#FFFFFF'
                  }}
                  className="relative rounded-[2px] overflow-hidden border border-[#d4c1a3] shadow-xs"
                >
                  {/* Center Gutter Line for Full Spreads only */}
                  {!isHalfSheet && (
                    <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-black/15 z-10" />
                  )}

                  {/* Miniature Frames with real photos */}
                  {spread.frames.map((frame, fIdx) => {
                    const p = frame.photoId ? photoMap.get(frame.photoId) : undefined;
                    return (
                      <div
                        key={frame.id || fIdx}
                        style={{
                          left: `${frame.x}%`,
                          top: `${frame.y}%`,
                          width: `${frame.width}%`,
                          height: `${frame.height}%`
                        }}
                        className="absolute overflow-hidden bg-[#e8dfd8]"
                      >
                        {p && (
                          <img
                            src={p.url}
                            alt=""
                            className="w-full h-full object-cover pointer-events-none"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Action Buttons Bar on Card */}
              <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-[#f2ede4] text-[10px] text-[#8c867e]">
                {/* Move buttons */}
                <div className="flex items-center space-x-0.5">
                  <button
                    disabled={idx === 0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSpread(idx, idx - 1);
                    }}
                    title="Move Sheet Up"
                    className="p-1 hover:text-[#111417] hover:bg-[#f2ede4] rounded disabled:opacity-20"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    disabled={idx === spreads.length - 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveSpread(idx, idx + 1);
                    }}
                    title="Move Sheet Down"
                    className="p-1 hover:text-[#111417] hover:bg-[#f2ede4] rounded disabled:opacity-20"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>

                {/* Duplicate / Delete */}
                <div className="flex items-center space-x-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onDuplicateSpread(idx);
                    }}
                    title="Duplicate Sheet"
                    className="p-1 text-[#6b6660] hover:text-[#7a2e33] hover:bg-[#f2ede4] rounded"
                  >
                    <Copy className="w-3 h-3" />
                  </button>
                  <button
                    disabled={spreads.length <= 1}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSpread(idx);
                    }}
                    title="Delete Sheet"
                    className="p-1 text-[#8c867e] hover:text-red-600 hover:bg-red-50 rounded disabled:opacity-20"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </aside>
  );
};
