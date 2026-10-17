import React, { useState, useMemo, useEffect } from 'react';
import {
  X,
  MessageCircle,
  Copy,
  Check,
  BookOpen,
  Image as ImageIcon,
  Calculator,
  Send,
  Phone,
} from 'lucide-react';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { renderWhatsAppMessage } from '../../utils/whatsappTemplates';

export interface ClientSelectionFollowUpModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientName: string;
  clientPhone?: string;
  deliverableTitle: string;
  serviceType: string;
  category?: string;
  studioName?: string;
}

export const ClientSelectionFollowUpModal: React.FC<ClientSelectionFollowUpModalProps> = ({
  isOpen,
  onClose,
  clientName,
  clientPhone = '',
  deliverableTitle,
  serviceType,
  studioName = 'BAAWARAY FILMS',
}) => {
  // Detect default selection type from title/service
  const initialType = useMemo<'album' | 'frame'>(() => {
    const combined = `${deliverableTitle} ${serviceType}`.toLowerCase();
    if (combined.includes('frame') || combined.includes('canvas') || combined.includes('print')) {
      return 'frame';
    }
    return 'album';
  }, [deliverableTitle, serviceType]);

  const [selectionType, setSelectionType] = useState<'album' | 'frame'>(initialType);

  // Sync selectionType when modal opens or deliverable changes
  useEffect(() => {
    setSelectionType(initialType);
  }, [initialType, isOpen]);

  // Recipient state
  const [recipientPhone, setRecipientPhone] = useState(clientPhone);
  const [recipientName, setRecipientName] = useState(clientName);
  const [galleryLink, setGalleryLink] = useState('');

  // Album specific state: Formula = sheets * photosPerSheet
  // Extract sheets count from deliverableTitle if available (e.g. "40Sheets" -> 40)
  const extractedSheets = useMemo(() => {
    const match = `${deliverableTitle} ${serviceType}`.match(/(\d+)\s*(?:sheet|sh|p)/i);
    return match && match[1] ? Number(match[1]) : 40;
  }, [deliverableTitle, serviceType]);

  const [sheetsCount, setSheetsCount] = useState<number>(extractedSheets);
  const [photosPerSheet, setPhotosPerSheet] = useState<number>(5); // Default 5 photos per sheet

  // Frame specific state
  // Batra Ji has 4 frames
  const extractedFrameSize = useMemo(() => {
    const match = `${deliverableTitle} ${serviceType}`.match(/(\d+\s*[x×]\s*\d+\s*(?:inches|inch|in)?)/i);
    return match && match[1] ? match[1].trim() : '20 × 30 Inches';
  }, [deliverableTitle, serviceType]);

  const [frameCount, setFrameCount] = useState<number>(4);
  const [frameSize, setFrameSize] = useState<string>(extractedFrameSize);

  const [copied, setCopied] = useState(false);

  // Calculate total album photos required: Sheets * PhotosPerSheet (e.g. 40 * 5 = 200)
  const totalAlbumPhotos = useMemo(() => {
    return Math.max(0, (sheetsCount || 0) * (photosPerSheet || 0));
  }, [sheetsCount, photosPerSheet]);

  // Generate WhatsApp message preview
  const messageText = useMemo(() => {
    if (selectionType === 'album') {
      return renderWhatsAppMessage(
        'client_album_selection',
        {
          clientName: recipientName.trim() || clientName,
          projectName: recipientName.trim() || clientName,
          sheetsCount: sheetsCount,
          photosRequired: totalAlbumPhotos,
          link: galleryLink.trim(),
        },
        studioName
      );
    } else {
      return renderWhatsAppMessage(
        'client_frame_selection',
        {
          clientName: recipientName.trim() || clientName,
          projectName: recipientName.trim() || clientName,
          frameCount: frameCount,
          frameSize: frameSize.trim(),
          link: galleryLink.trim(),
        },
        studioName
      );
    }
  }, [
    selectionType,
    recipientName,
    clientName,
    sheetsCount,
    totalAlbumPhotos,
    frameCount,
    frameSize,
    galleryLink,
    studioName,
  ]);

  if (!isOpen) return null;

  const validPhone = toWhatsAppNumber(recipientPhone);
  const whatsappUrl = validPhone ? getWhatsAppUrl(validPhone, messageText) : null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(messageText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('Copied message text to clipboard');
    }
  };

  const handleSendWhatsApp = () => {
    if (!validPhone) {
      alert('Please enter a valid 10-digit client phone number.');
      return;
    }
    if (whatsappUrl) {
      window.open(whatsappUrl, '_blank');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-[#d4c1a3] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#7a2e33] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center text-white">
              {selectionType === 'album' ? (
                <BookOpen className="w-5 h-5 text-amber-300" />
              ) : (
                <ImageIcon className="w-5 h-5 text-purple-300" />
              )}
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Photo Selection Follow-Up
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-200 border border-emerald-400/30">
                  WhatsApp Direct
                </span>
              </h2>
              <p className="text-xs text-white/80">
                {clientName} · {deliverableTitle}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-white/80 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-xs text-[#111417]">
          {/* Mode Switch Tabs */}
          <div className="flex items-center gap-2 p-1 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]">
            <button
              type="button"
              onClick={() => setSelectionType('album')}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectionType === 'album'
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'text-[#6b6660] hover:text-[#111417]'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Album Selection (Sheets × 5)</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectionType('frame')}
              className={`flex-1 py-2 px-3 rounded-lg font-bold text-xs flex items-center justify-center gap-2 transition-all cursor-pointer ${
                selectionType === 'frame'
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'text-[#6b6660] hover:text-[#111417]'
              }`}
            >
              <ImageIcon className="w-3.5 h-3.5" />
              <span>Frame Selection (Screenshots)</span>
            </button>
          </div>

          {/* Type-Specific Parameter Cards */}
          {selectionType === 'album' ? (
            <div className="p-4 bg-amber-50/60 border border-amber-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-amber-900 flex items-center gap-1.5 text-xs">
                  <Calculator className="w-4 h-4 text-amber-700" />
                  Album Formula: Sheets × 5 = Photos Required
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-amber-200/80 text-amber-900">
                  {totalAlbumPhotos} Photos Needed
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                    Number of Sheets:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={sheetsCount}
                    onChange={(e) => setSheetsCount(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-950 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-amber-900 mb-1">
                    Photos per Sheet:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={photosPerSheet}
                    onChange={(e) => setPhotosPerSheet(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-amber-300 rounded-lg text-xs font-bold text-amber-950 focus:outline-none focus:border-amber-500"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1 flex flex-col justify-end">
                  <div className="p-1.5 bg-white border border-amber-300/80 rounded-lg text-center">
                    <span className="text-[10px] text-amber-800 font-medium block">Total Photos:</span>
                    <span className="text-sm font-extrabold text-amber-900">
                      {sheetsCount} × {photosPerSheet} = {totalAlbumPhotos}
                    </span>
                  </div>
                </div>
              </div>

              <p className="text-[11px] text-amber-800 leading-relaxed pt-1">
                ⭐ <strong>Instructions Included:</strong> Asks the client to star their favorite photos directly in the photo sharing app to reach <strong>{totalAlbumPhotos} photos</strong>.
              </p>
            </div>
          ) : (
            <div className="p-4 bg-purple-50/60 border border-purple-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-bold text-purple-900 flex items-center gap-1.5 text-xs">
                  <ImageIcon className="w-4 h-4 text-purple-700" />
                  Wall Frame Selection Details
                </span>
                <span className="text-[11px] font-bold px-2 py-0.5 rounded-md bg-purple-200/80 text-purple-900">
                  {frameCount} Frames
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div>
                  <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                    Number of Frames:
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={frameCount}
                    onChange={(e) => setFrameCount(Number(e.target.value) || 0)}
                    className="w-full px-2.5 py-1.5 bg-white border border-purple-300 rounded-lg text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-purple-900 mb-1">
                    Frame Size / Specifications:
                  </label>
                  <input
                    type="text"
                    value={frameSize}
                    onChange={(e) => setFrameSize(e.target.value)}
                    placeholder="e.g. 20 × 30 Inches"
                    className="w-full px-2.5 py-1.5 bg-white border border-purple-300 rounded-lg text-xs font-bold text-purple-950 focus:outline-none focus:border-purple-500"
                  />
                </div>
              </div>

              <p className="text-[11px] text-purple-800 leading-relaxed pt-1">
                📸 <strong>Instructions Included:</strong> Tells the client to pick their {frameCount} favorite photos from the photo sharing app and share <strong>screenshots</strong> directly in WhatsApp.
              </p>
            </div>
          )}

          {/* Client Recipient & Gallery Link Details */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl">
            <div>
              <label className="block text-[11px] font-bold text-[#111417] mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3 text-[#7a2e33]" />
                Client WhatsApp Number:
              </label>
              <input
                type="text"
                value={recipientPhone}
                onChange={(e) => setRecipientPhone(e.target.value)}
                placeholder="+919876543210"
                className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs font-mono font-bold focus:outline-none focus:border-[#7a2e33]"
              />
              {!validPhone && recipientPhone && (
                <span className="text-[10px] text-red-600 mt-0.5 block">
                  Please enter 10-digit number with country code (e.g. +91...)
                </span>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-[#111417] mb-1">
                Optional Gallery / App Link:
              </label>
              <input
                type="text"
                value={galleryLink}
                onChange={(e) => setGalleryLink(e.target.value)}
                placeholder="https://kwikpic.com/... or online link"
                className="w-full px-2.5 py-1.5 bg-white border border-[#d4c1a3] rounded-lg text-xs focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
          </div>

          {/* Live WhatsApp Message Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-[#111417] flex items-center gap-1.5">
                <MessageCircle className="w-3.5 h-3.5 text-[#25D366]" />
                WhatsApp Message Preview
              </span>
              <span className="text-[10px] text-[#6b6660]">
                Ready to send via WhatsApp Web / App
              </span>
            </div>

            <div className="p-3.5 bg-[#efeae2] border border-[#d4c1a3] rounded-xl font-sans text-xs whitespace-pre-wrap leading-relaxed text-[#111417] shadow-inner max-h-56 overflow-y-auto">
              {messageText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl hover:bg-stone-50 cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-[#111417] bg-white border border-[#d4c1a3] rounded-xl hover:bg-stone-50 cursor-pointer shadow-2xs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'Copied!' : 'Copy Text'}</span>
            </button>

            <button
              type="button"
              onClick={handleSendWhatsApp}
              disabled={!validPhone}
              className="inline-flex items-center gap-2 px-5 py-2 bg-[#25D366] hover:bg-[#20bd5a] disabled:opacity-50 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send on WhatsApp</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
