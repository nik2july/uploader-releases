import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, FreelanceJobStage } from '../../types';
import { deliveryLinkOf, freelanceDueDate } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { pricingFromRequest } from '../../utils/mediaPricing';
import { addDaysToDate, getDueDateStatus, getFreelanceStageMeta, inrDigits } from '../../utils/formatters';
import {
  Briefcase,
  Plus,
  Search,
  Filter,
  IndianRupee,
  Calendar,
  Clock,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  ChevronRight,
  User,
  ShieldCheck,
  Film,
  Sparkles,
  Layers,
  LayoutGrid,
  List,
  Columns,
  ArrowUpRight,
  ArrowDownLeft,
  Link as LinkIcon,
  MessageSquare,
  Eye,
  Edit3,
} from 'lucide-react';
import { FreelanceClientsPanel } from './FreelanceClientsPanel';
import { FreelanceEditorsPanel } from './FreelanceEditorsPanel';
import { EditorSchedulePanel } from './EditorSchedulePanel';
import { CapacityRadarPanel } from './CapacityRadarPanel';
import { NewFreelanceJobModal } from '../modals/NewFreelanceJobModal';
import { FreelanceJobDetailModal } from '../modals/FreelanceJobDetailModal';
import { FreelancePaymentModal } from '../modals/FreelancePaymentModal';
import { FreelanceRevisionModal } from '../modals/FreelanceRevisionModal';

/**
 * The freelance board, with client deliverables as one of its sections.
 *
 * Deliverables arrives already wired, as a node rather than as the five props
 * that screen needs — transfers, drive, and three callbacks that belong to the
 * dashboard. This view decides where the section sits; it does not need to know
 * what the section is made of.
 */
export const FreelanceDepartmentView: React.FC<{ deliverables?: React.ReactNode }> = ({ deliverables }) => {
  const {

    freelanceJobs,
    freelanceJobRequests,
    freelanceClients,
    advanceFreelanceJobStage,
    freelanceJobPayment,
    freelanceJobEditorCost,
    setSelectedFreelanceClientId,
    setActiveView,
    addFreelanceJob,
    pushFreelanceJobRequest,
    

  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStageTab, setSelectedStageTab] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'client_due' | 'editor_due' | 'overdue'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'kanban'>('grid');
  /**
   * Which of the department's three faces is showing.
   *
   * Remembered across visits because a partner studio's page is a separate view: coming
   * back from one would otherwise land on Jobs, several clicks from the roster you were
   * just looking at.
   */
  const [section, setSection] = useState<'jobs' | 'clients' | 'editors' | 'schedule' | 'radar' | 'deliverables'>(() => {
    try {
      const saved = localStorage.getItem('baawaray_freelance_section');
      if (saved === 'jobs' || saved === 'clients' || saved === 'editors' || saved === 'schedule' || saved === 'radar'
        || saved === 'deliverables')
        return saved;
    } catch {
      /* private browsing, or storage disabled — the default is fine */
    }
    return 'jobs';
  });

  useEffect(() => {
    try {
      localStorage.setItem('baawaray_freelance_section', section);
    } catch {
      /* nothing to do: this is a convenience, not state the app depends on */
    }
  }, [section]);

  // Modals state
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<FreelanceJob | null>(null);
  const [selectedDetailJobId, setSelectedDetailJobId] = useState<string | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    job: FreelanceJob | null;
    type: 'client' | 'editor';
  }>({ isOpen: false, job: null, type: 'client' });
  const [revisionModalJob, setRevisionModalJob] = useState<FreelanceJob | null>(null);

  // Overall calculations

  const pendingRequests = freelanceJobRequests.filter(r => r.status === 'submitted');
  const pendingRequestsCount = pendingRequests.length;

  const totalJobsCount = freelanceJobs.length;
  const activeJobsCount = freelanceJobs.filter(j => j.stage !== 'completed').length;
  const completedJobsCount = freelanceJobs.filter(j => j.stage === 'completed').length;

  const totalClientRevenue = freelanceJobs.reduce((acc, j) => acc + (j.clientCharge || 0), 0);
  // Read through the studios' accounts: a collective payment covering three jobs is
  // recorded once, on the studio, and would be invisible to a per-job total.
  const totalClientReceived = freelanceJobs.reduce(
    (acc, j) => acc + freelanceJobPayment(j).paid,
    0
  );
  const totalClientDue = Math.max(0, totalClientRevenue - totalClientReceived);

  /**
   * What the editing has cost.
   *
   * An editor's fee is agreed when they are paid, so cost and paid are the same
   * figure — there is no standing debt to report. What can go wrong is the opposite:
   * work delivered that no payout has been split onto, which reads as free until it
   * is settled.
   */
  const totalEditorCost = freelanceJobs.reduce((acc, j) => acc + freelanceJobEditorCost(j), 0);
  const totalEditorPaid = totalEditorCost;
  const unpaidDeliveredCount = freelanceJobs.filter(
    j =>
      (j.stage === 'completed' || j.stage === 'final_delivered') &&
      j.assignedType !== 'in_house' &&
      freelanceJobEditorCost(j) === 0
  ).length;

  const totalNetMargin = totalClientRevenue - totalEditorCost;
  const netMarginPercent = totalClientRevenue > 0 ? Math.round((totalNetMargin / totalClientRevenue) * 100) : 0;

  // Filtered jobs
  const filteredJobs = useMemo(() => {
    return freelanceJobs.filter(job => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = job.title.toLowerCase().includes(q);
        const matchClient = job.clientName.toLowerCase().includes(q);
        const matchEditor = job.editorName.toLowerCase().includes(q);
        const matchCode = job.jobCode.toLowerCase().includes(q);
        const matchService = job.serviceType.toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchEditor && !matchCode && !matchService) {
          return false;
        }
      }

      // Stage tab
      if (selectedStageTab !== 'all') {
        if (selectedStageTab === 'active' && job.stage === 'completed') return false;
        if (selectedStageTab === 'revisions' && job.stage !== 'changes_received' && job.stage !== 'changes_sent_to_editor') return false;
        if (selectedStageTab !== 'active' && selectedStageTab !== 'revisions' && job.stage !== selectedStageTab) return false;
      }

      // Payment / Alert filter
      if (paymentFilter === 'client_due' && job.clientPaymentStatus === 'paid') return false;
      if (paymentFilter === 'editor_due' && job.editorPaymentStatus === 'paid') return false;
      if (paymentFilter === 'overdue') {
        const targetDue = freelanceDueDate(job);
        const dueStatus = getDueDateStatus(targetDue);
        if (!dueStatus.isOverdue && dueStatus.daysRemaining > 1) return false;
      }

      return true;
    });
  }, [freelanceJobs, searchQuery, selectedStageTab, paymentFilter]);

  // Stage counts
  const stageCounts = useMemo(() => {
    return {
      all: freelanceJobs.length,
      active: freelanceJobs.filter(j => j.stage !== 'completed').length,
      data_received: freelanceJobs.filter(j => j.stage === 'data_received').length,
      sent_to_editor: freelanceJobs.filter(j => j.stage === 'sent_to_editor').length,
      draft_received: freelanceJobs.filter(j => j.stage === 'draft_received').length,
      sent_to_client: freelanceJobs.filter(j => j.stage === 'sent_to_client').length,
      revisions: freelanceJobs.filter(j => j.stage === 'changes_received' || j.stage === 'changes_sent_to_editor').length,
      final_delivered: freelanceJobs.filter(j => j.stage === 'final_delivered').length,
      completed: freelanceJobs.filter(j => j.stage === 'completed').length,
    };
  }, [freelanceJobs]);

  /** See the note in FreelanceJobDetailModal: the country lives on the studio. */
  const clientWhatsAppNumber = (job: FreelanceJob): string => {
    const studio = job.freelanceClientId
      ? freelanceClients.find(c => c.id === job.freelanceClientId)
      : undefined;
    return toWhatsAppNumber(job.clientPhone, studio?.dialCode) || '';
  };

  // Fast WhatsApp handlers
  const handleShareDataWhatsApp = (job: FreelanceJob) => {
    const phone = toWhatsAppNumber(job.editorPhone) || '';
    const text = encodeURIComponent(
      `*Studio OS - New Freelance Editing Project*\n` +
      `Project: *${job.title}* (${job.jobCode})\n` +
      `Service: ${job.serviceType}\n` +
      `*Target Due Date:* ${job.dueDate}\n` +
      (job.rawDataLink ? `*Raw Footage Link:* ${job.rawDataLink}\n` : '') +
      (job.referenceLink ? `*Reference Moodboard:* ${job.referenceLink}\n` : '') +
      (job.editingInstructions ? `*Editing Notes:* ${job.editingInstructions}\n` : '') +
      `\nPlease download data and confirm start.`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_editor', 'Shared raw data link with editor via WhatsApp');
  };

  const handleShareDraftWhatsApp = (job: FreelanceJob) => {
    const phone = clientWhatsAppNumber(job);
    const text = (
      `*Studio OS - Draft Video for Review*\n` +
      `Hello ${job.clientName},\n` +
      `Your edit for *${job.title}* is ready for first review!\n\n` +
      (deliveryLinkOf(job) ? `*Preview Link:* ${deliveryLinkOf(job)}\n\n` : '') +
      `Please check and share your thoughts or revision notes.`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_client', 'Shared draft link with client for review via WhatsApp');
  };

  const handleShareFinalWhatsApp = (job: FreelanceJob) => {
    const phone = clientWhatsAppNumber(job);
    const clientBal = freelanceJobPayment(job).balance;
    const text = (
      `*Studio OS - Final Master Delivery*\n` +
      `Hello ${job.clientName},\n` +
      `The master 4K delivery for *${job.title}* is ready!\n\n` +
      (deliveryLinkOf(job) ? `*Master Link:* ${deliveryLinkOf(job)}\n\n` : '') +
      (clientBal > 0 ? `*Pending Balance:* ₹${inrDigits(clientBal)}\n\n` : '') +
      `Thank you for trusting us with your project!`
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'final_delivered', 'Delivered final master link to client via WhatsApp');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Top Title & Primary Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#7a2e33] text-[#f9f8f6] flex items-center justify-center shadow-xs">
              <Briefcase className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold font-serif text-[#111417] tracking-tight">
                Freelance Department
              </h1>
              <p className="text-xs text-[#6b6660]">
                Track external editing jobs, client billings, freelance editor payouts, links, and revisions
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* View mode toggle */}
          <div className="flex items-center bg-[#f9f8f6] p-1 rounded-xl border border-[#d4c1a3]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'grid' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Grid View"
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'table' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Compact Table View"
            >
              <List className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-lg transition-all ${
                viewMode === 'kanban' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Pipeline Stages Kanban"
            >
              <Columns className="w-4 h-4" />
            </button>
          </div>

          <button
            id="btn-new-freelance-job"
            onClick={() => {
              setEditingJob(null);
              setIsNewJobModalOpen(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#7a2e33] hover:bg-[#5a2226] text-[#f9f8f6] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Freelance Work</span>
          </button>
        </div>
      </div>

      {/* Jobs vs Partner Studios */}
      <div className="flex items-center bg-[#f9f8f6] p-1 rounded-xl border border-[#d4c1a3] w-fit">
        {([
          { id: 'jobs', label: 'Jobs' },
          { id: 'deliverables', label: 'Deliverables' },
          { id: 'clients', label: 'Partner Studios' },
          { id: 'editors', label: 'Editor Payouts' },
          { id: 'schedule', label: 'Editor Schedule' },
          { id: 'radar', label: '⚡ Capacity Radar' },
        ] as const).map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSection(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              section === tab.id ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {section === 'deliverables' ? (
        deliverables ?? null
      ) : section === 'clients' ? (
        <FreelanceClientsPanel />
      ) : section === 'editors' ? (
        <FreelanceEditorsPanel />
      ) : section === 'schedule' ? (
        <EditorSchedulePanel />
      ) : section === 'radar' ? (
        <CapacityRadarPanel />
      ) : (
        <>
      {/* Financial & Pipeline Metrics Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Metric 1: Total & Active Projects */}
        <div className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Projects in Pipeline
            </span>
            <span className="w-2 h-2 rounded-full bg-blue-500" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl font-extrabold text-[#111417]">{activeJobsCount}</span>
            <span className="text-xs text-[#6b6660]">Active ({totalJobsCount} Total)</span>
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-1">
            {completedJobsCount} Completed & Delivered
          </div>
        </div>

        {/* Metric 2: Client Billing & Receivables */}
        <div className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Client Revenue
            </span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            ₹{inrDigits(totalClientRevenue)}
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1">
            <span className="text-emerald-700 font-semibold">
              Recv: ₹{inrDigits(totalClientReceived)}
            </span>
            {totalClientDue > 0 && (
              <span className="text-[#7a2e33] font-bold">
                Due: ₹{inrDigits(totalClientDue)}
              </span>
            )}
          </div>
        </div>

        {/* Metric 3: Editor Costs & Payouts */}
        <div className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Freelancer Costs
            </span>
            <ArrowUpRight className="w-4 h-4 text-amber-600" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            ₹{inrDigits(totalEditorCost)}
          </div>
          <div className="flex items-center justify-between text-[11px] mt-1">
            <span className="text-emerald-700 font-semibold">Paid in full</span>
            {unpaidDeliveredCount > 0 && (
              <span className="text-amber-800 font-bold">
                {unpaidDeliveredCount} delivered, unpaid
              </span>
            )}
          </div>
        </div>

        {/* Metric 4: Net Studio Margin */}
        <div className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Net Studio Profit
            </span>
            {/* A loss rendered in profit-green reads as a good month at a glance --
                the one number in this panel most likely to be trusted without
                reading it. */}
            <span className={`px-1.5 py-0.5 text-[10px] font-bold rounded ${
              totalNetMargin >= 0 ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
            }`}>
              {netMarginPercent}%
            </span>
          </div>
          <div className={`text-2xl font-extrabold mt-1 ${
            totalNetMargin >= 0 ? 'text-emerald-700' : 'text-rose-700'
          }`}>
            ₹{inrDigits(totalNetMargin)}
          </div>
          <div className="text-[11px] text-[#6b6660] font-medium mt-1">
            Net Collected: ₹{inrDigits(totalClientReceived - totalEditorPaid)}
          </div>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs space-y-3">
        {/* Search & Quick Action Filters */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="relative w-full md:w-80">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#6b6660]" />
            <input
              type="text"
              placeholder="Search by client, editor, job code, or work title..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-3.5 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
            />
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
            {[
              { id: 'all', label: 'All Payments' },
              { id: 'client_due', label: 'Client Payment Due' },
              { id: 'editor_due', label: 'Editor Payout Pending' },
              { id: 'overdue', label: 'Urgent / Due Soon' },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setPaymentFilter(f.id as any)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                  paymentFilter === f.id
                    ? 'bg-[#7a2e33] text-white shadow-2xs'
                    : 'bg-[#f9f8f6] border border-[#d4c1a3] text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Stage Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto pt-2 border-t border-[#d4c1a3]/40">
          {[
            { id: 'all', label: 'All Jobs', count: stageCounts.all },
            { id: 'active', label: 'In Progress', count: stageCounts.active },
            { id: 'data_received', label: 'Data Received', count: stageCounts.data_received },
            { id: 'sent_to_editor', label: 'With Editor', count: stageCounts.sent_to_editor },
            { id: 'sent_to_client', label: 'Client Review', count: stageCounts.sent_to_client },
            { id: 'revisions', label: 'Revisions', count: stageCounts.revisions },
            { id: 'final_delivered', label: 'Final Master', count: stageCounts.final_delivered },
            { id: 'completed', label: 'Completed', count: stageCounts.completed },
          ].map(tab => {
            const isActive = selectedStageTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setSelectedStageTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all cursor-pointer ${
                  isActive
                    ? 'bg-[#7a2e33] text-white shadow-2xs'
                    : 'bg-[#f9f8f6] text-[#6b6660] hover:bg-[#d4c1a3]/40 hover:text-[#111417]'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-[#d4c1a3] text-[#7a2e33]'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Content Area */}
      {filteredJobs.length === 0 ? (
        <div className="bg-white rounded-2xl p-12 text-center border border-[#d4c1a3] shadow-2xs space-y-4">
          <div className="w-14 h-14 rounded-2xl bg-[#f9f8f6] border border-[#d4c1a3] flex items-center justify-center mx-auto text-[#7a2e33]">
            <Briefcase className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-base font-bold text-[#111417]">No freelance projects found</h3>
            <p className="text-xs text-[#6b6660] max-w-md mx-auto mt-1">
              {searchQuery || selectedStageTab !== 'all' || paymentFilter !== 'all'
                ? 'Try adjusting your filters or search keywords.'
                : 'Start tracking external editing projects, client charges, and freelance editor payouts.'}
            </p>
          </div>
          <button
            onClick={() => {
              setEditingJob(null);
              setIsNewJobModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Create New Freelance Project</span>
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredJobs.map(job => {
            const stageMeta = getFreelanceStageMeta(job.stage);
            const targetDueDate = freelanceDueDate(job);
            const dueStatus = getDueDateStatus(targetDueDate);
            const clientBal = freelanceJobPayment(job).balance;
            const editorCost = freelanceJobEditorCost(job);

            return (
              <div
                key={job.id}
                className="bg-white rounded-2xl border border-[#d4c1a3] shadow-2xs overflow-hidden flex flex-col justify-between hover:border-[#7a2e33]/60 transition-all group"
              >
                {/* Card Top */}
                <div className="p-5 space-y-3.5">
                  {/* Job Code & Stage Badge */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#7a2e33] bg-[#f9f8f6] px-2 py-0.5 rounded border border-[#d4c1a3]">
                      {job.jobCode}
                    </span>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${stageMeta.badgeClass}`}>
                      {stageMeta.label}
                    </span>
                  </div>

                  {/* Work Title */}
                  <div>
                    <h3
                      onClick={() => setSelectedDetailJobId(job.id)}
                      className="text-sm font-bold text-[#111417] group-hover:text-[#7a2e33] transition-colors cursor-pointer leading-snug line-clamp-1"
                    >
                      {job.title}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#6b6660] mt-0.5">
                      <span>{job.serviceType}</span>
                    </div>
                  </div>

                  {/* Client & Editor mini info */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#d4c1a3]/40 text-xs">
                    <div>
                      <span className="text-[10px] text-[#6b6660] uppercase font-bold">Client</span>
                      <div className="font-semibold text-[#111417] truncate">{job.clientName}</div>
                      <div className="text-[10px] text-[#6b6660] font-mono truncate">{job.clientPhone}</div>
                    </div>
                    <div>
                      <span className="text-[10px] text-[#6b6660] uppercase font-bold">Editor</span>
                      <div className="font-semibold text-[#111417] truncate">{job.editorName}</div>
                      <div className="text-[10px] text-[#6b6660] font-mono truncate">{job.editorPhone || 'In-House'}</div>
                    </div>
                  </div>

                  {/* Due Date & Turnaround status */}
                  <div className="flex items-center justify-between p-2 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60 text-xs">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#6b6660]" />
                      <span className="text-[11px] text-[#6b6660]">Due: {targetDueDate}</span>
                    </div>
                    <span className={`text-[11px] font-bold ${dueStatus.color}`}>
                      {dueStatus.label}
                    </span>
                  </div>

                  {/* Financials pill bar */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2 bg-emerald-50/60 border border-emerald-100 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-emerald-800">Client Revenue</div>
                      <div className="font-bold text-[#111417]">₹{inrDigits(job.clientCharge)}</div>
                      <div className="text-[10px] text-emerald-700">
                        {clientBal === 0 ? 'Fully Paid' : `Due: ₹${inrDigits(clientBal)}`}
                      </div>
                    </div>
                    <div className="p-2 bg-amber-50/60 border border-amber-100 rounded-lg">
                      <div className="text-[10px] uppercase font-bold text-amber-800">Editor Payout</div>
                      <div className="font-bold text-[#111417]">₹{inrDigits(editorCost)}</div>
                      <div className="text-[10px] text-amber-800">
                        {job.assignedType === 'in_house'
                          ? 'Covered by salary'
                          : editorCost > 0
                          ? 'Paid'
                          : 'Not paid yet'}
                      </div>
                    </div>
                  </div>

                  {/* Revision tag indicator if any */}
                  {job.revisions && job.revisions.length > 0 && (
                    <div className="flex items-center justify-between text-[11px] px-2 py-1 bg-amber-100/60 text-amber-900 rounded-lg font-semibold">
                      <span>Revisions: {job.revisions.length} Round(s)</span>
                      <span>2-Day Turnaround</span>
                    </div>
                  )}
                </div>

                {/* Card Bottom / Fast WhatsApp & Action buttons */}
                <div className="p-3 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    {/* Fast WhatsApp action depending on stage */}
                    {job.stage === 'data_received' ? (
                      <button
                        onClick={() => handleShareDataWhatsApp(job)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Send Data Link to Editor on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Send to Editor</span>
                      </button>
                    ) : job.stage === 'sent_to_editor' || job.stage === 'draft_received' ? (
                      <button
                        onClick={() => handleShareDraftWhatsApp(job)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Send Draft Link to Client on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Send Draft</span>
                      </button>
                    ) : job.stage === 'sent_to_client' || job.stage === 'changes_received' ? (
                      <button
                        onClick={() => setRevisionModalJob(job)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Log & Share Client Changes"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>Log Changes</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => handleShareFinalWhatsApp(job)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Deliver Master Link on WhatsApp"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Deliver Master</span>
                      </button>
                    )}

                    {/*
                      Money in goes to the studio's account, not to this job: one
                      transfer usually covers several. Money out to the editor is still
                      per job, since that is what a payout is against.
                    */}
                    <button
                      onClick={() => {
                        if (clientBal > 0 && job.freelanceClientId) {
                          setSelectedFreelanceClientId(job.freelanceClientId);
                          setActiveView('freelanceStudio');
                          return;
                        }
                        setPaymentModalState({
                          isOpen: true,
                          job,
                          type: clientBal > 0 ? 'client' : 'editor',
                        });
                      }}
                      className="flex items-center gap-1 px-2 py-1.5 bg-white border border-[#d4c1a3] hover:border-[#7a2e33] text-[#111417] text-[11px] font-semibold rounded-lg transition-all cursor-pointer"
                      title={
                        clientBal > 0 && job.freelanceClientId
                          ? 'Record what the studio paid, on their account'
                          : 'Record Payment / Payout'
                      }
                    >
                      <IndianRupee className="w-3.5 h-3.5 text-[#7a2e33]" />
                      <span>{clientBal > 0 ? 'Recv' : 'Pay'}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingJob(job);
                        setIsNewJobModalOpen(true);
                      }}
                      className="p-1.5 text-[#6b6660] hover:text-[#7a2e33] hover:bg-white rounded-lg transition-colors"
                      title="Edit Job"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setSelectedDetailJobId(job.id)}
                      className="p-1.5 text-[#7a2e33] hover:bg-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1"
                    >
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'table' ? (
        /* FAST COMPACT TABLE VIEW */
        <div className="bg-white rounded-2xl border border-[#d4c1a3] shadow-2xs overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#f9f8f6] border-b border-[#d4c1a3] text-[#6b6660] uppercase text-[10px] tracking-wider font-bold">
                  <th className="py-3 px-4">Job Code</th>
                  <th className="py-3 px-4">Project & Client</th>
                  <th className="py-3 px-4">Assigned Editor</th>
                  <th className="py-3 px-4">Stage</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Client Charge</th>
                  <th className="py-3 px-4">Editor Pay</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4c1a3]/40 text-[#111417]">
                {filteredJobs.map(job => {
                  const stageMeta = getFreelanceStageMeta(job.stage);
                  const targetDue = freelanceDueDate(job);
                  const dueStatus = getDueDateStatus(targetDue);
                  const clientBal = freelanceJobPayment(job).balance;
                  const editorCost = freelanceJobEditorCost(job);

                  return (
                    <tr key={job.id} className="hover:bg-[#f9f8f6]/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-bold text-[#7a2e33]">
                        {job.jobCode}
                      </td>
                      <td className="py-3 px-4">
                        <div
                          onClick={() => setSelectedDetailJobId(job.id)}
                          className="font-bold text-[#111417] hover:text-[#7a2e33] cursor-pointer"
                        >
                          {job.title}
                        </div>
                        <div className="text-[11px] text-[#6b6660]">
                          Client: {job.clientName} ({job.clientPhone})
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#111417]">{job.editorName}</div>
                        <div className="text-[10px] text-[#6b6660]">
                          {job.assignedType === 'in_house' ? 'In-House' : 'Freelancer'}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${stageMeta.badgeClass}`}>
                          {stageMeta.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-[#111417]">{targetDue}</div>
                        <div className={`text-[10px] font-bold ${dueStatus.color}`}>
                          {dueStatus.label}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold">₹{inrDigits(job.clientCharge)}</div>
                        <div className="text-[10px] text-emerald-700">
                          {clientBal === 0 ? 'Paid' : `Due: ₹${inrDigits(clientBal)}`}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-bold">₹{inrDigits(editorCost)}</div>
                        <div className="text-[10px] text-amber-800">
                          {job.assignedType === 'in_house'
                            ? 'Salaried'
                            : editorCost > 0
                            ? 'Paid'
                            : 'Not paid yet'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedDetailJobId(job.id)}
                            className="p-1.5 bg-[#f9f8f6] border border-[#d4c1a3] hover:border-[#7a2e33] text-[#7a2e33] rounded-lg cursor-pointer"
                            title="View Job Details"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              setEditingJob(job);
                              setIsNewJobModalOpen(true);
                            }}
                            className="p-1.5 bg-[#f9f8f6] border border-[#d4c1a3] hover:border-[#7a2e33] text-[#111417] rounded-lg cursor-pointer"
                            title="Edit Job"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* KANBAN STAGE PIPELINE VIEW */
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 overflow-x-auto pb-4">
          {[
            { stageKey: 'data_received', label: '1. Data Received', color: 'border-amber-300 bg-amber-50/30' },
            { stageKey: 'sent_to_editor', label: '2. With Editor', color: 'border-blue-300 bg-blue-50/30' },
            { stageKey: 'sent_to_client', label: '3. Client Review', color: 'border-sky-300 bg-sky-50/30' },
            { stageKey: 'changes_received', label: '4. Revisions', color: 'border-orange-300 bg-orange-50/30' },
            { stageKey: 'final_delivered', label: '5. Final Master', color: 'border-purple-300 bg-purple-50/30' },
            { stageKey: 'completed', label: '6. Completed', color: 'border-emerald-300 bg-emerald-50/30' },
          ].map(col => {
            const colJobs = filteredJobs.filter(j =>
              col.stageKey === 'changes_received'
                ? j.stage === 'changes_received' || j.stage === 'changes_sent_to_editor'
                : j.stage === col.stageKey
            );

            return (
              <div
                key={col.stageKey}
                className={`rounded-2xl p-3 border ${col.color} flex flex-col space-y-3 min-w-[220px]`}
              >
                <div className="flex items-center justify-between pb-2 border-b border-black/5">
                  <h4 className="text-xs font-bold text-[#111417]">{col.label}</h4>
                  <span className="text-[10px] font-bold px-2 py-0.2 bg-white rounded-full border border-black/10">
                    {colJobs.length}
                  </span>
                </div>

                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[650px]">
                  {colJobs.map(j => (
                    <div
                      key={j.id}
                      onClick={() => setSelectedDetailJobId(j.id)}
                      className="bg-white p-3 rounded-xl border border-[#d4c1a3] shadow-2xs hover:border-[#7a2e33] cursor-pointer space-y-2 transition-all"
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold text-[#7a2e33]">{j.jobCode}</span>
                        <span className="text-[10px] font-semibold text-[#6b6660]">{j.dueDate}</span>
                      </div>
                      <div className="text-xs font-bold text-[#111417] line-clamp-1">{j.title}</div>
                      <div className="text-[10px] text-[#6b6660] flex items-center justify-between">
                        <span>{j.clientName}</span>
                        <span className="font-bold text-emerald-700">₹{inrDigits(j.clientCharge)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

        </>
      )}

      
      {pendingRequestsCount > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 sm:p-6 mb-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <h2 className="text-lg font-bold text-amber-900 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse"></span>
              {pendingRequestsCount} Pending Job Request{pendingRequestsCount !== 1 ? 's' : ''}
            </h2>
          </div>
          <div className="space-y-3">
            {pendingRequests.map(req => {
              const client = freelanceClients.find(c => c.id === req.freelanceClientId);
              return (
                <div key={req.id} className="bg-white p-4 rounded-xl shadow-sm border border-amber-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
                  <div>
                    <h3 className="font-bold text-gray-900">{req.title}</h3>
                    <div className="text-sm text-gray-600 flex items-center gap-2 mt-1">
                      <span className="font-medium text-amber-800">{client?.name || 'Unknown Studio'}</span>
                      <span>•</span>
                      <span>{req.serviceType}</span>
                      <span>•</span>
                      <span>Submitted {req.createdAt}</span>
                    </div>
                    {(req.durationHours || req.quantity) ? (
                      <div className="text-xs text-gray-500 mt-2">
                        {req.durationHours || 0}h {req.durationMinutes || 0}m {req.durationSeconds || 0}s
                        {req.quantity ? ` ${req.quantity} items` : ''}
                        {(req.keepPercent ?? req.cullPercent) ? ` (${req.keepPercent ?? req.cullPercent}% kept)` : ''}
                        {' '}→ Quoted: ₹{inrDigits(req.quotedCharge)}
                      </div>
                    ) : null}
                    {req.notes && (
                      <div className="mt-2 text-sm text-gray-600 bg-gray-50 p-2 rounded">
                        <span className="font-medium text-gray-700">Notes:</span> {req.notes}
                      </div>
                    )}
                    {req.rawDataLink && (
                      <a href={req.rawDataLink} target="_blank" rel="noreferrer" className="inline-block mt-2 text-sm text-blue-600 hover:underline">
                        View Raw Data ↗
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm('Decline this request?')) return;
                        await pushFreelanceJobRequest({ ...req, status: 'declined' });
                      }}
                      className="px-4 py-2 text-sm font-medium text-rose-600 bg-rose-50 rounded-lg hover:bg-rose-100"
                    >
                      Decline
                    </button>
                    <button
                      onClick={async () => {
                        const newJob = {
                          id: req.id, // we can reuse the ID, or generate a new one. Wait, let's generate a new one to keep types clean.
                          id_override: crypto.randomUUID(),
                        };
                        const job = {
                          id: newJob.id_override,
                          jobCode: '', // backend will generate via nextFreelanceJobCode
                          freelanceClientId: req.freelanceClientId,
                          clientAuthUid: req.clientAuthUid,
                          clientName: client?.name || '',
                          clientPhone: client?.phone || '',
                          title: req.title,
                          projectCategory: 'Wedding',
                          serviceType: req.serviceType,
                          stage: 'pending_assignment',
                          priority: 'normal',
                          rawDataLink: req.rawDataLink,
                          createdAt: new Date().toISOString().split('T')[0],
                          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                          clientCharge: req.quotedCharge || 0,
                          quotedPricing: pricingFromRequest(req),
                          keepPercent: req.keepPercent ?? req.cullPercent,
                          notes: req.notes,
                          clientPaidAmount: 0,
                          clientPaymentStatus: 'pending',
                          clientPayments: [],
                        };
                        
                        addFreelanceJob(job as any);
                        await pushFreelanceJobRequest({ ...req, status: 'accepted' });
                      }}
                      className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
                    >
                      Accept Job
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* New Freelance Job Modal */}
      {/* Remounted per open. The modal seeds every field from `initialJob` in
          useState initialisers, which run only on first mount — and because it is
          rendered unconditionally (isOpen merely returns null), that first mount
          happened with no job. Editing then opened a blank form, and saving it wrote
          those blanks over the job. Keying on the job forces a fresh mount so the
          initialisers see the right one, and also gives a genuinely empty form for a
          new job rather than the last draft. */}
      <NewFreelanceJobModal
        key={`${editingJob?.id ?? 'new'}:${isNewJobModalOpen}`}
        isOpen={isNewJobModalOpen}
        onClose={() => setIsNewJobModalOpen(false)}
        initialJob={editingJob}
      />

      {/* Job Detail Slide-over / Modal */}
      <FreelanceJobDetailModal
        isOpen={Boolean(selectedDetailJobId)}
        onClose={() => setSelectedDetailJobId(null)}
        jobId={selectedDetailJobId}
        onEditJob={job => {
          setSelectedDetailJobId(null);
          setEditingJob(job);
          setIsNewJobModalOpen(true);
        }}
      />

      {/* Payment Modal */}
      {paymentModalState.isOpen && paymentModalState.job && (
        <FreelancePaymentModal
          isOpen={true}
          onClose={() => setPaymentModalState({ isOpen: false, job: null, type: 'client' })}
          job={paymentModalState.job}
          type={paymentModalState.type}
        />
      )}

      {/* Revision Modal */}
      {revisionModalJob && (
        <FreelanceRevisionModal
          isOpen={true}
          onClose={() => setRevisionModalJob(null)}
          job={revisionModalJob}
        />
      )}
    </div>
  );
};
