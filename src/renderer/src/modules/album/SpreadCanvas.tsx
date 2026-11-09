import React, { useState } from 'react';
import { 
  Type, 
  Eye, 
  EyeOff, 
  Sparkles, 
  AlertCircle, 
  Plus, 
  Palette, 
  Image as ImageIcon,
  BookOpen,
  Layers
} from 'lucide-react';
import { SpreadItem, SpreadFrame, PhotoItem, AlbumSizePreset, TextBlock } from './album';
import { SpreadPhotoFrame } from './SpreadPhotoFrame';

interface SpreadCanvasProps {
  spread: SpreadItem;
  preset: AlbumSizePreset;
  photos: PhotoItem[];
  selectedFrameId: string | null;
  onSelectFrame: (frameId: string | null) => void;
  onUpdateFrame: (frameId: string, updated: Partial<SpreadFrame>) => void;
  onRemovePhotoFromFrame: (frameId: string) => void;
  onSwapFrames: (frameAId: string, frameBId: string) => void;
  onAssignPhotoToFrame: (frameId: string, photoId: string) => void;
  onAddPhotoToSpread: (photoId: string) => void;
  onUpdateSpread: (updated: Partial<SpreadItem>) => void;
  onDuplicatePhotoToBackground: (photoUrl: string) => void;
  zoomLevel: number;
}

export const SpreadCanvas: React.FC<SpreadCanvasProps> = ({
  spread,
  preset,
  photos,
  selectedFrameId,
  onSelectFrame,
  onUpdateFrame,
  onRemovePhotoFromFrame,
  onSwapFrames,
  onAssignPhotoToFrame,
  onAddPhotoToSpread,
  onUpdateSpread,
  onDuplicatePhotoToBackground,
  zoomLevel
}) => {
  const [showGuides, setShowGuides] = useState(true);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);

  // Determine whether this sheet is a Half Sheet (Front Cover, Back Cover, First Half, Last Half) or a Full Spread
  const isHalfSheet = spread.sheetType === 'front_cover' || 
                      spread.sheetType === 'back_cover' || 
                      spread.sheetType === 'first_half' || 
                      spread.sheetType === 'last_half';

  // Physical aspect ratio
  const sheetAspect = isHalfSheet
    ? preset.singlePageWidth / preset.spreadHeight
    : preset.spreadWidth / preset.spreadHeight;

  const photoMap = new Map<string, PhotoItem>();
  photos.forEach(p => photoMap.set(p.id, p));

  const bgConfig = spread.backgroundConfig;
  const isImageBackground = bgConfig?.type === 'image' && !!bgConfig.imageUrl;

  const handleCanvasDragOver = (e: React.DragEvent) => {
    e.preventDefault();
  };

  const handleCanvasDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const photoId = e.dataTransfer.getData('text/photo-id');
    const assetUrl = e.dataTransfer.getData('text/asset-url');
    const sourceFrameId = e.dataTransfer.getData('text/frame-id');

    if (photoId && !sourceFrameId) {
      onAddPhotoToSpread(photoId);
    } else if (assetUrl) {
      onDuplicatePhotoToBackground(assetUrl);
    }
  };

  const addTextBlock = () => {
    const newText: TextBlock = {
      id: `text-${Date.now()}`,
      text: 'WEDDING CELEBRATIONS',
      fontFamily: 'The Seasons',
      fontSize: 22,
      fontWeight: '700',
      fontStyle: 'normal',
      color: '#7A2E33',
      alignment: 'center',
      letterSpacing: 0.2,
      x: 20,
      y: 88,
      width: 60
    };
    onUpdateSpread({ textBlocks: [...spread.textBlocks, newText] });
    setEditingTextId(newText.id);
  };

  const removeTextBlock = (textId: string) => {
    onUpdateSpread({
      textBlocks: spread.textBlocks.filter(t => t.id !== textId)
    });
  };

  // Label for sheet banner
  let sheetTypeLabel = 'Full Spread';
  if (spread.sheetType === 'front_cover') sheetTypeLabel = 'Front Cover (Half Sheet — Right Side)';
  else if (spread.sheetType === 'back_cover') sheetTypeLabel = 'Back Cover (Half Sheet — Left Side)';
  else if (spread.sheetType === 'first_half') sheetTypeLabel = 'First Half — Page 1 (Right Side)';
  else if (spread.sheetType === 'last_half') sheetTypeLabel = 'Last Half — Final Page (Left Side)';

  return (
    <div 
      className="flex-1 bg-[#eee9e0] overflow-auto flex flex-col items-center justify-center p-8 relative"
      onClick={() => {
        onSelectFrame(null);
        setEditingTextId(null);
      }}
    >
      {/* Top Floating Guide & Tool bar */}
      <div 
        onClick={(e) => e.stopPropagation()}
        className="absolute top-4 z-20 flex items-center space-x-2 bg-[#ffffff]/95 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-[#d4c1a3] text-xs text-[#111417] shadow-md"
      >
        <button
          onClick={() => setShowGuides(!showGuides)}
          className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-full transition-colors ${
            showGuides ? 'bg-[#fbf4f4] text-[#7a2e33] font-medium' : 'hover:bg-[#f2ede4] text-[#6b6660]'
          }`}
          title="Toggle Bleed, Trim & Safe Guides"
        >
          {showGuides ? <Eye className="w-3.5 h-3.5 text-[#7a2e33]" /> : <EyeOff className="w-3.5 h-3.5 text-[#8c867e]" />}
          <span>Guides</span>
        </button>

        <div className="h-4 w-px bg-[#e8dfd8]" />

        <button
          onClick={addTextBlock}
          className="flex items-center space-x-1.5 px-2.5 py-1 rounded-full hover:bg-[#f2ede4] text-[#111417] hover:text-[#7a2e33] transition-colors"
          title="Add Fine-Art Typography"
        >
          <Type className="w-3.5 h-3.5 text-[#7a2e33]" />
          <span>Add Text</span>
        </button>

        <div className="h-4 w-px bg-[#e8dfd8]" />

        {/* Quick Background Color Buttons */}
        <div className="flex items-center space-x-1.5 pl-1">
          <Palette className="w-3.5 h-3.5 text-[#6b6660] mr-1" />
          {[
            { color: '#FFFFFF', label: 'Studio Pure White' },
            { color: '#FAF8F6', label: 'Bavare Ivory Paper' },
            { color: '#F2EDE4', label: 'Warm Sand' },
            { color: '#111417', label: 'Ink Noir' },
            { color: '#7A2E33', label: 'Royal Burgundy' }
          ].map(c => (
            <button
              key={c.color}
              onClick={() => onUpdateSpread({ 
                backgroundColor: c.color,
                backgroundConfig: { type: 'color', color: c.color }
              })}
              title={c.label}
              style={{ backgroundColor: c.color }}
              className={`w-4 h-4 rounded-full border ${
                !isImageBackground && spread.backgroundColor === c.color 
                  ? 'ring-2 ring-[#7a2e33] border-white scale-110' 
                  : 'border-[#d4c1a3]'
              } transition-transform hover:scale-110 shadow-xs`}
            />
          ))}

          {/* Indicator if blurred image background is active */}
          {isImageBackground && (
            <div className="ml-2 flex items-center space-x-1 text-[10px] bg-[#fbf4f4] text-[#7a2e33] px-2 py-0.5 rounded-full border border-[#d4c1a3]">
              <ImageIcon className="w-3 h-3" />
              <span>Blurred BG Active ({bgConfig.blur}px)</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Album Spread / Half-Sheet Container */}
      <div
        onDragOver={handleCanvasDragOver}
        onDrop={handleCanvasDrop}
        style={{
          width: isHalfSheet 
            ? `${Math.round(48 * (zoomLevel / 100))}%` 
            : `${Math.round(85 * (zoomLevel / 100))}%`,
          maxWidth: isHalfSheet ? '800px' : '1400px',
          aspectRatio: `${sheetAspect}`,
          backgroundColor: spread.backgroundColor || '#FFFFFF'
        }}
        className="relative shadow-[0_20px_55px_rgba(17,20,23,0.16)] transition-all duration-150 select-none border border-[#d4c1a3] overflow-hidden rounded-[2px]"
      >
        {/* Layer 0: Blurred Image Background if configured */}
        {isImageBackground && (
          <div className="absolute inset-0 overflow-hidden pointer-events-none z-0">
            <div
              style={{
                backgroundImage: `url(${bgConfig.imageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: `blur(${bgConfig.blur ?? 24}px) brightness(${bgConfig.brightness ?? 95}%)`,
                transform: 'scale(1.12)'
              }}
              className="absolute inset-0"
            />
            <div
              style={{
                backgroundColor: bgConfig.overlayColor || '#000000',
                opacity: bgConfig.overlayOpacity ?? 0.4
              }}
              className="absolute inset-0"
            />
          </div>
        )}

        {/* Real Album Book Spine / Center Gutter Shadow (Only for Full Spreads) */}
        {!isHalfSheet && (
          <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-8 pointer-events-none z-10 bg-gradient-to-r from-transparent via-black/10 to-transparent flex items-center justify-center">
            {showGuides && (
              <div className="w-0.5 h-full border-r border-dashed border-[#7a2e33]/30" />
            )}
          </div>
        )}

        {/* Bleed & Safe Margin Guides */}
        {showGuides && (
          <>
            {/* Trim Bleed line (Red subtle dotted) */}
            <div className="absolute inset-1.5 border border-dashed border-red-500/25 pointer-events-none z-10" />
            {/* Safe Zone line (Subtle warm gold dotted) */}
            <div className="absolute inset-5 border border-dashed border-[#7a2e33]/20 pointer-events-none z-10" />

            {!isHalfSheet ? (
              <>
                <div className="absolute top-1 left-2 text-[9px] font-mono text-[#8c867e] pointer-events-none z-10">
                  Left Page
                </div>
                <div className="absolute top-1 right-2 text-[9px] font-mono text-[#8c867e] pointer-events-none z-10">
                  Right Page
                </div>
                <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[9px] font-mono text-[#7a2e33] pointer-events-none z-10 bg-[#f2ede4]/90 px-1.5 py-0.5 rounded border border-[#d4c1a3]">
                  Center Gutter ({preset.gutterType})
                </div>
              </>
            ) : (
              <div className="absolute bottom-1 right-2 text-[9px] font-mono text-[#7a2e33] pointer-events-none z-10 bg-[#f2ede4]/90 px-2 py-0.5 rounded border border-[#d4c1a3]">
                Half Sheet ({preset.singlePageWidth}" × {preset.spreadHeight}")
              </div>
            )}
          </>
        )}

        {/* Frames */}
        {spread.frames.map((frame) => {
          const photo = frame.photoId ? photoMap.get(frame.photoId) : undefined;
          return (
            <SpreadPhotoFrame
              key={frame.id}
              frame={frame}
              photo={photo}
              isSelected={selectedFrameId === frame.id}
              onSelect={() => onSelectFrame(frame.id)}
              onUpdateFrame={(updated) => onUpdateFrame(frame.id, updated)}
              onRemovePhoto={() => onRemovePhotoFromFrame(frame.id)}
              onSwapWith={(targetFrameId) => onSwapFrames(frame.id, targetFrameId)}
              onAssignPhoto={(photoId) => onAssignPhotoToFrame(frame.id, photoId)}
              onDuplicateToBackground={() => {
                if (photo) onDuplicatePhotoToBackground(photo.url);
              }}
            />
          );
        })}

        {/* Typography Text Blocks */}
        {spread.textBlocks.map((tb) => {
          const isEditing = editingTextId === tb.id;
          return (
            <div
              key={tb.id}
              onClick={(e) => {
                e.stopPropagation();
                setEditingTextId(tb.id);
              }}
              style={{
                left: `${tb.x}%`,
                top: `${tb.y}%`,
                width: `${tb.width}%`,
                fontFamily: tb.fontFamily,
                fontSize: `${tb.fontSize}px`,
                fontWeight: tb.fontWeight,
                fontStyle: tb.fontStyle,
                color: tb.color,
                textAlign: tb.alignment,
                letterSpacing: `${tb.letterSpacing}em`
              }}
              className={`absolute cursor-pointer transition-all z-20 group ${
                isEditing ? 'ring-1 ring-[#7a2e33] bg-white/90 p-1 rounded shadow-md' : 'hover:outline hover:outline-1 hover:outline-[#7a2e33]/50'
              }`}
            >
              {isEditing ? (
                <div className="flex flex-col space-y-1">
                  <input
                    type="text"
                    value={tb.text}
                    autoFocus
                    onChange={(e) => {
                      const updated = spread.textBlocks.map(t =>
                        t.id === tb.id ? { ...t, text: e.target.value } : t
                      );
                      onUpdateSpread({ textBlocks: updated });
                    }}
                    onBlur={() => setEditingTextId(null)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') setEditingTextId(null);
                    }}
                    className="w-full bg-white text-[#111417] px-2 py-0.5 rounded border border-[#7a2e33] text-center focus:outline-none"
                  />
                  <div className="flex items-center justify-between text-[10px] bg-[#f9f8f6] text-[#111417] p-1 rounded border border-[#d4c1a3]">
                    <select
                      value={tb.fontFamily}
                      onChange={(e) => {
                        const updated = spread.textBlocks.map(t =>
                          t.id === tb.id ? { ...t, fontFamily: e.target.value as any } : t
                        );
                        onUpdateSpread({ textBlocks: updated });
                      }}
                      className="bg-transparent text-xs text-[#7a2e33] focus:outline-none cursor-pointer"
                    >
                      <option value="The Seasons">The Seasons (Luxury Editorial)</option>
                      <option value="Vidaloka">Vidaloka (Heritage Serif)</option>
                      <option value="Tenor Sans">Tenor Sans (Modern Chic)</option>
                      <option value="DM Sans">DM Sans (Clean Sans)</option>
                      <option value="Inter">Inter (Minimalist)</option>
                      <option value="Newsreader">Newsreader (Fine Literature)</option>
                      <option value="Cinzel">Cinzel (Classical Regal)</option>
                      <option value="Cormorant Garamond">Cormorant Garamond (Elegance)</option>
                    </select>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeTextBlock(tb.id);
                      }}
                      className="text-red-600 hover:text-red-700 text-[10px] px-1 font-medium"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ) : (
                <div className="leading-tight select-none">
                  {tb.text}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Spread Footer Bar */}
      <div className="mt-4 flex items-center space-x-3 text-xs text-[#6b6660]">
        <span className="font-semibold text-[#111417]">
          {spread.name}
        </span>
        <span className="text-[#d4c1a3]">•</span>
        <span className="font-medium text-[#7a2e33]">
          {sheetTypeLabel}
        </span>
        <span className="text-[#d4c1a3]">•</span>
        <span className="font-mono text-[#8c867e]">
          {isHalfSheet ? `${preset.singlePageWidth}" × ${preset.spreadHeight}"` : `${preset.spreadWidth}" × ${preset.spreadHeight}"`}
        </span>
        <span className="text-[#d4c1a3]">•</span>
        <span>{spread.frames.filter(f => f.photoId).length} Photos Placed</span>
        <span className="text-[#d4c1a3]">•</span>
        <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-semibold ${
          spread.status === 'approved' 
            ? 'bg-emerald-50 text-emerald-700 border border-emerald-300' 
            : spread.status === 'needs_review'
            ? 'bg-amber-50 text-amber-700 border border-amber-300'
            : 'bg-[#f2ede4] text-[#6b6660] border border-[#d4c1a3]'
        }`}>
          {spread.status.replace('_', ' ')}
        </span>
      </div>
    </div>
  );
};
