import React, { useState, useRef } from 'react';
import { 
  ZoomIn, 
  RotateCw, 
  Trash2, 
  Move, 
  Sparkles, 
  Check, 
  Crop, 
  Layers, 
  AlertTriangle 
} from 'lucide-react';
import { SpreadFrame, PhotoItem, PhotoFilter } from './album';

interface SpreadPhotoFrameProps {
  frame: SpreadFrame;
  photo?: PhotoItem;
  isSelected: boolean;
  onSelect: () => void;
  onUpdateFrame: (updated: Partial<SpreadFrame>) => void;
  onRemovePhoto: () => void;
  onSwapWith: (targetFrameId: string) => void;
  onAssignPhoto: (photoId: string) => void;
  onDuplicateToBackground?: () => void;
}

export const SpreadPhotoFrame: React.FC<SpreadPhotoFrameProps> = ({
  frame,
  photo,
  isSelected,
  onSelect,
  onUpdateFrame,
  onRemovePhoto,
  onSwapWith,
  onAssignPhoto,
  onDuplicateToBackground
}) => {
  const [isEditingCrop, setIsEditingCrop] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);

  // Check DPI warning
  const isLowDpi = photo && (photo.width < 1200 || photo.height < 1200) && frame.width > 35;

  const getFilterStyle = (filter: PhotoFilter): string => {
    switch (filter) {
      case 'bw':
        return 'grayscale(100%) contrast(110%)';
      case 'sepia':
        return 'sepia(80%)';
      case 'warm':
        return 'sepia(25%) saturate(120%) brightness(102%)';
      case 'cool':
        return 'hue-rotate(180deg) saturate(90%)';
      default:
        return 'none';
    }
  };

  const handleDragStart = (e: React.DragEvent) => {
    if (!frame.photoId) return;
    e.dataTransfer.setData('text/frame-id', frame.id);
    e.dataTransfer.setData('text/photo-id', frame.photoId);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    const sourceFrameId = e.dataTransfer.getData('text/frame-id');
    const sourcePhotoId = e.dataTransfer.getData('text/photo-id');
    const assetUrl = e.dataTransfer.getData('text/asset-url');

    if (sourceFrameId && sourceFrameId !== frame.id) {
      onSwapWith(sourceFrameId);
    } else if (sourcePhotoId) {
      onAssignPhoto(sourcePhotoId);
    } else if (assetUrl) {
      onAssignPhoto(assetUrl);
    }
  };

  const cycleFilter = () => {
    const filters: PhotoFilter[] = ['none', 'bw', 'sepia', 'warm', 'cool'];
    const nextIdx = (filters.indexOf(frame.filter) + 1) % filters.length;
    onUpdateFrame({ filter: filters[nextIdx] });
  };

  const rotateFrame = () => {
    const nextRot = (frame.rotation + 90) % 360;
    onUpdateFrame({ rotation: nextRot });
  };

  return (
    <div
      ref={frameRef}
      onClick={(e) => {
        e.stopPropagation();
        onSelect();
      }}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      draggable={!!frame.photoId && !isEditingCrop}
      onDragStart={handleDragStart}
      style={{
        left: `${frame.x}%`,
        top: `${frame.y}%`,
        width: `${frame.width}%`,
        height: `${frame.height}%`,
        borderWidth: frame.borderWidth ? `${frame.borderWidth}px` : undefined,
        borderColor: frame.borderColor || undefined,
        borderRadius: frame.borderRadius ? `${frame.borderRadius}px` : undefined
      }}
      className={`absolute transition-all duration-150 overflow-hidden group cursor-pointer ${
        isSelected
          ? 'ring-2 ring-[#7a2e33] shadow-lg z-20'
          : isHovered
          ? 'ring-1 ring-[#7a2e33]/70 z-10'
          : 'ring-1 ring-black/5'
      } ${isDragOver ? 'ring-3 ring-emerald-500 bg-emerald-50/30' : ''}`}
    >
      {photo ? (
        <div className="relative w-full h-full bg-[#f2ede4]">
          {/* Photo Image with Crop, Pan, Zoom, Filter */}
          <div
            className="w-full h-full overflow-hidden relative flex items-center justify-center"
            style={{
              transform: `rotate(${frame.rotation}deg)`
            }}
          >
            <img
              src={photo.url}
              alt={photo.fileName}
              draggable={false}
              style={{
                filter: getFilterStyle(frame.filter),
                transform: `scale(${frame.crop.zoom}) translate(${frame.crop.panX}%, ${frame.crop.panY}%)`,
                transformOrigin: 'center center'
              }}
              className="w-full h-full object-cover pointer-events-none transition-transform duration-75"
            />
          </div>

          {/* Low DPI Warning Banner */}
          {isLowDpi && (
            <div
              title="Low DPI Warning: This image may print with lower resolution at this frame size"
              className="absolute top-2 left-2 z-20 flex items-center space-x-1 bg-amber-600/90 text-white text-[10px] px-2 py-0.5 rounded shadow-sm backdrop-blur-sm"
            >
              <AlertTriangle className="w-3 h-3" />
              <span>Low DPI</span>
            </div>
          )}

          {/* Filter Badge if not none */}
          {frame.filter !== 'none' && (
            <div className="absolute bottom-2 left-2 z-20 bg-[#111417]/80 backdrop-blur-sm text-[10px] text-[#d4c1a3] uppercase px-1.5 py-0.5 rounded">
              {frame.filter}
            </div>
          )}

          {/* Quick Hover Action Bar */}
          <div
            className={`absolute top-2 right-2 z-20 flex items-center space-x-1 bg-[#ffffff]/95 backdrop-blur-md p-1 rounded-xl border border-[#d4c1a3] shadow-md transition-opacity duration-150 ${
              isHovered || isSelected ? 'opacity-100' : 'opacity-0 pointer-events-none'
            }`}
          >
            {/* Duplicate to Background (Blurred) Button */}
            {onDuplicateToBackground && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDuplicateToBackground();
                }}
                title="Duplicate & Blur as Spread Background"
                className="p-1.5 text-[#7a2e33] hover:text-[#5a2226] hover:bg-[#fbf4f4] rounded-lg transition-colors"
              >
                <Layers className="w-3.5 h-3.5" />
              </button>
            )}

            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsEditingCrop(!isEditingCrop);
              }}
              title="Adjust Crop & Zoom"
              className={`p-1.5 rounded-lg transition-colors ${
                isEditingCrop ? 'bg-[#7a2e33] text-white' : 'text-[#6b6660] hover:text-[#111417] hover:bg-[#f2ede4]'
              }`}
            >
              <Crop className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                cycleFilter();
              }}
              title="Toggle Photo Filter (B&W / Warm / Sepia)"
              className="p-1.5 text-[#6b6660] hover:text-[#7a2e33] hover:bg-[#f2ede4] rounded-lg transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                rotateFrame();
              }}
              title="Rotate 90°"
              className="p-1.5 text-[#6b6660] hover:text-[#111417] hover:bg-[#f2ede4] rounded-lg transition-colors"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemovePhoto();
              }}
              title="Remove Photo from Frame"
              className="p-1.5 text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* In-Frame Crop / Pan Overlay Drawer */}
          {isEditingCrop && (
            <div
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-2 bottom-2 z-30 bg-[#ffffff]/98 backdrop-blur-md border border-[#d4c1a3] p-2.5 rounded-xl shadow-xl text-xs flex flex-col space-y-2 animate-fadeIn"
            >
              <div className="flex items-center justify-between text-[#111417]">
                <span className="font-medium text-[11px] text-[#7a2e33]">Crop & Zoom</span>
                <button
                  onClick={() => setIsEditingCrop(false)}
                  className="p-0.5 hover:bg-[#f2ede4] rounded"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                </button>
              </div>

              {/* Zoom Slider */}
              <div className="flex items-center space-x-2">
                <ZoomIn className="w-3.5 h-3.5 text-[#6b6660]" />
                <input
                  type="range"
                  min="1"
                  max="2.5"
                  step="0.05"
                  value={frame.crop.zoom}
                  onChange={(e) => {
                    onUpdateFrame({
                      crop: { ...frame.crop, zoom: parseFloat(e.target.value) }
                    });
                  }}
                  className="w-full accent-[#7a2e33] cursor-pointer"
                />
                <span className="font-mono text-[10px] text-[#111417] w-8">
                  {Math.round(frame.crop.zoom * 100)}%
                </span>
              </div>

              {/* Pan Horizontal & Vertical Controls */}
              <div className="grid grid-cols-2 gap-2 text-[10px] text-[#6b6660]">
                <div className="flex items-center space-x-1">
                  <span>Pan X:</span>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={frame.crop.panX}
                    onChange={(e) => {
                      onUpdateFrame({
                        crop: { ...frame.crop, panX: parseInt(e.target.value) }
                      });
                    }}
                    className="w-full accent-[#7a2e33]"
                  />
                </div>
                <div className="flex items-center space-x-1">
                  <span>Pan Y:</span>
                  <input
                    type="range"
                    min="-40"
                    max="40"
                    value={frame.crop.panY}
                    onChange={(e) => {
                      onUpdateFrame({
                        crop: { ...frame.crop, panY: parseInt(e.target.value) }
                      });
                    }}
                    className="w-full accent-[#7a2e33]"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Empty Frame Placeholder */
        <div className="w-full h-full bg-[#f9f8f6] border-2 border-dashed border-[#d4c1a3] hover:border-[#7a2e33] flex flex-col items-center justify-center text-[#8c867e] hover:text-[#7a2e33] transition-colors p-4 text-center">
          <Move className="w-6 h-6 mb-1.5 opacity-40 group-hover:opacity-80 transition-opacity text-[#7a2e33]" />
          <p className="text-xs font-medium text-[#111417]">Drop Photo Here</p>
          <span className="text-[10px] text-[#8c867e]">or drag from filmstrip below</span>
        </div>
      )}
    </div>
  );
};
