import React, { useState } from 'react';
import {
  Share2,
  FolderOpen,
  Send,
  Phone,
  CheckCircle2,
  Sparkles,
  MessageCircle,
  Plus,
  Clock,
  Film,
  Check,
  ExternalLink,
  ShieldCheck,
  ChevronRight,
  Eye,
  RefreshCw,
  Tv
} from 'lucide-react';
import { PrivateReviewPortal, type TimecodeComment } from './PrivateReviewPortal';

export const ReviewManagerView: React.FC = () => {
  const [selectedClient, setSelectedClient] = useState('Dikshant & Moreen');
  const [clientPhone, setClientPhone] = useState('+91 98887 44434');
  const [deliverableTitle, setDeliverableTitle] = useState('Wedding Highlight Film (Cinematic 4K)');
  const [cutVersion, setCutVersion] = useState('Cut 1 (V001)');
  const [renderFilePath, setRenderFilePath] = useState(
    '/Volumes/SanDisk_2TB/261028_Dikshant_Moreen/04_RENDER_DELIVERABLES/02_Highlight_Film/Highlight_Film_Cut1.mp4'
  );

  const [isPublished, setIsPublished] = useState(true);
  const [reviewToken] = useState('rev_dikshant_moreen_cut1');
  const [showPortalPreview, setShowPortalPreview] = useState(false);

  // Live comments from family
  const [comments, setComments] = useState<TimecodeComment[]>([
    {
      id: 'c1',
      timeSeconds: 28,
      timecodeFormatted: '00:28',
      authorName: 'Moreen (Bride)',
      comment: 'Please replace the wide angle with CAM B close-up during the ring exchange.',
      timestamp: 'Today at 11:30 AM',
      resolved: false
    },
    {
      id: 'c2',
      timeSeconds: 72,
      timecodeFormatted: '01:12',
      authorName: 'Dikshant (Groom)',
      comment: 'Audio transition here is a bit sudden. Can we crossfade the background music more gently?',
      timestamp: 'Today at 12:15 PM',
      resolved: false
    }
  ]);

  const reviewPortalUrl = `https://baawaray.com/review/${reviewToken}`;

  const toggleResolved = (id: string): void => {
    setComments(prev =>
      prev.map(c => (c.id === id ? { ...c, resolved: !c.resolved } : c))
    );
  };

  const openWhatsAppShare = (): void => {
    const text = `Hi ${selectedClient}!\n\nYour ${deliverableTitle} (${cutVersion}) is now ready for private family review on our luxury portal.\n\n✨ Watch in high fidelity and tap anywhere on the video to leave notes for our team:\n${reviewPortalUrl}\n\nWarm regards,\nBaawaray Films • Post-Production Studio`;
    const cleanPhone = clientPhone.replace(/\D/g, '');
    const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
  };

  return (
    <div className="w-full max-w-6xl mx-auto space-y-6 text-[#1A1814]">
      {/* Top Banner: Replaced Dropbox with Private Review Portal */}
      <div className="bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-serif font-bold text-[#1A1814]">Baawaray Private Family Review Hub</h3>
            <span className="text-[10px] bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-full font-semibold">
              Dropbox Skipped • Direct Atelier Portal Active
            </span>
          </div>
          <p className="text-xs text-[#6B655C] mt-1 font-sans">
            Deliverables are published directly to our private review portal with smooth faststart MP4 streaming and interactive timecoded commenting for the family.
          </p>
        </div>

        <button
          onClick={() => setShowPortalPreview(true)}
          className="px-3.5 py-2 bg-[#FAF8F5] hover:bg-[#F3EFEA] text-xs font-semibold text-[#1A1814] rounded-xl flex items-center gap-2 transition-all border border-[#D6D0C6] cursor-pointer shadow-xs"
        >
          <Eye size={14} className="text-[#C8860B]" />
          <span>Preview Portal as Client</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Publish & Review Link Configuration */}
        <div className="lg:col-span-5 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl space-y-4">
          <div className="border-b border-[#E5DFD7] pb-3">
            <h4 className="text-sm font-serif font-bold text-[#1A1814] flex items-center gap-2">
              <Film size={16} className="text-[#9B2226]" />
              <span>Active Review Package</span>
            </h4>
          </div>

          <div className="space-y-3">
            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Client Couple</label>
              <input
                type="text"
                value={selectedClient}
                onChange={e => setSelectedClient(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Deliverable &amp; Version</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={deliverableTitle}
                  onChange={e => setDeliverableTitle(e.target.value)}
                  className="col-span-2 bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
                />
                <input
                  type="text"
                  value={cutVersion}
                  onChange={e => setCutVersion(e.target.value)}
                  className="bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#9B2226] font-semibold text-center focus:outline-none focus:border-[#9B2226]"
                />
              </div>
            </div>

            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Rendered Cut (.mp4)</label>
              <input
                type="text"
                value={renderFilePath}
                onChange={e => setRenderFilePath(e.target.value)}
                className="w-full bg-[#FAF8F5] border border-[#D6D0C6] rounded-xl px-3 py-2 text-[11px] font-mono text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#6B655C] font-medium block mb-1">Client WhatsApp Number</label>
              <input
                type="text"
                value={clientPhone}
                onChange={e => setClientPhone(e.target.value)}
                className="w-full bg-[#FFFFFF] border border-[#D6D0C6] rounded-xl px-3 py-2 text-xs text-[#1A1814] focus:outline-none focus:border-[#9B2226]"
              />
            </div>
          </div>

          {/* Shareable Link Box */}
          <div className="p-3.5 bg-[#FAF8F5] border border-[#E5DFD7] rounded-xl space-y-2">
            <span className="text-[10px] text-[#6B655C] uppercase tracking-wider block font-semibold font-mono">
              Live Client Review URL (No Login Required)
            </span>
            <div className="flex items-center justify-between text-xs font-mono text-[#9B2226] font-semibold bg-[#FFFFFF] p-2.5 rounded-lg border border-[#E5DFD7] break-all">
              <span>{reviewPortalUrl}</span>
            </div>
          </div>

          <button
            onClick={openWhatsAppShare}
            className="w-full py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer"
          >
            <MessageCircle size={15} />
            <span>Send Private Review Link via WhatsApp</span>
          </button>
        </div>

        {/* Right Column: Live Timecoded Client Feedback */}
        <div className="lg:col-span-7 bg-[#FFFFFF] border border-[#E5DFD7] shadow-sm p-5 rounded-2xl flex flex-col">
          <div className="flex items-center justify-between border-b border-[#E5DFD7] pb-3 mb-4">
            <div className="flex items-center gap-2 text-sm font-serif font-bold text-[#1A1814]">
              <Clock size={16} className="text-[#C8860B]" />
              <span>Live Family Timecoded Feedback</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#6B655C] bg-[#FAF8F5] px-2.5 py-0.5 rounded-full border border-[#E5DFD7] font-medium">
                {comments.filter(c => !c.resolved).length} Pending Changes
              </span>
            </div>
          </div>

          <div className="space-y-3 flex-1 overflow-y-auto max-h-[380px] pr-1">
            {comments.map(c => (
              <div
                key={c.id}
                className={`p-3.5 rounded-xl border transition-all flex items-start justify-between ${
                  c.resolved
                    ? 'bg-[#FAF8F5]/60 border-[#E5DFD7] opacity-60'
                    : 'bg-[#FAF8F5] border-[#E5DFD7]'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-bold text-[#9B2226] bg-[#FFFFFF] border border-[#D6D0C6] px-2 py-0.5 rounded">
                      {c.timecodeFormatted}
                    </span>
                    <span className="text-xs font-semibold text-[#1A1814]">{c.authorName}</span>
                    <span className="text-[10px] text-[#6B655C] font-mono">{c.timestamp}</span>
                  </div>
                  <p className="text-xs text-[#1A1814] leading-relaxed pl-0.5 font-sans">{c.comment}</p>
                </div>

                <button
                  onClick={() => toggleResolved(c.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    c.resolved
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-[#FFFFFF] hover:bg-[#FAF8F5] text-[#6B655C] border border-[#D6D0C6] shadow-xs'
                  }`}
                >
                  <Check size={12} />
                  <span>{c.resolved ? 'Resolved' : 'Mark Done'}</span>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-[#E5DFD7] flex items-center justify-between">
            <span className="text-[11px] text-[#6B655C] font-sans">
              Once all changes are applied in Premiere/Resolve:
            </span>
            <button
              onClick={() => {
                setCutVersion('Cut 2 (V002)');
                alert('Advanced to Cut 2 (V002). Ready to export and publish fresh version!');
              }}
              className="px-3.5 py-1.5 sindoor-gradient-btn text-xs font-semibold text-white rounded-lg transition-all cursor-pointer shadow-xs"
            >
              Advance to Cut 2 (V002) →
            </button>
          </div>
        </div>
      </div>

      {/* Modal for Client Portal Preview */}
      {showPortalPreview && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-6 overflow-y-auto">
          <div className="w-full max-w-5xl bg-[#FBFAF7] border border-[#E5DFD7] rounded-3xl p-6 relative shadow-2xl">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-[#E5DFD7]">
              <div className="flex items-center gap-2 text-xs font-semibold text-[#C8860B]">
                <ShieldCheck size={16} />
                <span>Client Family Preview Mode (What Dikshant &amp; Moreen See)</span>
              </div>
              <button
                onClick={() => setShowPortalPreview(false)}
                className="px-3 py-1 bg-[#FFFFFF] hover:bg-[#FAF8F5] text-xs font-semibold rounded-lg text-[#1A1814] border border-[#D6D0C6] cursor-pointer shadow-xs"
              >
                Close Preview [ESC]
              </button>
            </div>

            <PrivateReviewPortal
              clientName={selectedClient}
              deliverableTitle={deliverableTitle}
              cutVersion={cutVersion}
              initialComments={comments}
              onAddComment={comm => setComments(prev => [...prev, comm])}
              onApproveCut={() => alert('Family marked this cut as Approved!')}
            />
          </div>
        </div>
      )}
    </div>
  );
};
