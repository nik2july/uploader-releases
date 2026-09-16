import React, { useState, useMemo, useEffect } from 'react';
import { ensureBaawarayFilmsStudio, reuseDeliverableRawData } from '../../lib/studioRepository';
import { BAAWARAY_FILMS_STUDIO_ID } from '../../lib/studioRepository';
import type { WorkTarget } from '../../../../shared/contracts';
import type { ClientDeliverable } from '../../types';
import { getUniqueReusableDeliverables, isPostProductionService } from '../../utils/postProduction';
import { resolvePostProductionServices } from '../../utils/postProductionServices';
import { normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, FreelanceJobStage } from '../../types';
import { deliveryLinkOf, freelanceDueDate } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { pricingFromRequest } from '../../utils/mediaPricing';
import { addDaysToDate, getDueDateStatus, getFreelanceStageMeta, inrDigits, isClientPostProductionEligible } from '../../utils/formatters';
import {
  Briefcase,
  Plus,
  Upload,
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
/**
 * A deliverable rendered as a row on the job board. Only the fields the board
 * reads are filled; `pendingDeliverable` is what marks it as not a real job.
 */
type PendingRow = FreelanceJob & {
  pendingDeliverable?: {
    target: WorkTarget;
    client?: any;
    deliverable?: ClientDeliverable;
    reusableDeliverables?: ClientDeliverable[];
  };
};

export const FreelanceDepartmentView: React.FC<{
  /** Starts a scan for a deliverable that has no footage yet. Owned by the dashboard. */
  onUploadForDeliverable?: (target: WorkTarget) => void;
}> = ({ onUploadForDeliverable }) => {
  const {

    freelanceJobs,
    freelanceJobRequests,
    clients,
    projects,
    studioSettings,
    studioPriceList,
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
  const [section, setSection] = useState<'jobs' | 'clients' | 'editors' | 'schedule' | 'radar'>(() => {
    try {
      const saved = localStorage.getItem('baawaray_freelance_section');
      // A section saved by an older build that no longer exists falls back to jobs.
      if (saved === 'jobs' || saved === 'clients' || saved === 'editors' || saved === 'schedule' || saved === 'radar')
        return saved;
    } catch {
      /* private browsing, or storage disabled — the default is fine */
    }
    return 'jobs';
  });

  // The studio's own work belongs on the roster whether or not a deliverable has
  // been filed yet, so the board guarantees it rather than waiting for the first
  // send to create it.
  useEffect(() => { void ensureBaawarayFilmsStudio().catch(() => { /* offline: the send path still creates it */ }); }, []);

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

  // Filtered jobs
  /**
   * BAAWARAY FILMS deliverables that have not become jobs yet, shaped like jobs.
   *
   * They are the same work as everything else on this board — the studio's own,
   * rather than another studio's — so they belong in the same list rather than a
   * section of their own. Nothing is written: these exist for as long as a render
   * takes, and are replaced by the real job the moment footage lands and the
   * deliverable files itself.
   */
  const pendingDeliverables = useMemo<PendingRow[]>(() => {
    // A deliverable's service lives on the service it is linked to in Quotation
    // Settings, not on its category — which is the old vocabulary and often says
    // only "Photo" or "Video". Resolved the same way every other screen does it.
    const roles = normaliseServices(
      studioSettings?.crewRoles || studioPriceList?.crewRoles || [],
      resolveRoleGroups(studioSettings?.roleGroups)
    );
    // What Post Production sells as this studio configured it, so a service added
    // in settings shows up here without a new build.
    const sold = resolvePostProductionServices(roles);
    const rows: PendingRow[] = [];
    const now = Date.now();
    for (const client of clients || []) {
      const clientEvents = (projects || []).filter(p =>
        (p.clientId !== undefined && String(p.clientId) === String(client.id)) ||
        (p.couple && client.couple && p.couple.toLowerCase().trim() === client.couple.toLowerCase().trim()) ||
        (p.couple && client.name && p.couple.toLowerCase().trim() === client.name.toLowerCase().trim())
      );
      if (!isClientPostProductionEligible(client, clientEvents, now)) {
        continue;
      }

      for (const item of (client.deliverables || []) as ClientDeliverable[]) {
        if ((item.postProductionJobIds || []).length) continue;
        const service = roles.find(r => r.id === item.linkedRoleId)?.name || item.category || '';
        if (!isPostProductionService(service, sold)) continue;
        const coupleOrClientName = client.couple || client.name || item.title;
        const target: WorkTarget = {
          kind: 'deliverable', id: item.id, clientId: String(client.id), title: item.title,
          clientName: coupleOrClientName, serviceType: service, purpose: 'raw', dueDate: item.dueDate,
        };
        const reusableDeliverables = getUniqueReusableDeliverables(
          (client.deliverables || []) as ClientDeliverable[],
          item.id
        );
        rows.push({
          id: `deliverable:${client.id}:${item.id}`,
          jobCode: 'AWAITING FOOTAGE',
          title: coupleOrClientName,
          serviceType: service,
          // No stage of its own: nothing has been received, which is the point.
          stage: 'pending_assignment',
          clientName: client.name || coupleOrClientName,
          clientPhone: client.phone || '',
          freelanceClientId: BAAWARAY_FILMS_STUDIO_ID,
          editorName: '',
          editorPhone: '',
          clientCharge: 0,
          dueDate: item.dueDate,
          revisions: [],
          pendingDeliverable: {
            target,
            client,
            deliverable: item,
            reusableDeliverables,
          },
          // Deliberately partial: a deliverable is not a job and has no code,
          // editor, payments or stage history. Only the fields the board reads
          // are filled, and pendingDeliverable tells the board which is which.
        } as unknown as PendingRow);
      }
    }
    return rows;
  }, [clients, projects, studioSettings, studioPriceList]);

  const getJobDisplayTitle = (job: FreelanceJob) => {
    if ((job as PendingRow).pendingDeliverable) return job.title;
    if (job.sourceClientId) {
      const c = clients?.find(cl => String(cl.id) === String(job.sourceClientId));
      if (c?.couple) return c.couple;
      if (c?.name) return c.name;
    }
    return job.title;
  };

  const getJobDisplayClient = (job: FreelanceJob) => {
    if ((job as PendingRow).pendingDeliverable) {
      return 'BAAWARAY FILMS';
    }
    if (job.freelanceClientId === BAAWARAY_FILMS_STUDIO_ID || job.sourceCompany === 'baawaray-films') {
      if (job.sourceClientId) {
        const c = clients?.find(cl => String(cl.id) === String(job.sourceClientId));
        if (c?.name || c?.couple) return `${c.couple || c.name} · BAAWARAY FILMS`;
      }
      return 'BAAWARAY FILMS';
    }
    return job.clientName;
  };

  const filteredJobs = useMemo(() => {
    // The studio's own pending work sits first: it is the work that cannot start
    // until someone does something about it.
    return [...pendingDeliverables, ...freelanceJobs].filter(job => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const pending = (job as PendingRow).pendingDeliverable;
        const displayTitle = getJobDisplayTitle(job);
        const displayClient = getJobDisplayClient(job);
        const matchTitle = (job.title && job.title.toLowerCase().includes(q)) || (displayTitle && displayTitle.toLowerCase().includes(q));
        const matchClient = (job.clientName && job.clientName.toLowerCase().includes(q)) || (displayClient && displayClient.toLowerCase().includes(q));
        const matchEditor = job.editorName && job.editorName.toLowerCase().includes(q);
        const matchCode = job.jobCode && job.jobCode.toLowerCase().includes(q);
        const matchService = job.serviceType && job.serviceType.toLowerCase().includes(q);
        const matchDeliverableTitle = pending?.deliverable?.title && pending.deliverable.title.toLowerCase().includes(q);
        const matchCouple = pending?.client?.couple && pending.client.couple.toLowerCase().includes(q);
        const matchClientRealName = pending?.client?.name && pending.client.name.toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchEditor && !matchCode && !matchService && !matchDeliverableTitle && !matchCouple && !matchClientRealName) {
          return false;
        }
      }

      // Stage tab
      if (selectedStageTab !== 'all') {
        if (selectedStageTab === 'active' && job.stage === 'completed') return false;
        if (selectedStageTab === 'revisions' && job.stage !== 'changes_received' && job.stage !== 'changes_sent_to_editor') return false;
        if (selectedStageTab !== 'active' && selectedStageTab !== 'revisions' && job.stage !== selectedStageTab) return false;
      }

      // A deliverable with no footage has no payment or due-date history to filter
      // on, so any filter beyond "all" is asking about jobs and it steps aside.
      if ((job as PendingRow).pendingDeliverable) {
        return selectedStageTab === 'all' && paymentFilter === 'all';
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
  }, [pendingDeliverables, freelanceJobs, searchQuery, selectedStageTab, paymentFilter, clients]);

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
          { id: 'jobs', label: 'All Work' },
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

      {section === 'clients' ? (
        <FreelanceClientsPanel />
      ) : section === 'editors' ? (
        <FreelanceEditorsPanel />
      ) : section === 'schedule' ? (
        <EditorSchedulePanel />
      ) : section === 'radar' ? (
        <CapacityRadarPanel />
      ) : (
        <>
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
            const pending = (job as PendingRow).pendingDeliverable;
            if (pending) {
              /*
               * The studio's own work, before there is any footage to do it with.
               *
               * Same card, same list, so it reads as one board — but none of a
               * job's actions apply to it: there is no editor to chase, no charge
               * to collect and no stage to advance. The one thing that moves it
               * forward is footage, so that is the only thing offered.
               */
              return (
                <div
                  key={job.id}
                  className="bg-white rounded-2xl border border-dashed border-[#d4c1a3] shadow-2xs overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-bold text-[#111417] leading-snug">{job.title}</h3>
                        <div className="text-[11px] text-[#7a2e33] font-semibold mt-0.5">
                          {job.serviceType}
                        </div>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#f9f8f6] border border-[#d4c1a3] text-[9px] font-bold uppercase tracking-wider text-[#6b6660]">
                        Awaiting footage
                      </span>
                    </div>
                    <div className="text-[11px] text-[#6b6660] font-medium">
                      BAAWARAY FILMS{job.dueDate ? ` · Due ${job.dueDate}` : ''}
                    </div>
                    <p className="text-[11px] text-[#6b6660] leading-relaxed">
                      Upload raw rushes or link existing client footage to move this deliverable to Post Production.
                    </p>
                  </div>
                  <div className="px-5 pb-5 space-y-2">
                    {pending.reusableDeliverables && pending.reusableDeliverables.length > 0 && (
                      <div className="p-2.5 bg-[#fbf9f5] border border-[#d4c1a3] rounded-xl text-xs space-y-1.5">
                        <div className="font-semibold text-[#111417] text-[11px] flex items-center gap-1">
                          <LinkIcon className="w-3.5 h-3.5 text-[#7a2e33]" />
                          Reuse client's uploaded raw data:
                        </div>
                        {pending.reusableDeliverables.map(reuse => (
                          <button
                            key={reuse.id}
                            type="button"
                            onClick={async () => {
                              try {
                                await reuseDeliverableRawData(pending.target.clientId!, pending.target.id, reuse.id);
                              } catch (err: any) {
                                alert(err.message || 'Failed to reuse raw data');
                              }
                            }}
                            className="w-full text-left px-2 py-1.5 bg-white hover:bg-emerald-50 border border-[#d4c1a3]/60 hover:border-emerald-300 rounded-lg text-[11px] text-[#111417] font-medium transition-colors flex items-center justify-between cursor-pointer"
                          >
                            <span className="truncate">Use data from {reuse.reusedFromTitle || reuse.title}</span>
                            <span className="shrink-0 text-[10px] text-emerald-700 font-bold ml-1">Attach ⚡</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={!onUploadForDeliverable}
                      onClick={() => onUploadForDeliverable?.(pending.target)}
                      className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-[#7a2e33] hover:bg-[#5a2226] disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>Send data</span>
                    </button>
                  </div>
                </div>
              );
            }

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
                      {getJobDisplayTitle(job)}
                    </h3>
                    <div className="flex items-center gap-1 text-[11px] text-[#6b6660] mt-0.5">
                      <span>{job.serviceType}</span>
                    </div>
                  </div>

                  {/* Client & Editor mini info */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-[#d4c1a3]/40 text-xs">
                    <div>
                      <span className="text-[10px] text-[#6b6660] uppercase font-bold">
                        {job.freelanceClientId === BAAWARAY_FILMS_STUDIO_ID || job.sourceCompany === 'baawaray-films' ? 'Partner Studio' : 'Client'}
                      </span>
                      <div className="font-semibold text-[#111417] truncate">{getJobDisplayClient(job)}</div>
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
                  const pendingRow = (job as PendingRow).pendingDeliverable;
                  if (pendingRow) {
                    // Its own row rather than a job's: running payment and stage
                    // logic over a deliverable would report zeros as though they
                    // were facts about work that has not started.
                    return (
                      <tr key={job.id} className="hover:bg-[#f9f8f6]/40 transition-colors text-[#6b6660]">
                        <td className="py-3 px-4">
                          <span className="font-mono text-[10px] font-bold text-[#6b6660] bg-[#f9f8f6] px-2 py-0.5 rounded border border-[#d4c1a3]">
                            AWAITING FOOTAGE
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="font-bold text-[#111417]">
                            {job.title}
                          </div>
                          <div className="text-[11px] text-[#6b6660]">
                            {job.serviceType} · BAAWARAY FILMS
                          </div>
                        </td>
                        <td className="py-3 px-4 text-xs italic text-[#6b6660]">
                          Unassigned
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                            Awaiting Footage
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-[#111417]">
                          {job.dueDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#6b6660]">—</td>
                        <td className="py-3 px-4 text-xs text-[#6b6660]">—</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex flex-col items-end gap-1">
                            {pendingRow.reusableDeliverables && pendingRow.reusableDeliverables.length > 0 && (
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    await reuseDeliverableRawData(
                                      pendingRow.target.clientId!,
                                      pendingRow.target.id,
                                      pendingRow.reusableDeliverables![0].id
                                    );
                                  } catch (err: any) {
                                    alert(err.message || 'Failed to reuse data');
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer"
                                title={`Use data from ${pendingRow.reusableDeliverables[0].reusedFromTitle || pendingRow.reusableDeliverables[0].title}`}
                              >
                                <LinkIcon className="w-3 h-3" />
                                Reuse client data
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={!onUploadForDeliverable}
                              onClick={() => onUploadForDeliverable?.(pendingRow.target)}
                              className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#7a2e33] hover:underline disabled:opacity-40 cursor-pointer"
                            >
                              <Upload className="w-3 h-3" />
                              Send data
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  }

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
                          {getJobDisplayTitle(job)}
                        </div>
                        <div className="text-[11px] text-[#6b6660]">
                          {getJobDisplayClient(job)} {job.clientPhone ? `(${job.clientPhone})` : ''}
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
            // Kanban files work by the stage it has reached. A deliverable with no
            // footage has reached none, so it is not on this board — it is on the
            // other two, where it can still be acted on.
            const colJobs = filteredJobs.filter(j => !(j as PendingRow).pendingDeliverable).filter(j =>
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
                      <div className="text-xs font-bold text-[#111417] line-clamp-1">{getJobDisplayTitle(j)}</div>
                      <div className="text-[10px] text-[#6b6660] flex items-center justify-between">
                        <span>{getJobDisplayClient(j)}</span>
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
