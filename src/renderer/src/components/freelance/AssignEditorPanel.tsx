import React, { useMemo, useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, TeamMember } from '../../types';
import { calculateEditorWorkloads } from '../../utils/editorCapacity';
import { isDeliverablesTeamMember, isSalariedMember } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { renderWhatsAppMessage } from '../../utils/whatsappTemplates';
import {
  X,
  User,
  UserCheck,
  CheckCircle2,
  AlertCircle,
  HardDrive,
  Copy,
  ExternalLink,
  MessageCircle,
} from 'lucide-react';

interface AssignEditorPanelProps {
  isOpen: boolean;
  onClose: () => void;
  job: FreelanceJob | null;
}

export const AssignEditorPanel: React.FC<AssignEditorPanelProps> = ({
  isOpen,
  onClose,
  job,
}) => {
  const {
    team,
    freelanceJobs,
    updateFreelanceJob,
    studioSettings,
  } = useApp();

  // Editor Assignment mode ('in_house' team roster cards vs 'freelancer' manual external inputs)
  const [assignmentMode, setAssignmentMode] = useState<'in_house' | 'freelancer'>('in_house');
  const [editorMemberId, setEditorMemberId] = useState<number | undefined>(
    job?.editorMemberId
  );
  const [editorName, setEditorName] = useState<string>(job?.editorName || '');
  const [editorPhone, setEditorPhone] = useState<string>(job?.editorPhone || '');
  const [editorEmail, setEditorEmail] = useState<string>(job?.editorEmail || '');

  // Instructions
  const [editingInstructions, setEditingInstructions] = useState<string>(
    job?.editingInstructions || ''
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [rawDataLink, setRawDataLink] = useState<string>(job?.rawDataLink || '');
  const [copiedLink, setCopiedLink] = useState(false);

  // Reset/sync draft when a new job is selected
  useEffect(() => {
    if (!job) return;
    setRawDataLink(job.rawDataLink || '');

    // Resolve whether the editor belongs to the team roster
    let matchedMember: TeamMember | undefined = undefined;
    if (job.editorMemberId !== undefined) {
      matchedMember = team.find(m => m.id === job.editorMemberId);
    }
    if (!matchedMember && job.editorName) {
      matchedMember = team.find(
        m => m.name.toLowerCase().trim() === job.editorName?.toLowerCase().trim()
      );
    }
    if (!matchedMember && job.editorPhone) {
      const cleanPhone = job.editorPhone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        matchedMember = team.find(
          m => m.phone && m.phone.replace(/\D/g, '').endsWith(cleanPhone.slice(-10))
        );
      }
    }

    if (matchedMember) {
      // Editor is a member of the team roster
      setAssignmentMode('in_house');
      setEditorMemberId(matchedMember.id);
      setEditorName(matchedMember.name);
      setEditorPhone(matchedMember.phone || '');
      setEditorEmail(matchedMember.email || '');
    } else if (job.editorName) {
      // Editor is assigned as an external freelancer not on the team roster
      setAssignmentMode('freelancer');
      setEditorMemberId(undefined);
      setEditorName(job.editorName || '');
      setEditorPhone(job.editorPhone || '');
      setEditorEmail(job.editorEmail || '');
    } else {
      // Unassigned job: default to Team Roster
      setAssignmentMode('in_house');
      setEditorMemberId(undefined);
      setEditorName('');
      setEditorPhone('');
      setEditorEmail('');
    }

    setEditingInstructions(job.editingInstructions || '');
    setError('');
  }, [job, team]);

  // Workload calculations for deliverables team
  const assignableEditors = useMemo(() => {
    return team.filter(
      m =>
        m.active !== false &&
        (isDeliverablesTeamMember(m) ||
          m.id === editorMemberId ||
          m.id === job?.editorMemberId ||
          (job?.editorName && m.name.toLowerCase().trim() === job.editorName.toLowerCase().trim()))
    );
  }, [team, editorMemberId, job?.editorMemberId, job?.editorName]);

  const workloads = useMemo(
    () => calculateEditorWorkloads(freelanceJobs, team),
    [freelanceJobs, team]
  );
  const workloadMap = useMemo(
    () => new Map(workloads.map(w => [w.memberId, w])),
    [workloads]
  );

  // Selected in-house editor member
  const selectedMember = useMemo(() => {
    if (assignmentMode !== 'in_house' || editorMemberId === undefined) return undefined;
    return team.find(m => m.id === editorMemberId);
  }, [assignmentMode, editorMemberId, team]);

  if (!isOpen || !job) return null;

  const handleSelectInHouseEditor = (member: TeamMember) => {
    setEditorMemberId(member.id);
    setEditorName(member.name);
    setEditorPhone(member.phone || '');
    setEditorEmail(member.email || '');
    setError('');
  };

  const handleCopyLink = () => {
    if (!rawDataLink) return;
    navigator.clipboard.writeText(rawDataLink);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2000);
  };

  const handleSaveAndAssign = async (sendWhatsApp: boolean = false) => {
    let finalName = '';
    let finalPhone = '';
    let finalEmail = '';
    let finalAssignedType: 'in_house' | 'freelancer' = 'freelancer';
    let finalMemberId: number | undefined = undefined;

    if (assignmentMode === 'in_house') {
      if (editorMemberId === undefined || !selectedMember) {
        setError('Please select an in-house editor from the team list.');
        return;
      }
      finalMemberId = selectedMember.id;
      finalName = selectedMember.name;
      finalPhone = selectedMember.phone || '';
      finalEmail = selectedMember.email || '';
      finalAssignedType = isSalariedMember(selectedMember) ? 'in_house' : 'freelancer';
    } else {
      if (!editorName.trim()) {
        setError('Please enter the freelancer editor name.');
        return;
      }
      finalMemberId = undefined;
      finalName = editorName.trim();
      finalPhone = editorPhone.trim();
      finalEmail = editorEmail.trim();
      finalAssignedType = 'freelancer';
    }

    setError('');
    setIsSubmitting(true);

    try {
      const updates: Partial<FreelanceJob> = {
        assignedType: finalAssignedType,
        editorMemberId: finalMemberId,
        editorName: finalName,
        editorPhone: finalPhone,
        editorEmail: finalEmail,
        rawDataLink: rawDataLink.trim(),
        editingInstructions: editingInstructions.trim(),
      };

      // Advance stage to sent_to_editor if still in intake/unassigned
      if (job.stage === 'data_received' || job.stage === 'pending_assignment') {
        updates.stage = 'sent_to_editor';
      }

      await updateFreelanceJob(job.id, updates, `Assigned editor ${finalName}`);

      if (sendWhatsApp && finalPhone) {
        const phone = toWhatsAppNumber(finalPhone) || '';
        const text = encodeURIComponent(
          renderWhatsAppMessage(
            'editor_assign',
            {
              editorName: finalName,
              projectName: job.title,
              jobCode: job.jobCode,
              serviceType: job.serviceType,
              dueDate: job.dueDate || '',
              link: rawDataLink.trim(),
              referenceLink: job.referenceLink || '',
              instructions: editingInstructions.trim(),
            },
            studioSettings?.studioName || 'Baawaray Films'
          )
        );
        window.open(getWhatsAppUrl(phone, text), '_blank');
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to assign editor:', err);
      setError(err.message || 'Failed to save editor assignment.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white w-full max-w-2xl h-full shadow-2xl flex flex-col border-l border-[#d4c1a3]">
        {/* Header */}
        <div className="px-6 py-4 bg-[#f9f8f6] border-b border-[#d4c1a3] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-[#7a2e33] text-white flex items-center justify-center shadow-xs">
              <UserCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold font-serif text-[#111417]">
                  Assign Editor
                </h3>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-[#d4c1a3]/40 text-[#7a2e33] border border-[#d4c1a3]">
                  {job.jobCode}
                </span>
              </div>
              <p className="text-[11px] text-[#6b6660]">
                Assign qualified editor and dispatch editing brief.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-[#6b6660] hover:text-[#7a2e33] rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
            title="Close Panel"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Project & Footage Context Card */}
          <div className="bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl p-4 space-y-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <span className="text-[10px] uppercase font-bold text-[#6b6660] tracking-wider">
                  Deliverable & Client
                </span>
                <h4 className="text-sm font-bold text-[#111417] leading-snug">
                  {job.title}
                </h4>
                <div className="flex items-center gap-2 mt-1 text-xs text-[#6b6660]">
                  <span className="font-semibold text-[#7a2e33]">{job.serviceType}</span>
                  <span>·</span>
                  <span>{job.clientName}</span>
                </div>
              </div>

              {/* Scanned footage indicator */}
              {(job.rawDurationHours !== undefined || job.rawDurationMinutes !== undefined || job.rawPhotoCount !== undefined) && (
                <div className="text-right shrink-0 bg-white px-2.5 py-1.5 rounded-xl border border-[#d4c1a3]/60 shadow-2xs">
                  <div className="text-[9px] uppercase font-bold text-[#6b6660]">Scanned Footage</div>
                  <div className="text-xs font-bold text-[#111417]">
                    {job.rawDurationHours ? `${job.rawDurationHours}h ` : ''}
                    {job.rawDurationMinutes ? `${job.rawDurationMinutes}m ` : ''}
                    {job.rawPhotoCount ? `${job.rawPhotoCount} photos` : ''}
                  </div>
                </div>
              )}
            </div>

            {/* Raw Footage Link Bar */}
            <div className="pt-2 border-t border-[#d4c1a3]/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase font-bold text-[#6b6660] flex items-center gap-1">
                  <HardDrive className="w-3.5 h-3.5 text-[#7a2e33]" />
                  <span>Raw Footage / Project Link</span>
                </span>
                {rawDataLink.trim() && (
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handleCopyLink}
                      className="p-1 text-[#6b6660] hover:text-[#111417] rounded hover:bg-stone-200 transition-colors"
                      title="Copy Raw Data Link"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a
                      href={rawDataLink.trim()}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1 text-[#6b6660] hover:text-[#7a2e33] rounded hover:bg-stone-200 transition-colors"
                      title="Open Raw Data Link"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                )}
              </div>
              <input
                type="url"
                value={rawDataLink}
                onChange={e => setRawDataLink(e.target.value)}
                placeholder="Paste Google Drive, Dropbox, or B2 footage link here..."
                className="w-full px-3 py-1.5 text-xs font-mono rounded-xl border border-[#d4c1a3] bg-white text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
          </div>

          {/* Section: Select Editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
                <User className="w-4 h-4 text-[#7a2e33]" />
                <span>Select Editor</span>
              </label>

              {/* Toggle In-House vs Freelancer */}
              <div className="flex items-center bg-[#f9f8f6] p-0.5 rounded-lg border border-[#d4c1a3] text-[11px]">
                <button
                  type="button"
                  onClick={() => setAssignmentMode('in_house')}
                  className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    assignmentMode === 'in_house'
                      ? 'bg-[#7a2e33] text-white shadow-xs'
                      : 'text-[#6b6660] hover:text-[#111417]'
                  }`}
                >
                  In-House Team
                </button>
                <button
                  type="button"
                  onClick={() => setAssignmentMode('freelancer')}
                  className={`px-3 py-1 rounded-md font-bold transition-all cursor-pointer ${
                    assignmentMode === 'freelancer'
                      ? 'bg-[#7a2e33] text-white shadow-xs'
                      : 'text-[#6b6660] hover:text-[#111417]'
                  }`}
                >
                  External Freelancer
                </button>
              </div>
            </div>

            {assignmentMode === 'in_house' ? (
              /* In-House Deliverables Team List */
              <div className="space-y-2">
                <p className="text-[11px] text-[#6b6660]">
                  Deliverables editors with live capacity, active jobs, and schedule availability:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-56 overflow-y-auto pr-1">
                  {assignableEditors.length === 0 ? (
                    <div className="col-span-2 p-4 text-center bg-[#f9f8f6] rounded-xl border border-dashed border-[#d4c1a3] text-xs text-[#6b6660]">
                      No active deliverables team members found in Team settings.
                    </div>
                  ) : (
                    assignableEditors.map(member => {
                      const isSelected = editorMemberId === member.id;
                      const wl = workloadMap.get(member.id);
                      const activeJobs = wl?.activeJobsCount || 0;
                      const isSalaried = isSalariedMember(member);

                      return (
                        <div
                          key={member.id}
                          onClick={() => handleSelectInHouseEditor(member)}
                          className={`p-3 rounded-xl border transition-all cursor-pointer flex flex-col justify-between text-xs select-none ${
                            isSelected
                              ? 'bg-amber-50/70 border-[#7a2e33] shadow-xs'
                              : 'bg-white border-[#d4c1a3] hover:border-[#7a2e33]/50 hover:bg-[#f9f8f6]'
                          }`}
                        >
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="font-bold text-[#111417] truncate">
                              {member.name}
                            </span>
                            <span
                              className={`text-[9px] px-1.5 py-0.2 rounded font-semibold ${
                                isSalaried
                                  ? 'bg-blue-50 text-blue-700'
                                  : 'bg-amber-50 text-amber-800'
                              }`}
                            >
                              {isSalaried ? 'In-House' : 'Freelance'}
                            </span>
                          </div>

                          <div className="text-[10px] text-[#6b6660] truncate mb-2">
                            {member.role || 'Deliverables Editor'}
                          </div>

                          <div className="flex items-center justify-between text-[10px] pt-1.5 border-t border-[#d4c1a3]/40">
                            <span
                              className={`font-semibold ${
                                activeJobs === 0
                                  ? 'text-emerald-700'
                                  : activeJobs <= 2
                                  ? 'text-amber-800'
                                  : 'text-rose-700'
                              }`}
                            >
                              {activeJobs === 0
                                ? '✓ Available Now'
                                : `${activeJobs} active job${activeJobs > 1 ? 's' : ''}`}
                            </span>
                            {isSelected && (
                              <span className="text-emerald-700 font-bold flex items-center gap-0.5">
                                <CheckCircle2 className="w-3 h-3" />
                                Selected
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            ) : (
              /* External Freelancer Manual Inputs */
              <div className="p-4 bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl space-y-3">
                <div>
                  <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                    Freelancer Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Rahul Sharma"
                    value={editorName}
                    onChange={e => setEditorName(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                      WhatsApp Number *
                    </label>
                    <input
                      type="tel"
                      placeholder="e.g. 9876543210"
                      value={editorPhone}
                      onChange={e => setEditorPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-mono font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold text-[#6b6660] uppercase mb-1">
                      Email (Optional)
                    </label>
                    <input
                      type="email"
                      placeholder="e.g. editor@gmail.com"
                      value={editorEmail}
                      onChange={e => setEditorEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Section: Editing Instructions & Creative Brief */}
          <div className="p-4 bg-white border border-[#d4c1a3] rounded-2xl space-y-3 shadow-2xs">
            <label className="block text-xs font-bold text-[#111417]">
              Editing Instructions & Creative Notes
            </label>
            <textarea
              rows={4}
              placeholder="e.g. Couple prefers emotional cinematic cuts, warm golden tones. Use romantic instrumental tracks. Don't cut bride entry song short."
              value={editingInstructions}
              onChange={e => setEditingInstructions(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all resize-none"
            />
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white border border-[#d4c1a3] hover:bg-stone-50 text-[#111417] text-xs font-bold rounded-xl transition-all cursor-pointer"
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveAndAssign(false)}
              className="px-4 py-2 bg-white border border-[#d4c1a3] hover:border-[#7a2e33] text-[#7a2e33] text-xs font-bold rounded-xl transition-all cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Assign Only'}
            </button>

            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleSaveAndAssign(true)}
              className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
            >
              <MessageCircle className="w-4 h-4" />
              <span>{isSubmitting ? 'Saving...' : 'Assign & WhatsApp Brief'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
