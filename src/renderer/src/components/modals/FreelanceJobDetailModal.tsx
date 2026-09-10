import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, FreelanceJobStage } from '../../types';
import { deliveryLinkOf, freelanceDueDate } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import {
  getFreelanceStageMeta,
  getDueDateStatus,
  addDaysToDate,
} from '../../utils/formatters';
import {
  X,
  Briefcase,
  User,
  Phone,
  Mail,
  Calendar,
  Clock,
  IndianRupee,
  Link as LinkIcon,
  ExternalLink,
  MessageCircle,
  FileText,
  Film,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  Plus,
  ShieldCheck,
  Edit3,
  Trash2,
  Send,
  History,
  Layers,
  Sparkles,
} from 'lucide-react';
import { FreelancePaymentModal } from './FreelancePaymentModal';
import { FreelanceRevisionModal } from './FreelanceRevisionModal';

interface FreelanceJobDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  jobId: string | null;
  onEditJob: (job: FreelanceJob) => void;
}

const STAGES_ORDER: FreelanceJobStage[] = [
  'data_received',
  'sent_to_editor',
  'draft_received',
  'sent_to_client',
  'changes_received',
  'changes_sent_to_editor',
  'final_delivered',
  'completed',
];

export const FreelanceJobDetailModal: React.FC<FreelanceJobDetailModalProps> = ({
  isOpen,
  onClose,
  jobId,
  onEditJob,
}) => {
  const {
    freelanceJobs,
    freelanceClients,
    advanceFreelanceJobStage,
    deleteFreelanceJob,
    updateFreelanceJob,
    freelanceJobPayment,
    freelanceJobEditorCost,
    setSelectedFreelanceClientId,
    setSelectedFreelanceEditorId,
    setActiveView,
  } = useApp();

  const [paymentModalType, setPaymentModalType] = useState<'client' | 'editor' | null>(null);
  const [isRevisionModalOpen, setIsRevisionModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'financials' | 'revisions' | 'links' | 'logs'>('overview');

  const job = freelanceJobs.find(j => j.id === jobId);

  if (!isOpen || !job) return null;

  /**
   * The one place this job's work is watched.
   *
   * Jobs logged before the link was made singular carry a draft link, a final link,
   * or both; the newest of those stands in until someone saves a delivery link, so an
   * old job's share buttons keep working.
   */
  const deliveryLink = deliveryLinkOf(job);

  const stageMeta = getFreelanceStageMeta(job.stage);
  const effectiveDueDate = freelanceDueDate(job);
  const dueStatus = getDueDateStatus(effectiveDueDate);

  // What the studio's account has actually covered on this job, rather than what was
  // typed onto the job itself — see freelanceJobPayment.
  const { paid: clientPaid, balance: clientBalance } = freelanceJobPayment(job);

  /**
   * The studio's number in the form WhatsApp needs.
   *
   * Read from the studio record rather than the job, because that is where the country
   * lives — the job only ever copied the digits, and ten digits do not say whether
   * they belong in Ludhiana or Toronto.
   */
  const clientWhatsAppNumber = (target: FreelanceJob): string => {
    const studio = target.freelanceClientId
      ? freelanceClients.find(c => c.id === target.freelanceClientId)
      : undefined;
    return toWhatsAppNumber(target.clientPhone, studio?.dialCode) || '';
  };

  const openStudioAccount = () => {
    if (!job.freelanceClientId) return;
    setSelectedFreelanceClientId(job.freelanceClientId);
    setActiveView('freelanceStudio');
    onClose();
  };
  // What this job cost in editor pay: whatever has been split onto it from that
  // editor's payouts. Nothing paid yet means no cost yet, not a debt of an agreed size.
  const editorCost = freelanceJobEditorCost(job);
  const netMargin = job.clientCharge - editorCost;

  const openEditorAccount = () => {
    if (job.editorMemberId === undefined) return;
    setSelectedFreelanceEditorId(job.editorMemberId);
    setActiveView('freelanceEditor');
    onClose();
  };
  const netCollectedProfit = clientPaid - editorCost;

  // WhatsApp helpers
  const handleShareDataWithEditor = () => {
    const phone = toWhatsAppNumber(job.editorPhone) || '';
    const text = encodeURIComponent(
      `*Studio OS - New Freelance Editing Project*\n` +
      `Project: *${job.title}* (${job.jobCode})\n` +
      `Service: ${job.serviceType}\n` +
      `*Due Date:* ${job.dueDate}\n` +
      `\n*Raw Footage:* Available directly in Desktop App\n` +
      (job.referenceLink ? `*Reference Moodboard:* ${job.referenceLink}\n` : '') +
      (job.editingInstructions ? `\n*Brief:* ${job.editingInstructions}\n` : '') +
      `\nPlease log in to your Studio OS Desktop App to download the raw footage bundle.`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_editor', 'Notified editor via WhatsApp to download from Desktop App');
  };

  const handleShareDraftWithClient = () => {
    const phone = clientWhatsAppNumber(job);
    const text = (
      `*Studio OS - Draft Video for Review*\n` +
      `Hello ${job.clientName},\n` +
      `Your edit for *${job.title}* is ready for first review!\n\n` +
      (deliveryLink ? `*Preview Link:* ${deliveryLink}\n\n` : '') +
      `Please watch and let us know if any feedback or changes are needed.\nThank you!`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_client', 'Shared draft link with client for review via WhatsApp');
  };

  const handleShareFinalWithClient = () => {
    const phone = clientWhatsAppNumber(job);
    const text = (
      `*Studio OS - Final Master Delivery*\n` +
      `Hello ${job.clientName},\n` +
      `The final master video for *${job.title}* is completely ready in full quality!\n\n` +
      (deliveryLink ? `*Master Download Link:* ${deliveryLink}\n\n` : '') +
      (clientBalance > 0 ? `*Pending Balance Due:* ₹${clientBalance.toLocaleString('en-IN')}\n\n` : '') +
      `It was a pleasure working on this project! ✨`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'final_delivered', 'Delivered final link to client via WhatsApp');
  };

  const handleSendPaymentReminder = () => {
    const phone = clientWhatsAppNumber(job);
    const text = (
      `*Studio OS - Payment Reminder*\n` +
      `Hello ${job.clientName},\n` +
      `This is a gentle reminder regarding the outstanding balance for *${job.title}* (${job.jobCode}).\n\n` +
      `*Total Project Fee:* ₹${job.clientCharge.toLocaleString('en-IN')}\n` +
      `*Amount Received:* ₹${clientPaid.toLocaleString('en-IN')}\n` +
      `*Balance Due:* ₹${clientBalance.toLocaleString('en-IN')}\n\n` +
      `Kindly arrange the transfer at your convenience. Thank you!`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
  };

  const handleDelete = () => {
    if (window.confirm(`Are you sure you want to delete Freelance Project "${job.title}" (${job.jobCode})?`)) {
      deleteFreelanceJob(job.id);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-5xl bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden my-8 max-h-[92vh] flex flex-col">
        {/* Top Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#7a2e33] text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <Briefcase className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/20 text-white font-mono text-xs font-bold rounded">
                  {job.jobCode}
                </span>
                <span className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${stageMeta.badgeClass}`}>
                  {stageMeta.label}
                </span>
              </div>
              <h2 className="text-base font-bold text-white mt-1 leading-snug">
                {job.title}
              </h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                onClose();
                onEditJob(job);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Edit Job</span>
            </button>
            <button
              onClick={handleDelete}
              className="p-2 text-rose-300 hover:text-white hover:bg-rose-900/40 rounded-xl transition-colors"
              title="Delete Job"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/*
          Stage as a dropdown, not a row of eight buttons.
          The stepper was a horizontal scroller: moving a job on meant finding the right
          button in a strip that ran off the edge of the screen, and clicking the wrong
          one silently moved the job somewhere else. A list you pick from says what the
          stages are, in order, and takes one tap on a phone.
        */}
        <div className="flex flex-wrap items-center gap-3 px-6 py-3 bg-white border-b border-[#d4c1a3]">
          <label className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
            Stage
          </label>
          <select
            value={job.stage}
            onChange={e => {
              const next = e.target.value as FreelanceJobStage;
              if (next === job.stage) return;
              advanceFreelanceJobStage(
                job.id,
                next,
                `Stage moved to ${getFreelanceStageMeta(next).label}`
              );
            }}
            className="px-3 py-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33] cursor-pointer"
          >
            {STAGES_ORDER.map((stageKey, idx) => (
              <option key={stageKey} value={stageKey}>
                {idx + 1}. {getFreelanceStageMeta(stageKey).label}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-2 flex-1 min-w-[160px]">
            <div className="h-1.5 flex-1 rounded-full bg-[#f9f8f6] overflow-hidden border border-[#d4c1a3]/60">
              <div
                className="h-full bg-[#7a2e33]"
                style={{
                  width: `${((STAGES_ORDER.indexOf(job.stage) + 1) / STAGES_ORDER.length) * 100}%`,
                }}
              />
            </div>
            <span className="text-[10px] font-semibold text-[#6b6660] shrink-0">
              Step {STAGES_ORDER.indexOf(job.stage) + 1} of {STAGES_ORDER.length}
            </span>
          </div>

          <span className="text-[11px] text-[#6b6660] italic basis-full sm:basis-auto">
            {stageMeta.description}
          </span>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-6 pt-3 border-b border-[#d4c1a3] bg-[#f9f8f6]">
          {[
            { id: 'overview', label: 'Work Overview & WhatsApp Actions', icon: Layers },
            { id: 'financials', label: 'Commercials & Payment Ledger', icon: IndianRupee },
            { id: 'revisions', label: `Revisions (${(job.revisions || []).length})`, icon: Clock },
            { id: 'links', label: 'Cloud Storage & Deliverables', icon: Film },
            { id: 'logs', label: 'Audit Trail', icon: History },
          ].map(tab => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-bold border-b-2 transition-all cursor-pointer ${
                  isActive
                    ? 'border-[#7a2e33] text-[#7a2e33] bg-white rounded-t-xl'
                    : 'border-transparent text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Quick WhatsApp Action Grid */}
              <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs">
                <div className="flex items-center justify-between pb-3 mb-4 border-b border-[#d4c1a3]/40">
                  <div className="flex items-center gap-2">
                    <MessageCircle className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#111417]">
                      1-Click WhatsApp Communication Hub
                    </h3>
                  </div>
                  <span className="text-[11px] text-[#6b6660]">
                    Share formatted links, briefs, and reminders directly
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {/* Action 1: Send Data to Editor */}
                  <div className="p-3.5 bg-emerald-50/50 border border-emerald-200 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold text-emerald-800">
                          1. To Editor
                        </span>
                        {job.sentToEditorDate && (
                          <span className="text-[10px] text-emerald-700 font-medium">
                            Sent {job.sentToEditorDate}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-emerald-950">Share Raw Data & Brief</h4>
                      <p className="text-[11px] text-emerald-800/80 mt-1 line-clamp-2">
                        Sends raw footage link, moodboard, due date ({job.dueDate})
                      </p>
                    </div>
                    <button
                      onClick={handleShareDataWithEditor}
                      disabled={!job.editorPhone}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send to Editor</span>
                    </button>
                  </div>

                  {/* Action 2: Send Draft to Client */}
                  <div className="p-3.5 bg-sky-50/50 border border-sky-200 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold text-sky-800">
                          2. To Client
                        </span>
                        {job.sentToClientDate && (
                          <span className="text-[10px] text-sky-700 font-medium">
                            Sent {job.sentToClientDate}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-sky-950">Share Draft for Review</h4>
                      <p className="text-[11px] text-sky-800/80 mt-1 line-clamp-2">
                        Sends preview link for client feedback
                      </p>
                    </div>
                    <button
                      onClick={handleShareDraftWithClient}
                      disabled={!job.clientPhone || !deliveryLink}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send Draft Link</span>
                    </button>
                  </div>

                  {/* Action 3: Log & Send Changes */}
                  <div className="p-3.5 bg-amber-50/50 border border-amber-200 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold text-amber-800">
                          3. To Editor
                        </span>
                        <span className="text-[10px] text-amber-700 font-bold">
                          {(job.revisions || []).length} Rounds
                        </span>
                      </div>
                      <h4 className="text-xs font-bold text-amber-950">Log Client Changes</h4>
                      <p className="text-[11px] text-amber-800/80 mt-1 line-clamp-2">
                        Logs feedback & sets 2-day turnaround due date
                      </p>
                    </div>
                    <button
                      onClick={() => setIsRevisionModalOpen(true)}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Log & Share Changes</span>
                    </button>
                  </div>

                  {/* Action 4: Send Final Master Link */}
                  <div className="p-3.5 bg-purple-50/50 border border-purple-200 rounded-xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] uppercase font-bold text-purple-800">
                          4. To Client
                        </span>
                        {job.finalDeliveredDate && (
                          <span className="text-[10px] text-purple-700 font-medium">
                            Delivered {job.finalDeliveredDate}
                          </span>
                        )}
                      </div>
                      <h4 className="text-xs font-bold text-purple-950">Send Final Master Link</h4>
                      <p className="text-[11px] text-purple-800/80 mt-1 line-clamp-2">
                        Sends final 4K master delivery & balance note
                      </p>
                    </div>
                    <button
                      onClick={handleShareFinalWithClient}
                      disabled={!job.clientPhone || !deliveryLink}
                      className="mt-3 w-full flex items-center justify-center gap-1.5 py-1.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition-all cursor-pointer shadow-2xs"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Deliver Master</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* 2-Column Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Client & Project Profile */}
                <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                      Client & Work Profile
                    </h3>
                    <span className="text-xs font-bold text-[#111417]">{job.serviceType}</span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Client / Studio Name:</span>
                      <span className="font-bold text-[#111417]">{job.clientName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Client WhatsApp:</span>
                      <span className="font-mono font-semibold text-[#111417]">{job.clientPhone || 'None'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#d4c1a3]/40">
                      <span className="text-[#6b6660]">Data Received Date:</span>
                      <span className="font-medium text-[#111417]">{job.dataReceivedDate}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Target Due Date:</span>
                      <span className={`font-bold ${dueStatus.color}`}>
                        {effectiveDueDate} ({dueStatus.label})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Assigned Editor Card */}
                <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                      Assigned Editor ({job.assignedType === 'in_house' ? 'In-House' : 'Freelancer'})
                    </h3>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        job.assignedType === 'in_house'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {job.assignedType === 'in_house' ? 'In-House Crew' : 'External Freelancer'}
                    </span>
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Editor Name:</span>
                      <span className="font-bold text-[#111417]">{job.editorName}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Editor WhatsApp:</span>
                      <span className="font-mono font-semibold text-[#111417]">{job.editorPhone || 'None'}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#d4c1a3]/40">
                      <span className="text-[#6b6660]">Editor Payout:</span>
                      <span className="font-bold text-[#111417]">
                        {job.assignedType === 'in_house'
                          ? 'Covered by salary'
                          : editorCost > 0
                          ? `₹${editorCost.toLocaleString('en-IN')}`
                          : 'Not paid yet'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Editor Paid So Far:</span>
                      <span className="font-bold text-emerald-700">₹{editorCost.toLocaleString('en-IN')}</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Editing Brief & Instructions */}
              {job.editingInstructions && (
                <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33] mb-2">
                    Editing Brief & Creative Notes
                  </h4>
                  <p className="text-xs text-[#111417] leading-relaxed whitespace-pre-wrap bg-[#f9f8f6] p-3 rounded-lg border border-[#d4c1a3]/60 font-sans">
                    {job.editingInstructions}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Financials & Payment Ledgers */}
          {activeTab === 'financials' && (
            <div className="space-y-6">
              {/* Commercial Metrics Grid */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-[#6b6660]">Total Client Charge</span>
                  <div className="text-lg font-extrabold text-[#111417] mt-0.5">
                    ₹{job.clientCharge.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    Received: ₹{clientPaid.toLocaleString('en-IN')}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-[#6b6660]">Client Balance Due</span>
                  <div className="text-lg font-extrabold text-[#7a2e33] mt-0.5">
                    ₹{clientBalance.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] font-medium text-[#6b6660] mt-1">
                    Status: <span className="uppercase font-bold">{job.clientPaymentStatus}</span>
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-[#6b6660]">Editor Payout</span>
                  <div className="text-lg font-extrabold text-[#111417] mt-0.5">
                    ₹{editorCost.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-emerald-700 font-semibold mt-1">
                    {job.assignedType === 'in_house' ? 'Covered by salary' : 'Paid on this job'}
                  </div>
                </div>

                <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
                  <span className="text-[10px] uppercase font-bold text-[#6b6660]">Studio Net Margin</span>
                  <div className="text-lg font-extrabold text-emerald-700 mt-0.5">
                    ₹{netMargin.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[11px] text-[#6b6660] font-medium mt-1">
                    Net Collected: ₹{netCollectedProfit.toLocaleString('en-IN')}
                  </div>
                  {/* The editor is paid after the job, so until that payout is logged
                      the only cost this margin knows about is nothing at all. Saying so
                      is the difference between a figure that is provisional and one
                      that is simply wrong. */}
                  {job.assignedType !== 'in_house' && editorCost === 0 && (
                    <div className="text-[10px] text-amber-800 font-semibold mt-1 leading-snug">
                      Before the editor's payout — log it below once they are paid.
                    </div>
                  )}
                </div>
              </div>

              {/* 2-Column Payment Ledgers */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/*
                  Where this job stands with the client, not where money is entered.
                  Studios pay per account, not per project — one transfer covering three
                  jobs cannot be typed in here without deciding by hand which part
                  belongs to which. That decision is made for you on the studio's page.
                */}
                <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-[#7a2e33]" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                        Client Position
                      </h3>
                    </div>
                    {job.freelanceClientId && (
                      <button
                        onClick={openStudioAccount}
                        className="flex items-center gap-1 px-2.5 py-1 bg-[#7a2e33] text-white text-[11px] font-bold rounded-lg hover:bg-[#5a2226] transition-all cursor-pointer shadow-2xs"
                      >
                        <span>Studio Account</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Charged:</span>
                      <span className="font-bold text-[#111417]">
                        ₹{job.clientCharge.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Covered by their payments:</span>
                      <span className="font-bold text-emerald-700">
                        ₹{clientPaid.toLocaleString('en-IN')}
                      </span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#d4c1a3]/40">
                      <span className="text-[#6b6660]">Still due on this job:</span>
                      <span className={`font-extrabold ${clientBalance > 0 ? 'text-amber-800' : 'text-[#6b6660]'}`}>
                        ₹{clientBalance.toLocaleString('en-IN')}
                      </span>
                    </div>
                  </div>

                  <p className="text-[10px] text-[#6b6660] leading-snug">
                    {job.freelanceClientId
                      ? 'Owed from the day the data arrived. Their payments clear the oldest job first — record them on the studio account.'
                      : 'One-off work, with no studio account behind it. Payments for it are recorded on the job itself.'}
                  </p>

                  {!job.freelanceClientId && (
                    <button
                      onClick={() => setPaymentModalType('client')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record Payment</span>
                    </button>
                  )}

                  {clientBalance > 0 && (
                    <button
                      onClick={handleSendPaymentReminder}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-[#f9f8f6] hover:bg-[#d4c1a3]/50 border border-[#d4c1a3] text-[#7a2e33] font-semibold text-xs rounded-xl transition-all"
                    >
                      <MessageCircle className="w-3.5 h-3.5" />
                      <span>Send Client Balance Reminder on WhatsApp</span>
                    </button>
                  )}
                </div>

                {/*
                  What this job cost the editor's account, not where a payout is
                  entered. Editors are settled per person — an advance, or one transfer
                  after several jobs — so the payment and its split live on their page.
                */}
                <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/40">
                    <div className="flex items-center gap-2">
                      <IndianRupee className="w-4 h-4 text-emerald-800" />
                      <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-800">
                        Editor Cost
                      </h3>
                    </div>
                    {job.editorMemberId !== undefined && (
                      <button
                        onClick={openEditorAccount}
                        className="flex items-center gap-1 px-2.5 py-1 bg-emerald-700 text-white text-[11px] font-bold rounded-lg hover:bg-emerald-800 transition-all cursor-pointer shadow-2xs"
                      >
                        <span>Editor Account</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="space-y-2.5 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[#6b6660]">Editor:</span>
                      <span className="font-bold text-[#111417]">{job.editorName}</span>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t border-[#d4c1a3]/40">
                      <span className="text-[#6b6660]">Paid against this job:</span>
                      <span className="font-extrabold text-[#111417]">
                        {job.assignedType === 'in_house'
                          ? 'Covered by salary'
                          : `₹${editorCost.toLocaleString('en-IN')}`}
                      </span>
                    </div>
                  </div>

                  {job.assignedType !== 'in_house' && editorCost === 0 && (
                    <p className="text-[10px] text-amber-800 font-semibold leading-snug bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      Nothing paid against this job yet, so it currently reads as costing the studio
                      nothing. Record the payout on {job.editorName}'s account and split this job's
                      share onto it.
                    </p>
                  )}

                  {job.editorMemberId === undefined && (
                    <button
                      onClick={() => setPaymentModalType('editor')}
                      className="w-full flex items-center justify-center gap-1.5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs rounded-xl transition-all cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Record Payout</span>
                    </button>
                  )}

                  {(job.editorPayouts || []).length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
                        Recorded on this job
                      </p>
                      {job.editorPayouts.map(p => (
                        <div
                          key={p.id}
                          className="p-3 bg-[#f9f8f6] border border-[#d4c1a3]/70 rounded-xl flex items-center justify-between text-xs"
                        >
                          <div>
                            <span className="font-bold text-[#111417]">₹{p.amount.toLocaleString('en-IN')}</span>
                            <span className="text-[10px] text-[#6b6660] ml-2">via {p.mode}</span>
                            {p.reference && (
                              <div className="text-[10px] text-[#6b6660] font-mono mt-0.5">Ref: {p.reference}</div>
                            )}
                          </div>
                          <span className="text-[11px] text-[#6b6660]">{p.date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Revisions Tracker */}
          {activeTab === 'revisions' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-[#d4c1a3]">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                    Client Revisions & Feedback Rounds
                  </h3>
                  <p className="text-[11px] text-[#6b6660]">
                    Each revision automatically sets a 2-day turnaround due date
                  </p>
                </div>
                <button
                  onClick={() => setIsRevisionModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7a2e33] text-white text-xs font-bold rounded-xl hover:bg-[#5a2226] shadow-2xs transition-all cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log New Revision</span>
                </button>
              </div>

              {job.revisions && job.revisions.length > 0 ? (
                <div className="space-y-3">
                  {job.revisions.map(rev => (
                    <div
                      key={rev.id}
                      className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs space-y-2"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-900 text-xs font-bold rounded">
                            Round #{rev.roundNumber}
                          </span>
                          <span className="text-xs text-[#6b6660]">Received on {rev.receivedDate}</span>
                        </div>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            rev.status === 'resolved'
                              ? 'bg-emerald-100 text-emerald-800'
                              : rev.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {rev.status.toUpperCase()}
                        </span>
                      </div>

                      <p className="text-xs text-[#111417] leading-relaxed whitespace-pre-wrap bg-[#f9f8f6] p-3 rounded-lg border border-[#d4c1a3]/60">
                        {rev.feedbackNotes}
                      </p>

                      {rev.timecodes && (
                        <div className="text-[11px] text-[#6b6660] font-mono">
                          Timecodes: <span className="text-[#111417]">{rev.timecodes}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white text-center py-10 rounded-xl border border-[#d4c1a3] text-xs text-[#6b6660]">
                  No revisions logged for this project yet.
                </div>
              )}
            </div>
          )}

          {/* TAB 4: Project Links & Assets */}
          {activeTab === 'links' && (
            <div className="space-y-4">
              <div className="bg-white p-5 rounded-xl border border-[#d4c1a3] shadow-2xs space-y-4">
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33] pb-2 border-b border-[#d4c1a3]/40">
                  Cloud Storage & Deliverables
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  {/* Raw Data */}
                  <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#111417]">Raw Footage Package</span>
                        {job.rawDataLink ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Active on B2 Cloud
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                            <Clock className="w-3 h-3" />
                            Awaiting Footage
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#6b6660] mt-1.5 leading-snug">
                        {job.rawDataLink
                          ? "Footage package is stored in Backblaze B2. Assigned editors download directly via their Desktop App."
                          : "Upload the project folder directly via the Desktop App to stream files into cloud storage."}
                      </p>
                    </div>
                    {job.rawDataLink && job.rawDataLink.startsWith('http') && (
                      <div className="mt-3 pt-2 border-t border-[#d4c1a3]/40 flex items-center justify-between">
                        <span className="text-[10px] text-[#6b6660] font-mono truncate max-w-[200px]">{job.rawDataLink}</span>
                        <a
                          href={job.rawDataLink}
                          target="_blank"
                          rel="noreferrer"
                          className="p-1 text-[#7a2e33] hover:underline text-[11px] flex items-center gap-1"
                        >
                          <span>Open</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Deliverables */}
                  <div className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-[#111417]">Final Deliverables</span>
                        {deliveryLink ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3" />
                            Stored in Dropbox
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-[#6b6660] bg-gray-100 px-2 py-0.5 rounded-full border border-gray-200">
                            <Clock className="w-3 h-3" />
                            Awaiting Deliverable
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#6b6660] mt-1.5 leading-snug">
                        {deliveryLink
                          ? "Editor uploaded the cut directly to Studio Dropbox via the Desktop App."
                          : "Editor uploads cuts directly from their Desktop App without manual link sharing."}
                      </p>
                    </div>
                    {deliveryLink && (
                      <div className="mt-3 pt-2 border-t border-[#d4c1a3]/40 flex items-center justify-between">
                        <span className="text-[10px] text-[#6b6660] truncate max-w-[180px]">Cloud Deliverable</span>
                        <a
                          href={deliveryLink}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#7a2e33] text-white text-[11px] font-semibold rounded-lg hover:bg-[#5a2226] transition-colors"
                        >
                          <Film className="w-3.5 h-3.5" />
                          <span>Preview Cut</span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Whatever an older job recorded before the link became singular.
                      Shown only when it holds something the delivery link does not, so
                      nothing that was once saved quietly disappears. */}
                  {[
                    { label: 'Reference Moodboard / Audio Track (old field)', value: job.referenceLink },
                    { label: 'Editor Draft Link (old field)', value: job.draftVideoLink },
                    { label: 'Final Master Link (old field)', value: job.finalDeliveryLink },
                  ]
                    .filter(l => l.value && l.value !== deliveryLink)
                    .map(l => (
                      <div key={l.label} className="p-3.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60">
                        <span className="font-bold text-[#6b6660]">{l.label}</span>
                        <div className="mt-2 flex items-center justify-between gap-2">
                          <span className="font-mono text-[11px] truncate text-[#6b6660]">{l.value}</span>
                          <a
                            href={l.value}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1.5 bg-white border border-[#d4c1a3] hover:border-[#7a2e33] text-[#7a2e33] rounded-lg shrink-0"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: Audit Logs */}
          {activeTab === 'logs' && (
            <div className="bg-white p-5 rounded-xl border border-[#d4c1a3] shadow-2xs space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33] pb-2 border-b border-[#d4c1a3]/40">
                Activity Audit Trail
              </h3>
              <div className="space-y-2">
                {(job.activityLogs || []).map(log => (
                  <div
                    key={log.id}
                    className="p-3 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60 flex items-start justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-[#111417]">{log.action}</div>
                      {log.details && <div className="text-[#6b6660] mt-0.5">{log.details}</div>}
                      <div className="text-[10px] text-[#6b6660]/80 mt-1">Actor: {log.actor}</div>
                    </div>
                    <span className="text-[10px] text-[#6b6660] shrink-0">
                      {new Date(log.timestamp).toLocaleString('en-IN', {
                        day: 'numeric',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3 bg-[#f9f8f6] border-t border-[#d4c1a3]">
          <div className="text-xs text-[#6b6660]">
            Created on {job.createdAt} • Due {effectiveDueDate}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>

      {/* Payment Modal */}
      {paymentModalType && (
        <FreelancePaymentModal
          isOpen={true}
          onClose={() => setPaymentModalType(null)}
          job={job}
          type={paymentModalType}
        />
      )}

      {/* Revision Modal */}
      <FreelanceRevisionModal
        isOpen={isRevisionModalOpen}
        onClose={() => setIsRevisionModalOpen(false)}
        job={job}
      />
    </div>
  );
};
