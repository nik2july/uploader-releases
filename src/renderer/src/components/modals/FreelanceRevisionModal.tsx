import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { deliveryLinkOf } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { renderWhatsAppMessage } from '../../utils/whatsappTemplates';
import { FreelanceJob } from '../../types';
import { addDaysToDate } from '../../utils/formatters';
import { X, MessageSquare, Clock, Send, CheckCircle2, MessageCircle, AlertCircle } from 'lucide-react';
import { AudioRevisionRecorder } from '../common/AudioRevisionRecorder';

interface FreelanceRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: FreelanceJob;
  revisionType?: 'client' | 'internal';
}

export const FreelanceRevisionModal: React.FC<FreelanceRevisionModalProps> = ({
  isOpen,
  onClose,
  job,
  revisionType = 'client',
}) => {
  const { addFreelanceRevision, advanceFreelanceJobStage, studioSettings } = useApp();

  const isInternal = revisionType === 'internal' || job.stage === 'internal_review' || job.stage === 'internal_changes';
  const todayStr = new Date().toISOString().split('T')[0];
  const nextRoundNumber = (job.revisions || []).length + 1;
  const defaultDueDate = addDaysToDate(todayStr, 2);

  const [feedbackNotes, setFeedbackNotes] = useState('');
  const [timecodes, setTimecodes] = useState('');
  const [sharedImmediately, setSharedImmediately] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackNotes.trim()) {
      alert('Please enter revision / change notes.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (isInternal) {
        await addFreelanceRevision(job.id, {
          feedbackNotes: `[Internal Studio Review] ${feedbackNotes.trim()}`,
          timecodes: timecodes.trim() || undefined,
          sharedWithEditor: true,
          revisionType: 'internal',
        });
        await advanceFreelanceJobStage(job.id, 'internal_changes', `Internal changes requested by studio: ${feedbackNotes.trim().slice(0, 80)}`);
      } else {
        await addFreelanceRevision(job.id, {
          feedbackNotes: feedbackNotes.trim(),
          timecodes: timecodes.trim() || undefined,
          sharedWithEditor: sharedImmediately,
          revisionType: 'client',
        });
      }

      onClose();
    } catch (err) {
      console.error('Failed to log revision:', err);
      alert('Failed to log revision. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // WhatsApp quick launch for editor
  const handleShareWhatsAppToEditor = () => {
    const editorPhone = toWhatsAppNumber(job.editorPhone) || '';
    const text = isInternal ? (
      `*Studio OS - Internal Studio Feedback*\n` +
      `Project: *${job.title}* (${job.jobCode})\n` +
      (job.clientName ? `Client: ${job.clientName}\n\n` : '\n') +
      `*Studio Internal Changes & Notes:*\n${feedbackNotes}\n` +
      (timecodes ? `\n*Specific Timecodes:*\n${timecodes}\n` : '') +
      (deliveryLinkOf(job) ? `\n*Current Cut:* ${deliveryLinkOf(job)}\n` : '') +
      `\nPlease review and update the cut as soon as possible.`
    ) : (
      renderWhatsAppMessage(
        'editor_revisions',
        {
          editorName: job.editorName || 'Editor',
          clientName: job.clientName,
          projectName: job.title,
          jobCode: job.jobCode,
          roundNumber: String(nextRoundNumber),
          notes: feedbackNotes,
          timecodes: timecodes || '',
          dueDate: defaultDueDate,
          link: deliveryLinkOf(job) || '',
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(editorPhone, text), '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className={`flex items-center justify-between px-5 py-4 text-white ${isInternal ? 'bg-[#5c2a38]' : 'bg-[#7a2e33]'}`}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <MessageSquare className="w-4 h-4 text-amber-300" />
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">
                {isInternal ? 'Log Internal Studio Changes (To Editor)' : `Log Revision Round #${nextRoundNumber}`}
              </h3>
              <p className="text-[11px] text-white/80">
                {job.jobCode} • {job.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Turnaround / Context Notice */}
          {isInternal ? (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-indigo-700 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-900 leading-relaxed">
                <span className="font-bold">Internal Check:</span> The client has not seen this cut yet. Feedback logged here goes directly to the editor for studio QC refinement.
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-900 leading-relaxed">
                <span className="font-bold">Turnaround Schedule:</span> Revisions automatically set the due date to{' '}
                <span className="font-bold underline">{defaultDueDate}</span> (2 days turnaround from today).
              </div>
            </div>
          )}

          {/* Audio Recording & Gemini AI Extraction */}
          <AudioRevisionRecorder
            jobTitle={job.title}
            clientName={job.clientName}
            serviceType={job.serviceType}
            rawTextNotes={feedbackNotes}
            onExtracted={({ points, timecodes: extTimecodes }) => {
              setFeedbackNotes(prev => (prev.trim() ? `${prev.trim()}\n\n${points}` : points));
              if (extTimecodes) {
                setTimecodes(prev => (prev.trim() ? `${prev.trim()}, ${extTimecodes}` : extTimecodes));
              }
            }}
          />

          {/* Feedback Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#111417] mb-1">
              {isInternal ? 'Studio Owner Feedback & Corrections Needed *' : 'Client Feedback & Changes Required *'}
            </label>
            <textarea
              required
              rows={4}
              placeholder={
                isInternal
                  ? 'e.g. 1. Music transition into bridal entry is too sharp. 2. Color grading at 02:15 is underexposed. 3. Trim awkward silence at 04:10.'
                  : 'e.g. 1. Replace the first romantic track with a slow instrumental. 2. Remove blurry slow-mo clip. 3. Adjust skin tones in reception lighting.'
              }
              value={feedbackNotes}
              onChange={e => setFeedbackNotes(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />
          </div>

          {/* Specific Timecodes */}
          <div>
            <label className="block text-xs font-semibold text-[#111417] mb-1">
              Timecodes & Specific Cuts (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 00:45 (cut audio glitch), 01:30 (trim bride smile), 02:40 (fix title font)"
              value={timecodes}
              onChange={e => setTimecodes(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-mono text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />
          </div>

          {/* Option to advance stage (only for client revisions) */}
          {!isInternal && (
            <label className="flex items-center gap-2.5 p-3 bg-white rounded-xl border border-[#d4c1a3] cursor-pointer">
              <input
                type="checkbox"
                checked={sharedImmediately}
                onChange={e => setSharedImmediately(e.target.checked)}
                className="rounded text-[#7a2e33] focus:ring-[#7a2e33] w-4 h-4 accent-[#7a2e33]"
              />
              <div className="text-xs text-[#111417]">
                <span className="font-bold">Mark as Shared with Editor</span>
                <p className="text-[11px] text-[#6b6660]">
                  Advances workflow to "Changes with Editor" stage immediately
                </p>
              </div>
            </label>
          )}

          {/* Actions */}
          <div className="pt-2 flex items-center justify-between">
            {job.editorPhone ? (
              <button
                type="button"
                onClick={handleShareWhatsAppToEditor}
                disabled={!feedbackNotes.trim()}
                className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl transition-all cursor-pointer shadow-xs"
              >
                <MessageCircle className="w-3.5 h-3.5" />
                <span>Send to Editor on WhatsApp</span>
              </button>
            ) : <div />}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:bg-[#d4c1a3]/40 rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex items-center gap-1.5 px-5 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{isInternal ? 'Save Internal Notes' : 'Save Revision'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
