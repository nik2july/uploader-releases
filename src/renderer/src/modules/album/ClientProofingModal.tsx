import React, { useState } from 'react';
import { 
  X, 
  ChevronLeft, 
  ChevronRight, 
  CheckCircle, 
  MessageSquare, 
  Share2, 
  Send,
  Eye,
  BookOpen
} from 'lucide-react';
import { AlbumProject, SpreadItem, PhotoItem } from './album';

interface ClientProofingModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: AlbumProject;
  photos: PhotoItem[];
  onUpdateSpreadStatus: (spreadIndex: number, status: SpreadItem['status']) => void;
  onAddSpreadComment: (spreadIndex: number, text: string) => void;
}

export const ClientProofingModal: React.FC<ClientProofingModalProps> = ({
  isOpen,
  onClose,
  project,
  photos,
  onUpdateSpreadStatus,
  onAddSpreadComment
}) => {
  const [currentIdx, setCurrentIdx] = useState(0);
  const [newComment, setNewComment] = useState('');

  if (!isOpen) return null;

  const currentSpread = project.spreads[currentIdx] || project.spreads[0];
  const photoMap = new Map<string, PhotoItem>();
  photos.forEach(p => photoMap.set(p.id, p));

  const isHalfSheet = currentSpread.sheetType === 'front_cover' || 
                      currentSpread.sheetType === 'back_cover' || 
                      currentSpread.sheetType === 'first_half' || 
                      currentSpread.sheetType === 'last_half';

  const sheetAspect = isHalfSheet 
    ? project.sizePreset.singlePageWidth / project.sizePreset.spreadHeight
    : project.sizePreset.spreadWidth / project.sizePreset.spreadHeight;

  const bgConfig = currentSpread.backgroundConfig;
  const isImageBackground = bgConfig?.type === 'image' && !!bgConfig.imageUrl;

  const handleNext = () => {
    if (currentIdx < project.spreads.length - 1) setCurrentIdx(currentIdx + 1);
  };

  const handlePrev = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const approvedSpreadsCount = project.spreads.filter(s => s.status === 'approved').length;

  return (
    <div className="fixed inset-0 z-50 bg-[#111417]/80 backdrop-blur-md flex flex-col select-none animate-fadeIn">
      {/* Top Proofing Header */}
      <div className="h-16 px-6 bg-[#ffffff] border-b border-[#e8dfd8] flex items-center justify-between shadow-sm">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2.5 text-[#111417] font-semibold">
            <div className="w-8 h-8 rounded-lg bg-[#7a2e33] flex items-center justify-center text-[#d4c1a3]">
              <BookOpen className="w-4 h-4" />
            </div>
            <span className="font-serif text-base tracking-wide">
              Bavare <span className="text-[#7a2e33] font-normal italic">Client Portal</span>
            </span>
          </div>

          <div className="h-5 w-px bg-[#e8dfd8]" />

          <div className="text-xs text-[#6b6660]">
            <span className="font-semibold text-[#111417]">{project.clientNames}</span>
            <span className="text-[#d4c1a3] mx-2">•</span>
            <span className="text-[#7a2e33]">{project.title}</span>
            <span className="text-[#d4c1a3] mx-2">•</span>
            <span className="text-[#8c867e] font-mono">{project.sizePreset.spreadWidth}" × {project.sizePreset.spreadHeight}" @ {project.targetDpi || 300} DPI</span>
          </div>
        </div>

        {/* Approval Progress & Close */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-xs bg-[#f9f8f6] px-3 py-1.5 rounded-full border border-[#d4c1a3]">
            <CheckCircle className="w-4 h-4 text-emerald-600" />
            <span className="text-[#111417]">
              Approved: <strong className="text-emerald-700 font-bold">{approvedSpreadsCount}</strong> / {project.spreads.length} Sheets
            </span>
          </div>

          <button
            onClick={() => {
              navigator.clipboard?.writeText(window.location.href);
              alert('Client proofing preview link copied to clipboard!');
            }}
            className="flex items-center space-x-1.5 bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] px-3 py-1.5 rounded-xl text-xs font-medium border border-[#d4c1a3] transition-colors shadow-2xs"
          >
            <Share2 className="w-3.5 h-3.5 text-[#7a2e33]" />
            <span>Copy Client Link</span>
          </button>

          <button
            onClick={onClose}
            className="p-1.5 text-[#6b6660] hover:text-[#111417] rounded-lg hover:bg-[#f2ede4] transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Spread Showcase Stage */}
      <div className="flex-1 flex items-center justify-between px-8 py-6 relative overflow-hidden bg-[#eee9e0]">
        {/* Prev Arrow */}
        <button
          onClick={handlePrev}
          disabled={currentIdx === 0}
          className="p-3 rounded-full bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] disabled:opacity-20 border border-[#d4c1a3] transition-all shadow-lg z-20"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>

        {/* Open Spread Centerpiece */}
        <div className="flex-1 flex flex-col items-center justify-center max-w-5xl h-full px-6">
          <div
            style={{
              width: isHalfSheet ? '55%' : '100%',
              aspectRatio: `${sheetAspect}`,
              backgroundColor: currentSpread.backgroundColor || '#FFFFFF'
            }}
            className="max-h-[70vh] relative shadow-[0_25px_70px_rgba(17,20,23,0.18)] rounded-[2px] overflow-hidden border border-[#d4c1a3] transition-all duration-300"
          >
            {/* Blurred Image Background if set */}
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

            {/* Center Gutter 3D Fold (Full Spread only) */}
            {!isHalfSheet && (
              <div className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-12 pointer-events-none z-10 bg-gradient-to-r from-transparent via-black/10 to-transparent flex items-center justify-center">
                <div className="w-px h-full bg-black/10" />
              </div>
            )}

            {/* Subtle Watermark for security */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10 select-none">
              <span className="text-3xl font-serif tracking-widest text-black/8 uppercase -rotate-12">
                Client Proof • Bavare Studio
              </span>
            </div>

            {/* Frames */}
            {currentSpread.frames.map((frame) => {
              const photo = frame.photoId ? photoMap.get(frame.photoId) : undefined;
              if (!photo) return null;

              return (
                <div
                  key={frame.id}
                  style={{
                    left: `${frame.x}%`,
                    top: `${frame.y}%`,
                    width: `${frame.width}%`,
                    height: `${frame.height}%`,
                    borderRadius: frame.borderRadius ? `${frame.borderRadius}px` : undefined
                  }}
                  className="absolute overflow-hidden"
                >
                  <img
                    src={photo.url}
                    alt=""
                    style={{
                      transform: `scale(${frame.crop.zoom}) translate(${frame.crop.panX}%, ${frame.crop.panY}%) rotate(${frame.rotation}deg)`
                    }}
                    className="w-full h-full object-cover pointer-events-none"
                  />
                </div>
              );
            })}

            {/* Text Blocks */}
            {currentSpread.textBlocks.map((tb) => (
              <div
                key={tb.id}
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
                className="absolute pointer-events-none select-none z-20 drop-shadow-md"
              >
                {tb.text}
              </div>
            ))}
          </div>

          {/* Spread Index and Navigation Indicator */}
          <div className="mt-4 flex items-center space-x-3 text-xs text-[#6b6660]">
            <span className="font-mono">Sheet {currentIdx + 1} of {project.spreads.length}</span>
            <span className="text-[#d4c1a3]">•</span>
            <span className="font-semibold text-[#111417]">{currentSpread.name}</span>
            {isHalfSheet && (
              <>
                <span className="text-[#d4c1a3]">•</span>
                <span className="text-[#7a2e33] font-medium font-mono">Half Sheet</span>
              </>
            )}
          </div>
        </div>

        {/* Next Arrow */}
        <button
          onClick={handleNext}
          disabled={currentIdx === project.spreads.length - 1}
          className="p-3 rounded-full bg-[#ffffff] hover:bg-[#f2ede4] text-[#111417] disabled:opacity-20 border border-[#d4c1a3] transition-all shadow-xl z-20"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      </div>

      {/* Bottom Client Review & Approval Dock */}
      <div className="h-20 bg-[#ffffff] border-t border-[#e8dfd8] px-8 flex items-center justify-between shadow-md">
        {/* Left: Client Approval Buttons */}
        <div className="flex items-center space-x-3">
          <button
            onClick={() => onUpdateSpreadStatus(currentIdx, 'approved')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-medium text-xs transition-all ${
              currentSpread.status === 'approved'
                ? 'bg-emerald-600 text-white shadow-md'
                : 'bg-[#f9f8f6] hover:bg-emerald-50 text-[#111417] hover:text-emerald-700 border border-[#d4c1a3]'
            }`}
          >
            <CheckCircle className="w-4 h-4 text-emerald-500" />
            <span>Approve This Sheet</span>
          </button>

          <button
            onClick={() => onUpdateSpreadStatus(currentIdx, 'needs_review')}
            className={`flex items-center space-x-2 px-4 py-2 rounded-xl font-medium text-xs transition-all ${
              currentSpread.status === 'needs_review'
                ? 'bg-amber-600 text-white shadow-md'
                : 'bg-[#f9f8f6] hover:bg-amber-50 text-[#111417] hover:text-amber-700 border border-[#d4c1a3]'
            }`}
          >
            <MessageSquare className="w-4 h-4 text-amber-500" />
            <span>Request Changes</span>
          </button>
        </div>

        {/* Right: Instant Client Note Submission */}
        <div className="flex items-center space-x-2 w-96">
          <input
            type="text"
            placeholder="Type your feedback for this sheet..."
            value={newComment}
            onChange={(e) => setNewComment(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && newComment.trim()) {
                onAddSpreadComment(currentIdx, newComment.trim());
                setNewComment('');
              }
            }}
            className="flex-1 bg-[#fdfcfb] border border-[#e8dfd8] text-xs text-[#111417] placeholder-[#8c867e] px-3.5 py-2 rounded-xl focus:outline-none focus:border-[#7a2e33]"
          />
          <button
            disabled={!newComment.trim()}
            onClick={() => {
              if (newComment.trim()) {
                onAddSpreadComment(currentIdx, newComment.trim());
                setNewComment('');
              }
            }}
            className="bg-[#7a2e33] hover:bg-[#5a2226] disabled:opacity-40 text-white px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1 transition-colors"
          >
            <Send className="w-3.5 h-3.5" />
            <span>Send</span>
          </button>
        </div>
      </div>
    </div>
  );
};
