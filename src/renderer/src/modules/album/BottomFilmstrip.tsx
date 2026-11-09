import React, { useState, useRef } from 'react';
import { 
  Upload, 
  Star, 
  Clock, 
  Search, 
  Sparkles, 
  CheckCircle2, 
  Image as ImageIcon, 
  FolderHeart, 
  Layers, 
  Plus, 
  Trash2,
  FolderOpen
} from 'lucide-react';
import { PhotoItem, StudioAssetItem, AssetCategory } from './album';
import { getCommonAssets, saveCommonAsset, deleteCommonAsset } from './engine/commonAssets';

interface BottomFilmstripProps {
  photos: PhotoItem[];
  onImportPhotos: (files: FileList) => void;
  onAddPhotoToSpread: (photoId: string) => void;
  onCreateSpreadFromPhotos: (photoIds: string[]) => void;
  onUpdatePhotoRating: (photoId: string, rating: number) => void;
  onUpdatePhotoLabel: (photoId: string, label: PhotoItem['colorLabel']) => void;
  onDuplicatePhotoToBackground: (photoUrl: string) => void;
}

export const BottomFilmstrip: React.FC<BottomFilmstripProps> = ({
  photos,
  onImportPhotos,
  onAddPhotoToSpread,
  onCreateSpreadFromPhotos,
  onUpdatePhotoRating,
  onUpdatePhotoLabel,
  onDuplicatePhotoToBackground
}) => {
  // Main view mode: 'project-photos' or 'common-assets'
  const [activeTab, setActiveTab] = useState<'photos' | 'assets'>('photos');

  // Project Photos Filter
  const [photoFilter, setPhotoFilter] = useState<'all' | 'unused' | 'used' | 'favorites'>('all');
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Common Assets
  const [commonAssets, setCommonAssets] = useState<StudioAssetItem[]>(() => getCommonAssets());
  const [assetCategory, setAssetCategory] = useState<AssetCategory | 'all'>('all');
  const assetFileInputRef = useRef<HTMLInputElement>(null);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // Filter project photos
  const filteredPhotos = photos.filter((p) => {
    if (searchQuery && !p.fileName.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (photoFilter === 'unused') return p.usedCount === 0;
    if (photoFilter === 'used') return p.usedCount > 0;
    if (photoFilter === 'favorites') return p.rating >= 4;
    return true;
  });

  const unusedCount = photos.filter(p => p.usedCount === 0).length;
  const usedCount = photos.filter(p => p.usedCount > 0).length;

  // Filter common assets
  const filteredAssets = commonAssets.filter(a => {
    if (assetCategory !== 'all' && a.category !== assetCategory) return false;
    if (searchQuery && !a.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const toggleSelectPhoto = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      if (selectedPhotoIds.includes(id)) {
        setSelectedPhotoIds(selectedPhotoIds.filter(pid => pid !== id));
      } else {
        setSelectedPhotoIds([...selectedPhotoIds, id]);
      }
    } else {
      setSelectedPhotoIds([id]);
    }
  };

  const handlePhotoDragStart = (e: React.DragEvent, photoId: string) => {
    e.dataTransfer.setData('text/photo-id', photoId);
  };

  const handleAssetDragStart = (e: React.DragEvent, asset: StudioAssetItem) => {
    e.dataTransfer.setData('text/asset-url', asset.url);
    e.dataTransfer.setData('text/asset-id', asset.id);
  };

  const handleImportCommonAssetFiles = async (files: FileList) => {
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result as string;
        let category: AssetCategory = 'photo';
        if (file.type.includes('svg') || file.name.toLowerCase().includes('clipart') || file.name.toLowerCase().includes('mandala')) {
          category = 'clipart';
        } else if (file.name.toLowerCase().includes('overlay') || file.name.toLowerCase().includes('bokeh')) {
          category = 'overlay';
        } else if (file.name.toLowerCase().includes('bg') || file.name.toLowerCase().includes('background')) {
          category = 'background';
        }

        const newAsset: StudioAssetItem = {
          id: `custom-asset-${Date.now()}-${i}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          category,
          url: dataUrl,
          isCustom: true
        };

        saveCommonAsset(newAsset);
        setCommonAssets(getCommonAssets());
      };
      reader.readAsDataURL(file);
    }
  };

  return (
    <div className="h-48 bg-[#ffffff] border-t border-[#e8dfd8] flex flex-col z-20 select-none shadow-[0_-4px_15px_rgba(17,20,23,0.04)]">
      {/* Primary Top Tab Switcher */}
      <div className="h-10 px-4 border-b border-[#e8dfd8] flex items-center justify-between bg-[#fdfcfb]">
        {/* Left: Tab Switcher (Project Photos vs Common Assets) */}
        <div className="flex items-center space-x-2">
          <div className="flex items-center bg-[#f2ede4] p-0.5 rounded-lg border border-[#d4c1a3]">
            <button
              onClick={() => setActiveTab('photos')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'photos'
                  ? 'bg-[#ffffff] text-[#7a2e33] shadow-xs'
                  : 'text-[#6b6660] hover:text-[#111417]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5 text-[#7a2e33]" />
              <span>Project Photos ({photos.length})</span>
            </button>

            <button
              onClick={() => setActiveTab('assets')}
              className={`flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                activeTab === 'assets'
                  ? 'bg-[#7a2e33] text-white shadow-xs font-bold'
                  : 'text-[#6b6660] hover:text-[#7a2e33]'
              }`}
            >
              <FolderHeart className="w-3.5 h-3.5 text-[#d4c1a3]" />
              <span>Bavare Studio Library</span>
              <span className="text-[10px] bg-black/20 text-current px-1 rounded-full ml-1 font-mono">
                {commonAssets.length}
              </span>
            </button>
          </div>

          <div className="h-4 w-px bg-[#e8dfd8] mx-1" />

          {/* Sub-Filters for Photos */}
          {activeTab === 'photos' ? (
            <div className="flex items-center space-x-1 text-xs">
              <button
                onClick={() => setPhotoFilter('all')}
                className={`px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  photoFilter === 'all' ? 'bg-[#7a2e33] text-white' : 'text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setPhotoFilter('unused')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  photoFilter === 'unused'
                    ? 'bg-amber-100 text-amber-800 border border-amber-300 font-semibold'
                    : 'text-[#6b6660] hover:text-amber-700'
                }`}
              >
                <Clock className="w-3 h-3" />
                <span>Unused ({unusedCount})</span>
              </button>
              <button
                onClick={() => setPhotoFilter('used')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  photoFilter === 'used'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold'
                    : 'text-[#6b6660] hover:text-emerald-700'
                }`}
              >
                <CheckCircle2 className="w-3 h-3" />
                <span>Placed ({usedCount})</span>
              </button>
              <button
                onClick={() => setPhotoFilter('favorites')}
                className={`flex items-center space-x-1 px-2.5 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                  photoFilter === 'favorites'
                    ? 'bg-[#fbf4f4] text-[#7a2e33] font-semibold border border-[#d4c1a3]'
                    : 'text-[#6b6660] hover:text-[#7a2e33]'
                }`}
              >
                <Star className="w-3 h-3 fill-current text-[#c5a059]" />
                <span>5-Star</span>
              </button>
            </div>
          ) : (
            /* Sub-Filters for Common Assets */
            <div className="flex items-center space-x-1 text-xs">
              {[
                { id: 'all', label: 'All' },
                { id: 'clipart', label: 'Clip Arts & Motifs' },
                { id: 'overlay', label: 'Overlays & Leaks' },
                { id: 'background', label: 'Fine Art Backgrounds' },
                { id: 'photo', label: 'Studio Backdrops' }
              ].map(cat => (
                <button
                  key={cat.id}
                  onClick={() => setAssetCategory(cat.id as any)}
                  className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                    assetCategory === cat.id
                      ? 'bg-[#7a2e33] text-white'
                      : 'text-[#6b6660] hover:text-[#111417]'
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Right: Actions & Search */}
        <div className="flex items-center space-x-2">
          {/* Quick Search */}
          <div className="relative w-44">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8c867e]" />
            <input
              type="text"
              placeholder={activeTab === 'photos' ? 'Search photo name...' : 'Search assets...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-2 py-1 bg-[#ffffff] border border-[#e8dfd8] rounded-lg text-xs text-[#111417] placeholder-[#8c867e] focus:outline-none focus:border-[#7a2e33]"
            />
          </div>

          {activeTab === 'photos' ? (
            <>
              {selectedPhotoIds.length > 0 && (
                <button
                  onClick={() => {
                    onCreateSpreadFromPhotos(selectedPhotoIds);
                    setSelectedPhotoIds([]);
                  }}
                  className="flex items-center space-x-1.5 bg-[#fbf4f4] hover:bg-[#f2ede4] text-[#7a2e33] border border-[#d4c1a3] text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors shadow-2xs"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Auto-Create Sheet ({selectedPhotoIds.length})</span>
                </button>
              )}

              <input
                ref={photoFileInputRef}
                type="file"
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) onImportPhotos(e.target.files);
                }}
                className="hidden"
              />
              <button
                onClick={() => photoFileInputRef.current?.click()}
                className="flex items-center space-x-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors shadow-2xs"
              >
                <Upload className="w-3.5 h-3.5 text-[#d4c1a3]" />
                <span>Import Photos</span>
              </button>
            </>
          ) : (
            <>
              <input
                ref={assetFileInputRef}
                type="file"
                multiple
                accept="image/*,.svg"
                onChange={(e) => {
                  if (e.target.files) handleImportCommonAssetFiles(e.target.files);
                }}
                className="hidden"
              />
              <button
                onClick={() => assetFileInputRef.current?.click()}
                className="flex items-center space-x-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-semibold px-3 py-1 rounded-lg transition-colors shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 text-[#d4c1a3]" />
                <span>Add Studio Asset</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Filmstrip Strip / Thumbnail Row */}
      <div className="flex-1 p-3 overflow-x-auto flex items-center space-x-3 bg-[#fdfcfb]">
        {activeTab === 'photos' ? (
          /* Project Photos Pool */
          filteredPhotos.length === 0 ? (
            <div className="w-full text-center py-6 text-xs text-[#8c867e]">
              <span>No photos found. Click "Import Photos" to load wedding images.</span>
            </div>
          ) : (
            filteredPhotos.map((photo) => {
              const isSelected = selectedPhotoIds.includes(photo.id);
              const isUsed = photo.usedCount > 0;

              return (
                <div
                  key={photo.id}
                  draggable
                  onDragStart={(e) => handlePhotoDragStart(e, photo.id)}
                  onClick={(e) => toggleSelectPhoto(photo.id, e)}
                  onDoubleClick={() => onAddPhotoToSpread(photo.id)}
                  className={`group relative flex-shrink-0 h-28 w-28 rounded-xl border overflow-hidden cursor-pointer transition-all ${
                    isSelected
                      ? 'border-[#7a2e33] ring-2 ring-[#7a2e33] shadow-md'
                      : isUsed
                      ? 'border-[#e8dfd8] opacity-75 hover:opacity-100 hover:border-[#d4c1a3]'
                      : 'border-[#d4c1a3] hover:border-[#7a2e33] hover:shadow-sm'
                  } bg-[#f9f8f6]`}
                >
                  <img
                    src={photo.url}
                    alt={photo.fileName}
                    className="w-full h-full object-cover pointer-events-none group-hover:scale-105 transition-transform duration-200"
                  />

                  {/* Used Counter badge */}
                  {isUsed && (
                    <div className="absolute top-1.5 left-1.5 bg-[#111417]/85 backdrop-blur-xs text-emerald-400 text-[10px] font-mono px-1.5 py-0.2 rounded font-semibold flex items-center space-x-1">
                      <CheckCircle2 className="w-2.5 h-2.5" />
                      <span>{photo.usedCount}</span>
                    </div>
                  )}

                  {/* Star rating button */}
                  <div
                    onClick={(e) => {
                      e.stopPropagation();
                      const nextRating = photo.rating === 5 ? 0 : 5;
                      onUpdatePhotoRating(photo.id, nextRating);
                    }}
                    className="absolute top-1.5 right-1.5 p-1 rounded-md bg-[#111417]/70 text-[#d4c1a3] hover:text-amber-400 transition-colors"
                  >
                    <Star className={`w-3 h-3 ${photo.rating >= 4 ? 'fill-[#c5a059] text-[#c5a059]' : ''}`} />
                  </div>

                  {/* File name footer */}
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/40 to-transparent p-1.5 text-[10px] text-white truncate pointer-events-none font-sans">
                    {photo.fileName}
                  </div>
                </div>
              );
            })
          )
        ) : (
          /* Bavare Studio Library Assets */
          filteredAssets.length === 0 ? (
            <div className="w-full text-center py-6 text-xs text-[#8c867e]">
              <span>No studio assets in this category.</span>
            </div>
          ) : (
            filteredAssets.map((asset) => (
              <div
                key={asset.id}
                draggable
                onDragStart={(e) => handleAssetDragStart(e, asset)}
                onDoubleClick={() => onDuplicatePhotoToBackground(asset.url)}
                title="Drag onto Canvas or Frame to use"
                className="group relative flex-shrink-0 h-28 w-28 rounded-xl border border-[#d4c1a3] overflow-hidden cursor-pointer bg-[#ffffff] hover:border-[#7a2e33] hover:shadow-md transition-all p-1 flex flex-col justify-between"
              >
                <div className="w-full h-20 rounded-lg overflow-hidden bg-[#f9f8f6] flex items-center justify-center relative">
                  <img
                    src={asset.url}
                    alt={asset.name}
                    className="max-h-full max-w-full object-contain pointer-events-none group-hover:scale-105 transition-transform"
                  />
                  {asset.isCustom && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCommonAsset(asset.id);
                        setCommonAssets(getCommonAssets());
                      }}
                      className="absolute top-1 right-1 p-1 bg-white/90 text-red-600 rounded-md opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <span className="text-[10px] text-[#111417] font-medium truncate block px-0.5">
                  {asset.name}
                </span>
              </div>
            ))
          )
        )}
      </div>
    </div>
  );
};
