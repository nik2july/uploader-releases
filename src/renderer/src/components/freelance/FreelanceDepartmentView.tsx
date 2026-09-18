import React, { useState, useMemo, useEffect } from 'react';
import { ensureBaawarayFilmsStudio, reuseDeliverableRawData } from '../../lib/studioRepository';
import { BAAWARAY_FILMS_STUDIO_ID } from '../../lib/studioRepository';
import type { WorkTarget } from '../../../../shared/contracts';
import type { ClientDeliverable } from '../../types';
import { getUniqueReusableDeliverables, isPostProductionService } from '../../utils/postProduction';
import { resolvePostProductionServices } from '../../utils/postProductionServices';
import { normaliseServices, resolveRoleGroups } from '../../utils/studioRoles';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, FreelanceJobStage, FreelanceExtraData, FreelanceDoubt } from '../../types';
import { deliveryLinkOf, freelanceDueDate } from '../../utils/freelance';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { WhatsAppTemplatesDrawer } from './WhatsAppTemplatesDrawer';
import { renderWhatsAppMessage } from '../../utils/whatsappTemplates';
import { pricingFromRequest } from '../../utils/mediaPricing';
import { addDaysToDate, getDueDateStatus, getFreelanceStageMeta, inrDigits, isClientPostProductionEligible } from '../../utils/formatters';
import {
  Briefcase,
  Plus,
  Upload,
  Search,
  Filter,
  ArrowUpDown,
  X,
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
  SlidersHorizontal,
  HardDrive,
  HelpCircle,
  Send,
  Check,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { AssignEditorPanel } from './AssignEditorPanel';
import { NewFreelanceJobModal } from '../modals/NewFreelanceJobModal';
import { FreelanceJobDetailModal } from '../modals/FreelanceJobDetailModal';
import { FreelancePaymentModal } from '../modals/FreelancePaymentModal';
import { FreelanceRevisionModal } from '../modals/FreelanceRevisionModal';
import { ManualRawDataModal } from '../ManualRawDataModal';
import { EditDeliverableModal } from '../modals/EditDeliverableModal';
import { useTransfers } from '../../hooks/useTransfers';
import { formatBytes, progressFraction } from '../../utils/uploadFormat';

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
  onViewTransfer?: (transferId: string) => void;
  onGoToQueue?: () => void;
}> = ({ onUploadForDeliverable, onViewTransfer, onGoToQueue }) => {
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
    updateFreelanceJob,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filter, setFilter] = useState<string>('all');
  const [selectedEditor, setSelectedEditor] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('due_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'kanban'>('grid');
  const [attachingId, setAttachingId] = useState<string | null>(null);

  const { transfers } = useTransfers();

  const isDataPending = (job: FreelanceJob | PendingRow) => {
    if ((job as PendingRow).pendingDeliverable) return true;
    if (job.stage === 'completed') return false;
    return (!job.rawDataLink || !job.rawDataLink.trim()) && job.rawDataSource !== 'hard_drive';
  };
  // The studio's own work belongs on the roster whether or not a deliverable has
  // been filed yet, so the board guarantees it rather than waiting for the first
  // send to create it.
  useEffect(() => { void ensureBaawarayFilmsStudio().catch(() => { /* offline: the send path still creates it */ }); }, []);

  // Modals state
  const [isNewJobModalOpen, setIsNewJobModalOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<FreelanceJob | null>(null);
  const [assigningJob, setAssigningJob] = useState<FreelanceJob | null>(null);
  const [selectedDetailJobId, setSelectedDetailJobId] = useState<string | null>(null);
  const [paymentModalState, setPaymentModalState] = useState<{
    isOpen: boolean;
    job: FreelanceJob | null;
    type: 'client' | 'editor';
  }>({ isOpen: false, job: null, type: 'client' });
  const [revisionModalState, setRevisionModalState] = useState<{
    isOpen: boolean;
    job: FreelanceJob | null;
    revisionType: 'client' | 'internal';
  }>({ isOpen: false, job: null, revisionType: 'client' });
  const [manualRawTarget, setManualRawTarget] = useState<{ target: WorkTarget; title: string } | null>(null);
  // Edit Deliverable Modal State (for pending deliverables)
  const [editingDeliverableState, setEditingDeliverableState] = useState<{
    isOpen: boolean;
    clientId: string;
    clientName: string;
    deliverable: ClientDeliverable | null;
  }>({
    isOpen: false,
    clientId: '',
    clientName: '',
    deliverable: null,
  });

  const handleEditPendingDeliverable = (pending: NonNullable<PendingRow['pendingDeliverable']>) => {
    if (!pending.deliverable) return;
    setEditingDeliverableState({
      isOpen: true,
      clientId: pending.target.clientId || '',
      clientName: pending.target.clientName || pending.client?.couple || pending.client?.name || 'Client',
      deliverable: pending.deliverable,
    });
  };

  const handleDirectWhatsAppSelectionFollowUp = (
    job: FreelanceJob,
    pending: NonNullable<PendingRow['pendingDeliverable']>
  ) => {
    const deliverable = pending.deliverable;
    const deliverableDesc = `${job.title} ${job.serviceType} ${deliverable?.title || ''}`.toLowerCase();
    const isAlbum = deliverableDesc.includes('album') || deliverableDesc.includes('sheet');

    let messageText = '';
    const studioName = studioSettings?.studioName || 'BAAWARAY FILMS';
    const clientDisplayName = job.clientName || job.title || 'Client';
    const projectDisplayName = job.title || job.clientName || 'Wedding Project';

    if (isAlbum) {
      const match = `${deliverable?.title || ''} ${job.serviceType}`.match(/(\d+)\s*(?:sheet|sh|p)/i);
      const sheetsCount = deliverable?.billableQuantity || (match && match[1] ? Number(match[1]) : 40);
      const photosRequired = sheetsCount * 5;

      messageText = renderWhatsAppMessage(
        'client_album_selection',
        {
          clientName: clientDisplayName,
          projectName: projectDisplayName,
          sheetsCount,
          photosRequired,
          link: deliverable?.rawDataLink || '',
        },
        studioName
      );
    } else {
      const match = `${deliverable?.title || ''} ${job.serviceType}`.match(/(\d+\s*[x×]\s*\d+\s*(?:inches|inch|in)?)/i);
      const frameSize = match && match[1] ? match[1].trim() : '20 × 30 Inches';
      const frameCount = deliverable?.billableQuantity || 4;

      messageText = renderWhatsAppMessage(
        'client_frame_selection',
        {
          clientName: clientDisplayName,
          projectName: projectDisplayName,
          frameCount,
          frameSize,
          link: deliverable?.rawDataLink || '',
        },
        studioName
      );
    }

    const phone = job.clientPhone || pending.client?.phone || '';
    const url = getWhatsAppUrl(phone, messageText);
    window.open(url, '_blank');
  };

  // Raw footage & hard drive data modal state
  const [rawLinkPromptJob, setRawLinkPromptJob] = useState<FreelanceJob | null>(null);
  const [rawSourceType, setRawSourceType] = useState<'partner_upload' | 'studio_upload' | 'hard_drive'>('partner_upload');
  const [rawLinkInput, setRawLinkInput] = useState('');
  const [rawHddStatus, setRawHddStatus] = useState<'received_by_studio' | 'sent_to_editor'>('received_by_studio');
  const [rawHddNotes, setRawHddNotes] = useState('');
  const [isSavingRawLink, setIsSavingRawLink] = useState(false);

  // Extra data / footage modal state (appends data at any time)
  const [extraDataPromptJob, setExtraDataPromptJob] = useState<FreelanceJob | null>(null);
  const [extraDataTitle, setExtraDataTitle] = useState('');
  const [extraDataSourceType, setExtraDataSourceType] = useState<'cloud_upload' | 'hard_drive'>('cloud_upload');
  const [extraDataUrl, setExtraDataUrl] = useState('');
  const [extraDataNotes, setExtraDataNotes] = useState('');
  const [extraDataNotifyWhatsApp, setExtraDataNotifyWhatsApp] = useState(true);
  const [isSavingExtraData, setIsSavingExtraData] = useState(false);

  // Receive cut / updated cut modal state (the single delivery link)
  const [receiveCutPromptJob, setReceiveCutPromptJob] = useState<FreelanceJob | null>(null);
  const [receiveCutLinkInput, setReceiveCutLinkInput] = useState('');
  const [receiveCutEditorNotes, setReceiveCutEditorNotes] = useState('');
  const [isSavingCut, setIsSavingCut] = useState(false);

  const [deliverableLinkPromptJob, setDeliverableLinkPromptJob] = useState<{
    job: FreelanceJob;
    type: 'draft' | 'final';
  } | null>(null);
  const [deliverableLinkInput, setDeliverableLinkInput] = useState('');
  const [isSavingDeliverableLink, setIsSavingDeliverableLink] = useState(false);

  // Editor Doubts / Clarifications Modal State
  const [doubtModalJob, setDoubtModalJob] = useState<FreelanceJob | null>(null);
  const [newDoubtQuestion, setNewDoubtQuestion] = useState('');
  const [newDoubtCategory, setNewDoubtCategory] = useState<'song_music' | 'footage_clip' | 'revision_feedback' | 'audio_sync' | 'general'>('general');
  const [newDoubtAskedBy, setNewDoubtAskedBy] = useState('');
  const [isSavingDoubt, setIsSavingDoubt] = useState(false);
  const [resolvingDoubtId, setResolvingDoubtId] = useState<string | null>(null);
  const [doubtResolutionNote, setDoubtResolutionNote] = useState('');
  const [isWhatsAppTemplatesOpen, setIsWhatsAppTemplatesOpen] = useState(false);

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
      return 'BAAWARAY FILMS';
    }
    return job.clientName;
  };

  // Dynamically compute editors allotted to active jobs and unassigned count
  const allottedEditors = useMemo(() => {
    const counts = new Map<string, number>();
    let unassigned = 0;

    freelanceJobs.forEach(j => {
      if (j.stage === 'completed') return;
      const name = j.editorName?.trim();
      if (!name || name === 'Unassigned' || name.startsWith('⚠️')) {
        unassigned++;
      } else {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    });

    pendingDeliverables.forEach(p => {
      const name = p.editorName?.trim();
      if (!name || name === 'Unassigned' || name.startsWith('⚠️')) {
        unassigned++;
      } else {
        counts.set(name, (counts.get(name) || 0) + 1);
      }
    });

    const list = Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    return { list, unassigned };
  }, [freelanceJobs, pendingDeliverables]);

  const filteredJobs = useMemo(() => {
    // The studio's own pending work sits first: it is the work that cannot start
    // until someone does something about it.
    const result = [...pendingDeliverables, ...freelanceJobs].filter(job => {
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

      // Filter: Allotted Team Member (selectedEditor dropdown or filter=editor:...)
      const activeEditorFilter = selectedEditor !== 'all'
        ? selectedEditor
        : filter.startsWith('editor:')
        ? filter.slice('editor:'.length)
        : null;

      if (activeEditorFilter) {
        const name = job.editorName?.trim() || '';
        if (activeEditorFilter === 'unassigned') {
          if (name && name !== 'Unassigned' && !name.startsWith('⚠️')) return false;
        } else {
          if (name.toLowerCase() !== activeEditorFilter.toLowerCase()) return false;
        }
      }

      // Filter: Unassigned
      if (filter === 'unassigned') {
        return !job.editorName || job.editorName.trim() === '';
      }

      // Filter: Data Pending
      if (filter === 'data_pending') {
        return isDataPending(job);
      }

      // If pending deliverable (awaiting footage):
      const isPending = !!(job as PendingRow).pendingDeliverable;
      if (isPending) {
        if (filter === 'all' || filter === 'active') return true;
        if (filter === 'overdue') {
          const targetDue = job.dueDate;
          if (!targetDue) return false;
          const dueStatus = getDueDateStatus(targetDue);
          return dueStatus.isOverdue || dueStatus.daysRemaining <= 1;
        }
        return false;
      }

      // Filter: Stages
      if (filter === 'active') {
        return job.stage !== 'completed';
      }
      if (filter === 'revisions') {
        return job.stage === 'changes_received' || job.stage === 'changes_sent_to_editor';
      }
      if (['data_received', 'sent_to_editor', 'draft_received', 'sent_to_client', 'final_delivered', 'completed'].includes(filter)) {
        return job.stage === filter;
      }

      // Filter: Payment / Alert
      if (filter === 'client_due') {
        return job.clientPaymentStatus !== 'paid';
      }
      if (filter === 'editor_due') {
        return job.editorPaymentStatus !== 'paid' && freelanceJobEditorCost(job) > 0;
      }
      if (filter === 'overdue') {
        const targetDue = freelanceDueDate(job);
        const dueStatus = getDueDateStatus(targetDue);
        return dueStatus.isOverdue || dueStatus.daysRemaining <= 1;
      }

      return true;
    });

    result.sort((a, b) => {
      if (sortBy === 'due_asc' || sortBy === 'due_desc') {
        const dueA = freelanceDueDate(a) || a.dueDate || '';
        const dueB = freelanceDueDate(b) || b.dueDate || '';
        if (!dueA && !dueB) return 0;
        if (!dueA) return 1;
        if (!dueB) return -1;
        const comp = dueA.localeCompare(dueB);
        return sortBy === 'due_asc' ? comp : -comp;
      }
      if (sortBy === 'created_desc') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeB - timeA;
      }
      if (sortBy === 'created_asc') {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return timeA - timeB;
      }
      if (sortBy === 'title_asc') {
        const titleA = getJobDisplayTitle(a) || '';
        const titleB = getJobDisplayTitle(b) || '';
        return titleA.localeCompare(titleB);
      }
      if (sortBy === 'client_asc') {
        const clientA = getJobDisplayClient(a) || '';
        const clientB = getJobDisplayClient(b) || '';
        return clientA.localeCompare(clientB);
      }
      if (sortBy === 'editor_asc') {
        const edA = a.editorName || '';
        const edB = b.editorName || '';
        if (!edA && !edB) return 0;
        if (!edA) return 1;
        if (!edB) return -1;
        return edA.localeCompare(edB);
      }
      if (sortBy === 'amount_desc') {
        return (b.clientCharge || 0) - (a.clientCharge || 0);
      }
      if (sortBy === 'amount_asc') {
        return (a.clientCharge || 0) - (b.clientCharge || 0);
      }
      return 0;
    });

    return result;
  }, [pendingDeliverables, freelanceJobs, searchQuery, filter, selectedEditor, sortBy, clients, freelanceJobEditorCost]);

  // Stage & filter counts
  const stageCounts = useMemo(() => {
    const unassignedPending = pendingDeliverables.length;
    const unassignedReal = freelanceJobs.filter(j => !j.editorName || j.editorName.trim() === '').length;
    const dataPendingCount =
      pendingDeliverables.length +
      freelanceJobs.filter(
        j => j.stage !== 'completed' && (!j.rawDataLink || !j.rawDataLink.trim()) && j.rawDataSource !== 'hard_drive'
      ).length;
    const overduePending = pendingDeliverables.filter(p => {
      if (!p.dueDate) return false;
      const s = getDueDateStatus(p.dueDate);
      return s.isOverdue || s.daysRemaining <= 1;
    }).length;
    const overdueReal = freelanceJobs.filter(j => {
      const s = getDueDateStatus(freelanceDueDate(j));
      return s.isOverdue || s.daysRemaining <= 1;
    }).length;

    return {
      all: freelanceJobs.length + pendingDeliverables.length,
      unassigned: unassignedReal + unassignedPending,
      data_pending: dataPendingCount,
      active: freelanceJobs.filter(j => j.stage !== 'completed').length + pendingDeliverables.length,
      data_received: freelanceJobs.filter(j => j.stage === 'data_received').length,
      sent_to_editor: freelanceJobs.filter(j => j.stage === 'sent_to_editor').length,
      draft_received: freelanceJobs.filter(j => j.stage === 'draft_received').length,
      sent_to_client: freelanceJobs.filter(j => j.stage === 'sent_to_client').length,
      revisions: freelanceJobs.filter(j => j.stage === 'changes_received' || j.stage === 'changes_sent_to_editor').length,
      final_delivered: freelanceJobs.filter(j => j.stage === 'final_delivered').length,
      completed: freelanceJobs.filter(j => j.stage === 'completed').length,
      client_due: freelanceJobs.filter(j => j.clientPaymentStatus !== 'paid').length,
      editor_due: freelanceJobs.filter(j => j.editorPaymentStatus !== 'paid' && freelanceJobEditorCost(j) > 0).length,
      overdue: overdueReal + overduePending,
    };
  }, [freelanceJobs, pendingDeliverables, freelanceJobEditorCost]);

  /** See the note in FreelanceJobDetailModal: the country lives on the studio. */
  const clientWhatsAppNumber = (job: FreelanceJob): string => {
    const studio = job.freelanceClientId
      ? freelanceClients.find(c => c.id === job.freelanceClientId)
      : undefined;
    return toWhatsAppNumber(job.clientPhone, studio?.dialCode) || '';
  };

  // Fast WhatsApp handlers
  const dispatchShareDataWhatsApp = (job: FreelanceJob, overrideRawLink?: string) => {
    const rawLink = overrideRawLink !== undefined ? overrideRawLink : (job.rawDataLink || '');
    const phone = toWhatsAppNumber(job.editorPhone) || '';
    const text = encodeURIComponent(
      renderWhatsAppMessage(
        'editor_assign',
        {
          editorName: job.editorName || 'Editor',
          projectName: getJobDisplayTitle(job),
          jobCode: job.jobCode,
          serviceType: job.serviceType,
          dueDate: job.dueDate || '',
          link: rawLink,
          referenceLink: job.referenceLink || '',
          instructions: job.editingInstructions || '',
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_editor', 'Shared raw data link with editor via WhatsApp');
  };

  const handleShareDataWhatsApp = (job: FreelanceJob) => {
    if (!job.rawDataLink || !job.rawDataLink.trim()) {
      setRawLinkPromptJob(job);
      setRawLinkInput('');
      return;
    }
    dispatchShareDataWhatsApp(job);
  };

  const handleSaveRawData = async (sendWhatsApp: boolean = false) => {
    if (!rawLinkPromptJob) return;
    setIsSavingRawLink(true);
    try {
      const updates: Partial<FreelanceJob> = {};
      if (rawSourceType === 'hard_drive') {
        updates.rawDataSource = 'hard_drive';
        updates.hddStatus = rawHddStatus;
        updates.hardDriveNotes = rawHddNotes.trim() || undefined;
      } else {
        const link = rawLinkInput.trim();
        updates.rawDataSource = rawSourceType === 'partner_upload' ? 'link' : 'upload';
        updates.rawDataLink = link || undefined;
      }

      await updateFreelanceJob(rawLinkPromptJob.id, updates, 'Updated raw data info');

      if (sendWhatsApp) {
        dispatchShareDataWhatsApp(rawLinkPromptJob, updates.rawDataLink || '');
      }

      setRawLinkPromptJob(null);
      setRawLinkInput('');
      setRawHddNotes('');
    } catch (err: any) {
      console.error('Failed to save raw data:', err);
      alert('Failed to save raw data. Please try again.');
    } finally {
      setIsSavingRawLink(false);
    }
  };

  const handleSaveExtraData = async () => {
    if (!extraDataPromptJob) return;
    const title = extraDataTitle.trim();
    if (!title) {
      alert('Please enter a description or label for the extra data.');
      return;
    }
    const url = extraDataUrl.trim();
    setIsSavingExtraData(true);
    try {
      const newExtra: FreelanceExtraData = {
        id: `extra-${Date.now()}`,
        title,
        url: url || undefined,
        sourceType: extraDataSourceType,
        notes: extraDataNotes.trim() || undefined,
        addedAt: new Date().toISOString().slice(0, 10),
      };
      const updatedList = [...(extraDataPromptJob.additionalDataLinks || []), newExtra];
      await updateFreelanceJob(extraDataPromptJob.id, { additionalDataLinks: updatedList }, `Added additional footage: ${title}`);

      if (extraDataNotifyWhatsApp && extraDataPromptJob.editorPhone) {
        const phone = toWhatsAppNumber(extraDataPromptJob.editorPhone) || '';
        const text = encodeURIComponent(
          renderWhatsAppMessage(
            'editor_extra_data',
            {
              editorName: extraDataPromptJob.editorName || 'Editor',
              projectName: getJobDisplayTitle(extraDataPromptJob),
              jobCode: extraDataPromptJob.jobCode,
              title,
              link: url,
              notes: extraDataNotes.trim(),
            },
            studioSettings?.studioName || 'Baawaray Films'
          )
        );
        window.open(getWhatsAppUrl(phone, text), '_blank');
      }

      setExtraDataPromptJob(null);
      setExtraDataTitle('');
      setExtraDataUrl('');
      setExtraDataNotes('');
    } catch (err: any) {
      console.error('Failed to save additional data:', err);
      alert('Failed to save additional data. Please try again.');
    } finally {
      setIsSavingExtraData(false);
    }
  };

  const handleSaveCut = async () => {
    if (!receiveCutPromptJob) return;
    const link = receiveCutLinkInput.trim();
    if (!link) {
      alert('Please enter a review / cut delivery link.');
      return;
    }
    setIsSavingCut(true);
    try {
      const updates: Partial<FreelanceJob> = { deliveryLink: link };
      const notes = receiveCutEditorNotes.trim();

      if (notes && receiveCutPromptJob.revisions && receiveCutPromptJob.revisions.length > 0) {
        const revs = [...receiveCutPromptJob.revisions];
        const lastIdx = revs.length - 1;
        revs[lastIdx] = {
          ...revs[lastIdx],
          editorNotes: notes,
          editorFeedbackDate: new Date().toISOString().slice(0, 10),
          status: 'resolved',
        };
        updates.revisions = revs;
      }

      await updateFreelanceJob(
        receiveCutPromptJob.id,
        updates,
        notes ? `Attached cut link and logged editor feedback: ${notes.slice(0, 60)}` : 'Attached/updated review cut link'
      );
      await advanceFreelanceJobStage(receiveCutPromptJob.id, 'internal_review', 'Cut received from editor. Moved to Studio Review.');

      setReceiveCutPromptJob(null);
      setReceiveCutLinkInput('');
      setReceiveCutEditorNotes('');
    } catch (err: any) {
      console.error('Failed to save cut link:', err);
      alert('Failed to save review cut. Please try again.');
    } finally {
      setIsSavingCut(false);
    }
  };

  const dispatchShareDraftWhatsApp = (job: FreelanceJob, overrideLink?: string) => {
    const draftLink = overrideLink !== undefined ? overrideLink : deliveryLinkOf(job);
    const phone = clientWhatsAppNumber(job);
    const clientName = getJobDisplayClient(job);
    const text = encodeURIComponent(
      renderWhatsAppMessage(
        'client_draft',
        {
          clientName,
          projectName: getJobDisplayTitle(job),
          jobCode: job.jobCode,
          serviceType: job.serviceType,
          link: draftLink || '',
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'sent_to_client', 'Shared draft link with client for review via WhatsApp');
  };

  const handleShareDraftWhatsApp = (job: FreelanceJob) => {
    const currentLink = deliveryLinkOf(job);
    if (!currentLink || !currentLink.trim()) {
      setDeliverableLinkPromptJob({ job, type: 'draft' });
      setDeliverableLinkInput('');
      return;
    }
    dispatchShareDraftWhatsApp(job);
  };

  const dispatchShareFinalWhatsApp = (job: FreelanceJob, overrideLink?: string) => {
    const finalLink = overrideLink !== undefined ? overrideLink : deliveryLinkOf(job);
    const phone = clientWhatsAppNumber(job);
    const clientBal = freelanceJobPayment(job).balance;
    const clientName = getJobDisplayClient(job);
    const text = encodeURIComponent(
      renderWhatsAppMessage(
        'client_final',
        {
          clientName,
          projectName: getJobDisplayTitle(job),
          jobCode: job.jobCode,
          link: finalLink || '',
          balance: clientBal > 0 ? inrDigits(clientBal) : '',
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');
    advanceFreelanceJobStage(job.id, 'completed', 'Delivered final master link to client via WhatsApp and marked completed');
  };

  const handleShareFinalWhatsApp = (job: FreelanceJob) => {
    const currentLink = deliveryLinkOf(job);
    if (!currentLink || !currentLink.trim()) {
      setDeliverableLinkPromptJob({ job, type: 'final' });
      setDeliverableLinkInput('');
      return;
    }
    dispatchShareFinalWhatsApp(job);
  };

  const handleSendFollowUpWhatsApp = async (job: FreelanceJob) => {
    const phone = clientWhatsAppNumber(job);
    const clientName = getJobDisplayClient(job);
    const previewLink = deliveryLinkOf(job) || '';
    const today = new Date().toISOString().slice(0, 10);
    const nextCount = (job.followUpCount || 0) + 1;

    const text = encodeURIComponent(
      renderWhatsAppMessage(
        'client_followup',
        {
          clientName,
          projectName: getJobDisplayTitle(job),
          jobCode: job.jobCode,
          link: previewLink,
          sentDate: job.sentToClientDate || '',
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');

    try {
      await updateFreelanceJob(
        job.id,
        {
          lastFollowUpDate: today,
          followUpCount: nextCount,
        },
        `Sent review follow-up to client via WhatsApp (#${nextCount})`
      );
    } catch (err) {
      console.error('Failed to log follow-up on job:', err);
    }
  };

  const handleSaveAndSendDeliverableLink = async () => {
    if (!deliverableLinkPromptJob) return;
    const { job, type } = deliverableLinkPromptJob;
    const link = deliverableLinkInput.trim();
    if (!link) {
      alert('Please enter a valid deliverable download link or click "Deliver without link".');
      return;
    }
    setIsSavingDeliverableLink(true);
    try {
      await updateFreelanceJob(job.id, { deliveryLink: link }, `Attached ${type === 'final' ? 'master' : 'draft'} delivery link`);
      if (type === 'final') {
        dispatchShareFinalWhatsApp(job, link);
      } else {
        dispatchShareDraftWhatsApp(job, link);
      }
      setDeliverableLinkPromptJob(null);
      setDeliverableLinkInput('');
    } catch (err: any) {
      console.error('Failed to save deliverable link:', err);
      alert('Failed to save deliverable link. Please try again.');
    } finally {
      setIsSavingDeliverableLink(false);
    }
  };

  const handleSendWithoutDeliverableLink = () => {
    if (!deliverableLinkPromptJob) return;
    const { job, type } = deliverableLinkPromptJob;
    if (type === 'final') {
      dispatchShareFinalWhatsApp(job, '');
    } else {
      dispatchShareDraftWhatsApp(job, '');
    }
    setDeliverableLinkPromptJob(null);
    setDeliverableLinkInput('');
  };

  // Stage-Adaptive Date and Milestone Helper
  const getJobStageDateInfo = (job: FreelanceJob, targetDueDate: string, dueStatus: { label: string; color: string }) => {
    switch (job.stage) {
      case 'pending_assignment':
        return {
          icon: Calendar,
          label: 'Created:',
          dateStr: job.createdAt || 'Pending',
          badgeText: 'Awaiting Assignment',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
        };
      case 'data_received':
        return {
          icon: HardDrive,
          label: 'Data In:',
          dateStr: job.dataReceivedDate || job.createdAt || 'Logged',
          badgeText: job.editorName ? 'Editor Assigned' : 'Ready for Editor',
          badgeClass: 'bg-sky-50 text-sky-800 border-sky-200',
        };
      case 'editor_assigned':
      case 'sent_to_editor':
        return {
          icon: Clock,
          label: 'Due:',
          dateStr: targetDueDate || (job.sentToEditorDate ? `Sent ${job.sentToEditorDate}` : 'Unscheduled'),
          badgeText: targetDueDate ? dueStatus.label : 'In Progress',
          badgeClass: `${dueStatus.color} font-bold`,
        };
      case 'draft_received':
      case 'internal_review':
        return {
          icon: Film,
          label: 'Draft In:',
          dateStr: job.draftReceivedDate || 'Recent',
          badgeText: 'Needs Studio Review',
          badgeClass: 'bg-purple-50 text-purple-800 border-purple-200 font-bold',
        };
      case 'internal_changes':
        return {
          icon: AlertCircle,
          label: 'Changes Sent:',
          dateStr: job.changesSentToEditorDate || 'Recent',
          badgeText: 'Revising with Editor',
          badgeClass: 'bg-amber-50 text-amber-800 border-amber-200 font-bold',
        };
      case 'sent_to_client': {
        let reviewBadge = 'Client Review';
        if (job.sentToClientDate) {
          const todayMs = new Date().setHours(0, 0, 0, 0);
          const sentMs = new Date(job.sentToClientDate).setHours(0, 0, 0, 0);
          const diffDays = Math.max(0, Math.floor((todayMs - sentMs) / 86400000));
          if (diffDays === 0) reviewBadge = 'Sent Today (Day 1 of 2)';
          else if (diffDays === 1) reviewBadge = 'Day 2 of 2';
          else reviewBadge = `${diffDays}d in review`;
        }
        if (job.lastFollowUpDate) {
          const todayStr = new Date().toISOString().slice(0, 10);
          const followStr = job.lastFollowUpDate === todayStr ? 'Followed up today' : `Followed up ${job.lastFollowUpDate}`;
          reviewBadge += ` • ${followStr}${job.followUpCount && job.followUpCount > 1 ? ` (x${job.followUpCount})` : ''}`;
        }
        return {
          icon: MessageCircle,
          label: 'Sent to Client:',
          dateStr: job.sentToClientDate || 'Under Review',
          badgeText: reviewBadge,
          badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200 font-bold',
        };
      }
      case 'changes_received':
      case 'changes_sent_to_editor':
        return {
          icon: MessageSquare,
          label: 'Changes In:',
          dateStr: job.changesReceivedDate || (job.changesDueDate ? `Due: ${job.changesDueDate}` : 'Recent'),
          badgeText: job.changesDueDate ? dueStatus.label : 'Revision Underway',
          badgeClass: 'bg-rose-50 text-rose-800 border-rose-200 font-bold',
        };
      case 'final_delivered':
        return {
          icon: CheckCircle2,
          label: 'Approved:',
          dateStr: job.finalDeliveredDate || 'Client Approved',
          badgeText: 'Ready to Deliver Master',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
        };
      case 'completed':
        return {
          icon: CheckCircle2,
          label: 'Completed:',
          dateStr: job.completedDate || job.finalDeliveredDate || 'Done',
          badgeText: 'Project Delivered',
          badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-bold',
        };
      default:
        return {
          icon: Clock,
          label: 'Due:',
          dateStr: targetDueDate || 'Unscheduled',
          badgeText: targetDueDate ? dueStatus.label : 'Active',
          badgeClass: `${dueStatus.color} font-bold`,
        };
    }
  };

  // Recent Activity Helper
  const getJobRecentActivity = (job: FreelanceJob): { text: string; time: string } | null => {
    if (job.activityLogs && job.activityLogs.length > 0) {
      const last = job.activityLogs[job.activityLogs.length - 1];
      let time = '';
      try {
        const d = new Date(last.timestamp);
        time = d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
      } catch {
        time = '';
      }
      return { text: last.action || last.details || 'Activity updated', time };
    }
    if (job.doubts && job.doubts.length > 0) {
      const lastDoubt = job.doubts[job.doubts.length - 1];
      return {
        text: `Editor Query: ${lastDoubt.question.slice(0, 32)}${lastDoubt.question.length > 32 ? '...' : ''}`,
        time: lastDoubt.askedAt || '',
      };
    }
    if (job.revisions && job.revisions.length > 0) {
      const lastRev = job.revisions[job.revisions.length - 1];
      return {
        text: `Round ${lastRev.roundNumber} revision logged`,
        time: lastRev.receivedDate || '',
      };
    }
    if (job.stage === 'completed' && (job.completedDate || job.finalDeliveredDate)) {
      return { text: 'Project marked completed', time: job.completedDate || job.finalDeliveredDate || '' };
    }
    if (job.stage === 'final_delivered' && job.finalDeliveredDate) {
      return { text: 'Client approved the draft cut', time: job.finalDeliveredDate };
    }
    if (job.stage === 'sent_to_client' && job.sentToClientDate) {
      return { text: 'Draft cut shared with client for review', time: job.sentToClientDate };
    }
    if (job.draftReceivedDate) {
      return { text: 'Draft cut received from editor', time: job.draftReceivedDate };
    }
    if (job.sentToEditorDate) {
      return { text: `Raw data sent to editor ${job.editorName || ''}`.trim(), time: job.sentToEditorDate };
    }
    if (job.dataReceivedDate) {
      return { text: 'Raw data uploaded & verified', time: job.dataReceivedDate };
    }
    if (job.createdAt) {
      return { text: 'Job created', time: job.createdAt };
    }
    return null;
  };

  // Editor Doubts / Clarification Handlers
  const handleOpenDoubtsModal = (job: FreelanceJob) => {
    setDoubtModalJob(job);
    setNewDoubtQuestion('');
    setNewDoubtCategory('general');
    setNewDoubtAskedBy(job.editorName || 'Editor');
    setResolvingDoubtId(null);
    setDoubtResolutionNote('');
  };

  const handleAddDoubt = async () => {
    if (!doubtModalJob) return;
    const q = newDoubtQuestion.trim();
    if (!q) {
      alert('Please enter the query / doubt details.');
      return;
    }
    setIsSavingDoubt(true);
    try {
      const newDoubt: FreelanceDoubt = {
        id: `doubt-${Date.now()}`,
        question: q,
        category: newDoubtCategory,
        askedBy: newDoubtAskedBy.trim() || doubtModalJob.editorName || 'Editor',
        askedAt: new Date().toISOString().slice(0, 10),
        status: 'open',
      };
      const updatedDoubts = [...(doubtModalJob.doubts || []), newDoubt];
      await updateFreelanceJob(
        doubtModalJob.id,
        { doubts: updatedDoubts },
        `Editor query logged: ${q.slice(0, 40)}`
      );
      setDoubtModalJob({ ...doubtModalJob, doubts: updatedDoubts });
      setNewDoubtQuestion('');
      setNewDoubtCategory('general');
    } catch (err) {
      console.error('Failed to log doubt:', err);
      alert('Failed to log query. Please try again.');
    } finally {
      setIsSavingDoubt(false);
    }
  };

  const handleShareDoubtWhatsApp = async (job: FreelanceJob, doubt: FreelanceDoubt) => {
    const phone = clientWhatsAppNumber(job);
    const clientName = getJobDisplayClient(job);
    const categoryLabels: Record<string, string> = {
      song_music: '🎵 Song / Music Selection',
      footage_clip: '📹 Footage / Missing Clip',
      revision_feedback: '⚠️ Revision Feasibility / Feedback',
      audio_sync: '🔊 Audio / Sync Clarification',
      general: '💬 Editor Query',
    };
    const categoryStr = categoryLabels[doubt.category || 'general'] || 'Editor Query';
    const text = encodeURIComponent(
      renderWhatsAppMessage(
        'client_doubt',
        {
          clientName,
          projectName: getJobDisplayTitle(job),
          jobCode: job.jobCode,
          editorName: doubt.askedBy || job.editorName || 'Editor',
          query: doubt.question,
          category: categoryStr,
        },
        studioSettings?.studioName || 'Baawaray Films'
      )
    );
    window.open(getWhatsAppUrl(phone, text), '_blank');

    const currentDoubts = job.doubts || [];
    const updated = currentDoubts.map(d => (d.id === doubt.id ? { ...d, status: 'shared_with_client' as const } : d));
    try {
      await updateFreelanceJob(job.id, { doubts: updated }, `Shared editor query with client via WhatsApp`);
      if (doubtModalJob && doubtModalJob.id === job.id) {
        setDoubtModalJob({ ...doubtModalJob, doubts: updated });
      }
    } catch (err) {
      console.error('Failed to update doubt status:', err);
    }
  };

  const handleResolveDoubt = async (job: FreelanceJob, doubtId: string, resolutionNote?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    const currentDoubts = job.doubts || [];
    const updated = currentDoubts.map(d =>
      d.id === doubtId
        ? {
            ...d,
            status: 'resolved' as const,
            clientResponse: resolutionNote || 'Resolved by studio/client',
            resolvedAt: today,
          }
        : d
    );
    try {
      await updateFreelanceJob(job.id, { doubts: updated }, `Resolved editor query (${doubtId})`);
      if (doubtModalJob && doubtModalJob.id === job.id) {
        setDoubtModalJob({ ...doubtModalJob, doubts: updated });
      }
      setResolvingDoubtId(null);
      setDoubtResolutionNote('');
    } catch (err) {
      console.error('Failed to resolve doubt:', err);
      alert('Failed to resolve query.');
    }
  };

  const handleDeleteDoubt = async (job: FreelanceJob, doubtId: string) => {
    if (!confirm('Are you sure you want to delete this query?')) return;
    const currentDoubts = job.doubts || [];
    const updated = currentDoubts.filter(d => d.id !== doubtId);
    try {
      await updateFreelanceJob(job.id, { doubts: updated }, `Deleted editor query`);
      if (doubtModalJob && doubtModalJob.id === job.id) {
        setDoubtModalJob({ ...doubtModalJob, doubts: updated });
      }
    } catch (err) {
      console.error('Failed to delete doubt:', err);
    }
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
                Active Jobs
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
            type="button"
            onClick={() => setIsWhatsAppTemplatesOpen(true)}
            className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-[#d4c1a3] hover:border-emerald-500 font-bold text-xs rounded-xl shadow-2xs transition-all cursor-pointer"
            title="Customize WhatsApp message formats for client & editor"
          >
            <MessageSquare className="w-4 h-4 text-emerald-600" />
            <span>WhatsApp Formats</span>
          </button>

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

      {/* Search, Filter & Sort Toolbar */}
      <div className="bg-white rounded-xl p-3.5 border border-[#d4c1a3] shadow-2xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-[#6b6660]" />
            <input
              type="text"
              placeholder="Search client, editor, job code, or title..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-9 py-2 bg-[#f9f8f6]/70 border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] placeholder:text-[#6b6660]/70 focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-2.5 p-0.5 text-[#6b6660] hover:text-[#111417] rounded-md transition-colors cursor-pointer"
                title="Clear search"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Filter & Sort Controls */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl px-2.5 py-1">
              <Filter className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
              <span className="text-[11px] font-bold text-[#6b6660] uppercase tracking-wider shrink-0">Filter:</span>
              <select
                value={filter}
                onChange={e => setFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#111417] focus:outline-none cursor-pointer py-1 pr-1"
              >
                <option value="all">All Jobs ({stageCounts.all})</option>
                <option value="unassigned">⚠️ Unassigned ({stageCounts.unassigned})</option>
                <option value="data_pending">⏳ Data Pending ({stageCounts.data_pending})</option>
                <option disabled className="text-gray-400 font-normal">── Stages ──</option>
                <option value="active">In Progress ({stageCounts.active})</option>
                <option value="data_received">Data Received ({stageCounts.data_received})</option>
                <option value="sent_to_editor">With Editor ({stageCounts.sent_to_editor})</option>
                <option value="draft_received">Draft Received ({stageCounts.draft_received})</option>
                <option value="sent_to_client">Client Review ({stageCounts.sent_to_client})</option>
                <option value="revisions">Revisions ({stageCounts.revisions})</option>
                <option value="final_delivered">Final Master ({stageCounts.final_delivered})</option>
                <option value="completed">Completed ({stageCounts.completed})</option>
                <option disabled className="text-gray-400 font-normal">── Financial & Alerts ──</option>
                <option value="client_due">Client Payment Due ({stageCounts.client_due})</option>
                <option value="editor_due">Editor Payout Pending ({stageCounts.editor_due})</option>
                <option value="overdue">Urgent / Due Soon ({stageCounts.overdue})</option>
                {allottedEditors.list.length > 0 && (
                  <>
                    <option disabled className="text-gray-400 font-normal">── Team Member Allotted ──</option>
                    {allottedEditors.list.map(e => (
                      <option key={`editor:${e.name}`} value={`editor:${e.name}`}>
                        Allotted: {e.name} ({e.count})
                      </option>
                    ))}
                  </>
                )}
              </select>
            </div>

            {/* Allotted Team Member Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl px-2.5 py-1">
              <User className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
              <span className="text-[11px] font-bold text-[#6b6660] uppercase tracking-wider shrink-0">Allotted:</span>
              <select
                value={selectedEditor}
                onChange={e => setSelectedEditor(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#111417] focus:outline-none cursor-pointer py-1 pr-1 max-w-[170px] truncate"
              >
                <option value="all">All Members ({stageCounts.active})</option>
                <option value="unassigned">⚠️ Unassigned ({allottedEditors.unassigned})</option>
                {allottedEditors.list.length > 0 && (
                  <option disabled className="text-gray-400 font-normal">── Editors ──</option>
                )}
                {allottedEditors.list.map(e => (
                  <option key={e.name} value={e.name}>
                    {e.name} ({e.count})
                  </option>
                ))}
              </select>
            </div>

            {/* Sort Dropdown */}
            <div className="flex items-center gap-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl px-2.5 py-1">
              <ArrowUpDown className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
              <span className="text-[11px] font-bold text-[#6b6660] uppercase tracking-wider shrink-0">Sort:</span>
              <select
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
                className="bg-transparent text-xs font-bold text-[#111417] focus:outline-none cursor-pointer py-1 pr-1"
              >
                <option value="due_asc">Due Date (Soonest first)</option>
                <option value="due_desc">Due Date (Furthest first)</option>
                <option value="created_desc">Recently Created</option>
                <option value="created_asc">Oldest Created</option>
                <option value="title_asc">Work Title (A → Z)</option>
                <option value="client_asc">Partner Studio / Client (A → Z)</option>
                <option value="editor_asc">Editor Name (A → Z)</option>
                <option value="amount_desc">Highest Value (₹)</option>
                <option value="amount_asc">Lowest Value (₹)</option>
              </select>
            </div>

            {/* Reset button when active */}
            {(filter !== 'all' || selectedEditor !== 'all' || searchQuery.trim() !== '') && (
              <button
                type="button"
                onClick={() => {
                  setFilter('all');
                  setSelectedEditor('all');
                  setSearchQuery('');
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-[#7a2e33]/10 hover:bg-[#7a2e33]/20 text-[#7a2e33] text-xs font-bold rounded-xl transition-all cursor-pointer"
                title="Reset all filters"
              >
                <X className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>
            )}

            {/* Showing count indicator */}
            <span className="text-xs font-semibold text-[#6b6660] ml-auto hidden sm:inline-block">
              {filteredJobs.length} {filteredJobs.length === 1 ? 'project' : 'projects'}
            </span>
          </div>
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
              {searchQuery || filter !== 'all'
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
              const deliverableTitle = pending.deliverable?.title || job.title || '';
              const deliverableDesc = `${deliverableTitle} ${job.serviceType}`.toLowerCase();
              const isAlbum = deliverableDesc.includes('album') || deliverableDesc.includes('sheet');
              const isFrame = deliverableDesc.includes('frame') || deliverableDesc.includes('canvas');

              const transfer = transfers.find(t =>
                t.status !== 'completed' &&
                ((t.target?.id && t.target.id === pending.target.id) ||
                 (t.target?.clientId && String(t.target.clientId) === String(pending.target.clientId) &&
                  t.target?.title && pending.target.title &&
                  t.target.title.trim().toLowerCase() === pending.target.title.trim().toLowerCase()))
              );

              const fraction = transfer ? progressFraction(transfer) : 0;
              const percent = Math.round(fraction * 100);
              const totalBytes = transfer?.scan?.totalBytes || 0;
              const uploadedBytes = transfer?.uploadedBytes || 0;
              const totalFiles = transfer?.scan?.fileCount || 0;
              const completedFiles = transfer?.completedFiles || 0;

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
                      <div className="flex items-center gap-1.5 shrink-0">
                        {transfer ? (
                          <span className={`shrink-0 px-2.5 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                            transfer.status === 'uploading'
                              ? 'bg-blue-50 border border-blue-300 text-blue-800'
                              : transfer.status === 'needs_attention'
                              ? 'bg-red-50 border border-red-300 text-red-800'
                              : transfer.status === 'paused'
                              ? 'bg-amber-50 border border-amber-300 text-amber-800'
                              : transfer.status === 'verifying'
                              ? 'bg-indigo-50 border border-indigo-300 text-indigo-800'
                              : 'bg-emerald-50 border border-emerald-300 text-emerald-800'
                          }`}>
                            {transfer.status === 'uploading' ? (
                              <>
                                <span className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                                ⚡ UPLOADING RAW ({percent}%)
                              </>
                            ) : transfer.status === 'needs_attention' ? (
                              <>⚠️ UPLOAD ATTENTION ({percent}%)</>
                            ) : transfer.status === 'paused' ? (
                              <>⏸️ UPLOAD PAUSED ({percent}%)</>
                            ) : transfer.status === 'verifying' ? (
                              <>🔍 VERIFYING RAW</>
                            ) : (
                              <>⏳ QUEUED IN UP DOWN</>
                            )}
                          </span>
                        ) : isAlbum ? (
                          <span className="shrink-0 px-2.5 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[9px] font-bold uppercase tracking-wider text-amber-800 flex items-center gap-1">
                            <span>⭐</span> Awaiting Album Selection
                          </span>
                        ) : isFrame ? (
                          <span className="shrink-0 px-2.5 py-0.5 rounded-md bg-purple-50 border border-purple-300 text-[9px] font-bold uppercase tracking-wider text-purple-800 flex items-center gap-1">
                            <span>🖼️</span> Awaiting Frame Selection
                          </span>
                        ) : (
                          <span className="shrink-0 px-2 py-0.5 rounded-md bg-[#f9f8f6] border border-[#d4c1a3] text-[9px] font-bold uppercase tracking-wider text-[#6b6660]">
                            Awaiting footage
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleEditPendingDeliverable(pending);
                          }}
                          className="p-1 text-[#6b6660] hover:text-[#7a2e33] hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                          title="Edit Deliverable"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="text-[11px] text-[#6b6660] font-medium">
                      BAAWARAY FILMS{job.dueDate ? ` · Due ${job.dueDate}` : ''}
                    </div>
                    {transfer ? (
                      <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-xl text-[11px] space-y-2">
                        <div className="flex items-center justify-between font-bold text-blue-950">
                          <div className="flex items-center gap-1.5">
                            <UploadCloud className={`w-3.5 h-3.5 ${transfer.status === 'uploading' ? 'text-blue-600 animate-pulse' : 'text-blue-600'}`} />
                            <span>
                              {transfer.status === 'uploading'
                                ? 'Raw Footage Uploading'
                                : transfer.status === 'paused'
                                ? 'Raw Footage Upload Paused'
                                : transfer.status === 'needs_attention'
                                ? 'Upload Needs Attention'
                                : transfer.status === 'verifying'
                                ? 'Verifying Upload'
                                : 'Raw Footage in Queue'}
                            </span>
                          </div>
                          <span className="text-blue-800 font-mono text-[10px] font-bold">{percent}%</span>
                        </div>

                        <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 rounded-full ${
                              transfer.status === 'needs_attention'
                                ? 'bg-red-500'
                                : transfer.status === 'paused'
                                ? 'bg-amber-500'
                                : 'bg-blue-600'
                            }`}
                            style={{ width: `${Math.max(2, percent)}%` }}
                          />
                        </div>

                        <div className="flex items-center justify-between text-[10.5px] text-blue-800">
                          <span>{formatBytes(uploadedBytes)} of {formatBytes(totalBytes)}</span>
                          <span>{completedFiles} of {totalFiles} files</span>
                        </div>

                        {transfer.status === 'needs_attention' && transfer.error && (
                          <div className="text-[10px] text-red-700 bg-red-50 p-1.5 rounded-lg border border-red-200 font-medium">
                            {transfer.error}
                          </div>
                        )}
                      </div>
                    ) : isAlbum ? (
                      <div className="p-2.5 bg-amber-50/70 border border-amber-200/80 rounded-xl text-[11px] text-amber-900 space-y-1">
                        <div className="font-bold flex items-center gap-1 text-amber-950">
                          <span>⭐</span> Album Photo Selection Needed:
                        </div>
                        <p className="leading-relaxed text-amber-800 text-[10.5px]">
                          Client needs to star <strong>200 photos</strong> (40 sheets × 5 photos) in the photo sharing app. Click below to send WhatsApp follow-up.
                        </p>
                      </div>
                    ) : isFrame ? (
                      <div className="p-2.5 bg-purple-50/70 border border-purple-200/80 rounded-xl text-[11px] text-purple-900 space-y-1">
                        <div className="font-bold flex items-center gap-1 text-purple-950">
                          <span>🖼️</span> Frame Selection Needed (4 Frames):
                        </div>
                        <p className="leading-relaxed text-purple-800 text-[10.5px]">
                          Client needs to share screenshots of <strong>4 selected photos</strong> from the photo sharing app. Click below to send WhatsApp follow-up.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-[#6b6660] leading-relaxed">
                        Upload raw rushes or link existing client footage to move this deliverable to Post Production.
                      </p>
                    )}
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
                            disabled={attachingId === pending.target.id}
                            onClick={async () => {
                              try {
                                setAttachingId(pending.target.id);
                                await reuseDeliverableRawData(
                                  pending.target.clientId!,
                                  pending.target.id,
                                  reuse.id,
                                  pending.target.serviceType
                                );
                              } catch (err: any) {
                                console.error('Failed to reuse raw data:', err);
                                alert(err.message || 'Failed to reuse raw data');
                              } finally {
                                setAttachingId(null);
                              }
                            }}
                            className="w-full text-left px-2 py-1.5 bg-white hover:bg-emerald-50 border border-[#d4c1a3]/60 hover:border-emerald-300 rounded-lg text-[11px] text-[#111417] font-medium transition-colors flex items-center justify-between cursor-pointer disabled:opacity-60"
                          >
                            <span className="truncate">{reuse.reusedFromTitle || reuse.title}</span>
                            <span className="shrink-0 text-[10px] text-emerald-700 font-bold ml-1">
                              {attachingId === pending.target.id ? 'Attaching... ⚡' : 'Attach ⚡'}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    {(isAlbum || isFrame) && (
                      <button
                        type="button"
                        onClick={() => handleDirectWhatsAppSelectionFollowUp(job, pending)}
                        className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 bg-[#25D366]/15 hover:bg-[#25D366]/25 border border-[#25D366]/40 text-[#0f5132] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                        title="Open WhatsApp directly requesting photo selection with formula & instructions"
                      >
                        <MessageCircle className="w-4 h-4 text-[#25D366]" />
                        <span>WhatsApp Follow-Up: Request Selection</span>
                      </button>
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setManualRawTarget({ target: pending.target, title: `${job.title} · ${job.serviceType}` })}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#f9f8f6] hover:bg-[#ece7de] border border-[#d4c1a3] text-[#111417] font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                        title="Share offline: scan hard drive folder or log hand-off"
                      >
                        <HardDrive className="w-3.5 h-3.5 text-[#7a2e33]" />
                        <span>Share Offline</span>
                      </button>
                      {transfer ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (onViewTransfer) onViewTransfer(transfer.id);
                            else onGoToQueue?.();
                          }}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#111417] hover:bg-stone-800 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                          title="Open and manage this transfer in Up Down Queue"
                        >
                          <ArrowUpDown className="w-3.5 h-3.5 text-emerald-400" />
                          <span>View in Queue ({percent}%)</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={!onUploadForDeliverable}
                          onClick={() => onUploadForDeliverable?.(pending.target)}
                          className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-[#7a2e33] hover:bg-[#632529] text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer"
                        >
                          <Upload className="w-3.5 h-3.5" />
                          <span>Upload raw</span>
                        </button>
                      )}
                    </div>
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
                  {/* Job Code & Stage Badge + Edit Button */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-xs text-[#7a2e33] bg-[#f9f8f6] px-2 py-0.5 rounded border border-[#d4c1a3]">
                      {job.jobCode}
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full ${stageMeta.badgeClass}`}>
                        {stageMeta.label}
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingJob(job);
                          setIsNewJobModalOpen(true);
                        }}
                        className="p-1 text-[#6b6660] hover:text-[#7a2e33] hover:bg-stone-100 rounded-lg transition-colors cursor-pointer"
                        title="Edit Job"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                    </div>
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
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-[#6b6660] uppercase font-bold">Editor</span>
                        <button
                          type="button"
                          onClick={() => setAssigningJob(job)}
                          className="text-[10px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                        >
                          {job.editorName ? 'Change' : 'Assign'}
                        </button>
                      </div>
                      <div className="font-semibold text-[#111417] truncate">
                        {job.editorName ? (
                          job.editorName
                        ) : (
                          <span className="text-amber-700 font-semibold">Unassigned</span>
                        )}
                      </div>
                      <div className="text-[10px] text-[#6b6660] font-mono truncate">
                        {job.editorName ? (job.editorPhone || (job.assignedType === 'in_house' ? 'In-House' : 'Freelance')) : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Stage-Adaptive Date & Turnaround Status with Recent Activity */}
                  {(() => {
                    const stageDate = getJobStageDateInfo(job, targetDueDate, dueStatus);
                    const recentAct = getJobRecentActivity(job);
                    const StageIcon = stageDate.icon;
                    return (
                      <div className="p-2.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60 text-xs space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <StageIcon className="w-3.5 h-3.5 text-[#7a2e33] shrink-0" />
                            <span className="text-[11px] text-[#6b6660] truncate">
                              {stageDate.label}{' '}
                              <strong className="text-[#111417] font-semibold">{stageDate.dateStr}</strong>
                            </span>
                          </div>
                          <span className={`text-[10px] px-2 py-0.5 rounded-full shrink-0 border ${stageDate.badgeClass}`}>
                            {stageDate.badgeText}
                          </span>
                        </div>
                        {recentAct && (
                          <div className="flex items-center justify-between text-[10px] text-[#8c827a] pt-1 border-t border-[#d4c1a3]/30">
                            <span className="truncate max-w-[210px]" title={recentAct.text}>
                              Recent: {recentAct.text}
                            </span>
                            {recentAct.time && (
                              <span className="shrink-0 font-mono text-[9px] text-[#6b6660]">
                                {recentAct.time}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Data Intake & Logistics Section */}
                  <div className="p-2.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/70 space-y-2">
                    {(() => {
                      const jobTarget: WorkTarget = {
                        kind: 'freelance',
                        id: job.id,
                        title: job.title,
                        clientName: job.clientName,
                        serviceType: job.serviceType,
                        purpose: 'raw',
                        jobCode: job.jobCode,
                        dueDate: freelanceDueDate(job),
                      };

                      const freelanceTransfer = transfers.find(t =>
                        t.status !== 'completed' &&
                        t.target?.kind === 'freelance' &&
                        t.target.id === job.id
                      );

                      if (freelanceTransfer) {
                        const fraction = progressFraction(freelanceTransfer);
                        const percent = Math.round(fraction * 100);
                        const totalBytes = freelanceTransfer.scan?.totalBytes || 0;
                        const uploadedBytes = freelanceTransfer.uploadedBytes || 0;
                        const totalFiles = freelanceTransfer.scan?.fileCount || 0;
                        const completedFiles = freelanceTransfer.completedFiles || 0;

                        return (
                          <div className="p-2.5 bg-blue-50/70 border border-blue-200/80 rounded-lg text-[11px] space-y-2">
                            <div className="flex items-center justify-between font-bold text-blue-950">
                              <div className="flex items-center gap-1.5">
                                <UploadCloud className={`w-3.5 h-3.5 ${freelanceTransfer.status === 'uploading' ? 'text-blue-600 animate-pulse' : 'text-blue-600'}`} />
                                <span>
                                  {freelanceTransfer.status === 'uploading'
                                    ? 'Raw Footage Uploading'
                                    : freelanceTransfer.status === 'paused'
                                    ? 'Raw Footage Upload Paused'
                                    : freelanceTransfer.status === 'needs_attention'
                                    ? 'Upload Needs Attention'
                                    : freelanceTransfer.status === 'verifying'
                                    ? 'Verifying Upload'
                                    : 'Raw Footage in Queue'}
                                </span>
                              </div>
                              <span className="text-blue-800 font-mono text-[10px] font-bold">{percent}%</span>
                            </div>

                            <div className="w-full h-1.5 bg-blue-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 rounded-full ${
                                  freelanceTransfer.status === 'needs_attention'
                                    ? 'bg-red-500'
                                    : freelanceTransfer.status === 'paused'
                                    ? 'bg-amber-500'
                                    : 'bg-blue-600'
                                }`}
                                style={{ width: `${Math.max(2, percent)}%` }}
                              />
                            </div>

                            <div className="flex items-center justify-between text-[10.5px] text-blue-800">
                              <span>{formatBytes(uploadedBytes)} of {formatBytes(totalBytes)}</span>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (onViewTransfer) onViewTransfer(freelanceTransfer.id);
                                  else onGoToQueue?.();
                                }}
                                className="font-bold underline hover:text-blue-950 cursor-pointer flex items-center gap-0.5"
                              >
                                <ArrowUpDown className="w-3 h-3 text-emerald-600" />
                                <span>View in Queue ↗</span>
                              </button>
                            </div>

                            {freelanceTransfer.status === 'needs_attention' && freelanceTransfer.error && (
                              <div className="text-[10px] text-red-700 bg-red-50 p-1.5 rounded-lg border border-red-200 font-medium">
                                {freelanceTransfer.error}
                              </div>
                            )}
                          </div>
                        );
                      }

                      return (
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            {job.rawDataSource === 'hard_drive' ? (
                              <>
                                <HardDrive className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                                <span className="text-[11px] font-bold text-amber-900 truncate">
                                  HDD: {job.hddStatus === 'sent_to_editor' ? 'With Editor 🚚' : 'At Studio 💽'}
                                </span>
                              </>
                            ) : job.rawDataLink ? (
                              <>
                                <LinkIcon className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <a
                                  href={job.rawDataLink}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-blue-700 font-semibold hover:underline truncate"
                                  title={job.rawDataLink}
                                >
                                  ☁️ Raw Footage Attached
                                </a>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                                <span className="text-[11px] text-amber-800 font-semibold truncate">
                                  Data Pending
                                </span>
                              </>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            {job.rawDataLink || job.rawDataSource === 'hard_drive' ? (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRawLinkPromptJob(job);
                                    setRawSourceType(job.rawDataSource === 'hard_drive' ? 'hard_drive' : 'partner_upload');
                                    setRawLinkInput(job.rawDataLink || '');
                                    setRawHddStatus(job.hddStatus === 'sent_to_editor' ? 'sent_to_editor' : 'received_by_studio');
                                    setRawHddNotes(job.hardDriveNotes || '');
                                  }}
                                  className="text-[10.5px] font-bold text-amber-800 hover:text-amber-950 hover:underline cursor-pointer"
                                >
                                  Edit
                                </button>
                                <span className="text-[#d4c1a3]">|</span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setExtraDataPromptJob(job);
                                    setExtraDataTitle('');
                                    setExtraDataUrl('');
                                    setExtraDataNotes('');
                                    setExtraDataSourceType('cloud_upload');
                                  }}
                                  className="text-[10.5px] font-bold text-[#7a2e33] hover:underline cursor-pointer"
                                  title="Append additional footage or extra clips"
                                >
                                  + Add Clip
                                </button>
                              </>
                            ) : (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={!onUploadForDeliverable}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onUploadForDeliverable?.(jobTarget);
                                  }}
                                  className="px-2 py-1 bg-[#7a2e33] hover:bg-[#632529] text-white text-[10px] font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all disabled:opacity-40"
                                  title="Scan local folder to upload raw footage to Google Drive"
                                >
                                  <UploadCloud className="w-3 h-3" />
                                  <span>Upload</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setManualRawTarget({ target: jobTarget, title: `${job.title} · ${job.serviceType}` });
                                  }}
                                  className="px-2 py-1 bg-white hover:bg-stone-100 border border-[#d4c1a3] text-[#111417] text-[10px] font-bold rounded-lg shadow-2xs flex items-center gap-1 cursor-pointer transition-all"
                                  title="Scan hard drive folder or log courier / offline handover"
                                >
                                  <HardDrive className="w-3 h-3 text-[#7a2e33]" />
                                  <span>Offline</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setRawLinkPromptJob(job);
                                    setRawSourceType('partner_upload');
                                    setRawLinkInput('');
                                    setRawHddNotes('');
                                  }}
                                  className="px-1.5 py-1 text-blue-700 hover:text-blue-900 text-[10px] font-bold hover:underline cursor-pointer"
                                  title="Paste link from partner studio (GDrive/Dropbox/WeTransfer)"
                                >
                                  Link
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* Appended / Extra Data list if any */}
                    {job.additionalDataLinks && job.additionalDataLinks.length > 0 && (
                      <div className="pt-1.5 border-t border-[#d4c1a3]/50 space-y-1">
                        <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
                          Additional Data ({job.additionalDataLinks.length}):
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {job.additionalDataLinks.map((extra) => (
                            <span
                              key={extra.id}
                              className="inline-flex items-center gap-1 px-2 py-0.5 bg-white border border-[#d4c1a3] rounded-md text-[10px] text-[#111417]"
                            >
                              <span className="font-semibold truncate max-w-[120px]" title={extra.title}>
                                {extra.title}
                              </span>
                              {extra.url && (
                                <a
                                  href={extra.url}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-blue-600 hover:underline"
                                  title="Open footage link"
                                >
                                  ↗
                                </a>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Project Delivery Cut (The Single Link Rule) */}
                  <div className="flex items-center justify-between p-2.5 bg-white rounded-xl border border-[#d4c1a3] text-xs shadow-2xs">
                    <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                      <Film className={`w-3.5 h-3.5 shrink-0 ${deliveryLinkOf(job) ? 'text-purple-600' : 'text-stone-400'}`} />
                      {deliveryLinkOf(job) ? (
                        <a
                          href={deliveryLinkOf(job)}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-[11px] text-purple-700 font-bold hover:underline truncate"
                          title={deliveryLinkOf(job)}
                        >
                          🎬 Review Cut Attached (Open ↗)
                        </a>
                      ) : (
                        <span className="text-[11px] text-stone-500 font-medium truncate">
                          No cut link attached yet
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setReceiveCutPromptJob(job);
                        setReceiveCutLinkInput(deliveryLinkOf(job) || '');
                        setReceiveCutEditorNotes('');
                      }}
                      className="text-[10px] font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer shrink-0"
                    >
                      {deliveryLinkOf(job) ? 'Edit ✎' : '+ Attach Cut'}
                    </button>
                  </div>

                  {/* Revisions & Editor Notes Highlight */}
                  {job.revisions && job.revisions.length > 0 && (() => {
                    const latestRev = job.revisions[job.revisions.length - 1];
                    return (
                      <div className="p-2 bg-amber-50/80 border border-amber-200 rounded-xl space-y-1 text-xs">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                          <span>Revision Round #{latestRev.roundNumber} ({job.revisions.length} total)</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-amber-200/80 text-amber-950 rounded font-semibold">2-Day Turnaround</span>
                        </div>
                        {latestRev.feedbackNotes && (
                          <p className="text-[11px] text-amber-900/80 line-clamp-1">
                            <span className="font-semibold">Notes:</span> {latestRev.feedbackNotes}
                          </p>
                        )}
                        {latestRev.editorNotes && (
                          <div className="mt-1 p-1.5 bg-white/90 border border-amber-300 rounded-lg text-[11px] text-[#7a2e33]">
                            <span className="font-bold">📝 Editor Response:</span> {latestRev.editorNotes}
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Editor Doubts / Clarifications Banner */}
                  {(() => {
                    const doubts = job.doubts || [];
                    const openDoubts = doubts.filter(d => d.status !== 'resolved');
                    const latestOpenDoubt = openDoubts[openDoubts.length - 1];

                    if (openDoubts.length > 0 && latestOpenDoubt) {
                      return (
                        <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-2.5 space-y-1.5 shadow-2xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-start gap-1.5 min-w-0">
                              <HelpCircle className="w-3.5 h-3.5 text-amber-700 shrink-0 mt-0.5" />
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-extrabold text-amber-950 uppercase tracking-wider">
                                    Editor Query ({openDoubts.length})
                                  </span>
                                  <span className="text-[9px] px-1.5 py-0.2 bg-amber-200/80 text-amber-900 rounded font-semibold">
                                    {latestOpenDoubt.category === 'song_music'
                                      ? '🎵 Song Choice'
                                      : latestOpenDoubt.category === 'revision_feedback'
                                      ? '⚠️ Revision Feedback'
                                      : latestOpenDoubt.category === 'footage_clip'
                                      ? '📹 Clip Query'
                                      : latestOpenDoubt.category === 'audio_sync'
                                      ? '🔊 Audio Sync'
                                      : '💬 Query'}
                                  </span>
                                  {latestOpenDoubt.status === 'shared_with_client' && (
                                    <span className="text-[9px] px-1.5 py-0.2 bg-sky-100 text-sky-800 rounded font-semibold">
                                      Sent to Client
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-stone-800 font-medium line-clamp-1 mt-0.5" title={latestOpenDoubt.question}>
                                  "{latestOpenDoubt.question}"
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleShareDoubtWhatsApp(job, latestOpenDoubt);
                                }}
                                className="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                                title="Share query with client on WhatsApp"
                              >
                                <MessageCircle className="w-3 h-3" />
                                <span>{latestOpenDoubt.status === 'shared_with_client' ? 'Re-send' : 'Ask Client'}</span>
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleOpenDoubtsModal(job);
                                }}
                                className="p-1 text-stone-600 hover:text-stone-900 hover:bg-amber-200/50 rounded-lg cursor-pointer"
                                title="Manage all queries"
                              >
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div className="flex items-center justify-between text-[11px] px-2.5 py-1.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/50">
                        <span className="text-stone-500 flex items-center gap-1">
                          <HelpCircle className="w-3.5 h-3.5 text-stone-400" />
                          <span>Editor Doubts / Feedback:</span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenDoubtsModal(job);
                          }}
                          className="text-[10px] font-bold text-amber-800 hover:text-amber-900 hover:underline cursor-pointer flex items-center gap-0.5"
                        >
                          <span>{doubts.length > 0 ? `${doubts.length} Logged` : '+ Log Query'}</span>
                        </button>
                      </div>
                    );
                  })()}
                </div>

                {/* Card Bottom / Fast WhatsApp & Action buttons (NO PAYMENTS) */}
                <div className="p-3 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1 flex-wrap">
                    {!job.editorName ? (
                      <button
                        onClick={() => setAssigningJob(job)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Assign an Editor to this project"
                      >
                        <User className="w-3.5 h-3.5" />
                        <span>Assign Editor</span>
                      </button>
                    ) : job.stage === 'data_received' || job.stage === 'pending_assignment' ? (
                      <button
                        onClick={() => handleShareDataWhatsApp(job)}
                        className="flex items-center gap-1 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title={job.rawDataLink || job.rawDataSource === 'hard_drive' ? "Send Data & Brief to Editor on WhatsApp" : "Log Data & Send to Editor"}
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>{job.rawDataLink || job.rawDataSource === 'hard_drive' ? 'Send to Editor' : 'Log Data & Send'}</span>
                      </button>
                    ) : job.stage === 'sent_to_editor' ? (
                      <button
                        onClick={() => {
                          setReceiveCutPromptJob(job);
                          setReceiveCutLinkInput(deliveryLinkOf(job) || '');
                          setReceiveCutEditorNotes('');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Receive or Attach Cut from Editor"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>{deliveryLinkOf(job) ? 'Receive Cut' : 'Attach Cut'}</span>
                      </button>
                    ) : job.stage === 'internal_review' || job.stage === 'draft_received' ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => setRevisionModalState({ isOpen: true, job, revisionType: 'internal' })}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Request Internal Changes from Editor"
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          <span>Request Changes</span>
                        </button>
                        <button
                          onClick={() => handleShareDraftWhatsApp(job)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Approved internally. Share Review Link with Client on WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Send to Client</span>
                        </button>
                      </div>
                    ) : job.stage === 'internal_changes' ? (
                      <button
                        onClick={() => {
                          setReceiveCutPromptJob(job);
                          setReceiveCutLinkInput(deliveryLinkOf(job) || '');
                          setReceiveCutEditorNotes('');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Receive revised cut from editor"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Receive Updated Cut</span>
                      </button>
                    ) : job.stage === 'sent_to_client' ? (
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          type="button"
                          onClick={() => handleSendFollowUpWhatsApp(job)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Send WhatsApp Follow-up to Client to request feedback / finalize faster"
                        >
                          <Clock className="w-3.5 h-3.5" />
                          <span>Follow Up</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setRevisionModalState({ isOpen: true, job, revisionType: 'client' })}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-700 hover:bg-amber-800 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Log Client Changes (2-Day Turnaround)"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Log Changes</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => advanceFreelanceJobStage(job.id, 'final_delivered', 'Client approved the draft cut')}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Mark Client Approved"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Client Approved</span>
                        </button>
                      </div>
                    ) : job.stage === 'changes_sent_to_editor' || job.stage === 'changes_received' ? (
                      <button
                        onClick={() => {
                          setReceiveCutPromptJob(job);
                          setReceiveCutLinkInput(deliveryLinkOf(job) || '');
                          setReceiveCutEditorNotes('');
                        }}
                        className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                        title="Log Updated Cut from Editor"
                      >
                        <Film className="w-3.5 h-3.5" />
                        <span>Receive Updated Cut</span>
                      </button>
                    ) : job.stage === 'final_delivered' ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleShareFinalWhatsApp(job)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Deliver Master Link to Client on WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                          <span>Deliver Master</span>
                        </button>
                        <button
                          onClick={() => advanceFreelanceJobStage(job.id, 'completed', 'Marked project completed')}
                          className="flex items-center gap-1 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                          title="Mark project fully completed"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Complete</span>
                        </button>
                      </div>
                    ) : job.stage === 'completed' ? (
                      <div className="flex items-center gap-1">
                        <span className="flex items-center gap-1 px-2 py-1.5 bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-bold rounded-lg">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>Done</span>
                        </span>
                        <button
                          onClick={() => handleShareFinalWhatsApp(job)}
                          className="p-1.5 bg-white border border-[#d4c1a3] hover:border-[#7a2e33] text-purple-700 rounded-lg cursor-pointer"
                          title="Re-send Master Delivery Link on WhatsApp"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => handleShareDraftWhatsApp(job)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[11px] font-bold rounded-lg transition-all cursor-pointer shadow-2xs"
                      >
                        <MessageCircle className="w-3.5 h-3.5" />
                        <span>Send Draft</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center">
                    <button
                      onClick={() => setSelectedDetailJobId(job.id)}
                      className="p-1.5 text-[#7a2e33] hover:bg-white rounded-lg font-semibold text-xs transition-colors flex items-center gap-1 cursor-pointer"
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
                    const deliverableTitle = pendingRow.deliverable?.title || job.title || '';
                    const deliverableDesc = `${deliverableTitle} ${job.serviceType}`.toLowerCase();
                    const isAlbumRow = deliverableDesc.includes('album') || deliverableDesc.includes('sheet');
                    const isFrameRow = deliverableDesc.includes('frame') || deliverableDesc.includes('canvas');

                    const transfer = transfers.find(t =>
                      t.status !== 'completed' &&
                      ((t.target?.id && t.target.id === pendingRow.target.id) ||
                       (t.target?.clientId && String(t.target.clientId) === String(pendingRow.target.clientId) &&
                        t.target?.title && pendingRow.target.title &&
                        t.target.title.trim().toLowerCase() === pendingRow.target.title.trim().toLowerCase()))
                    );

                    const fraction = transfer ? progressFraction(transfer) : 0;
                    const percent = Math.round(fraction * 100);

                    return (
                      <tr key={job.id} className="hover:bg-[#f9f8f6]/40 transition-colors text-[#6b6660]">
                        <td className="py-3 px-4">
                          <span className="font-mono text-[10px] font-bold text-[#6b6660] bg-[#f9f8f6] px-2 py-0.5 rounded border border-[#d4c1a3]">
                            {transfer
                              ? transfer.status === 'uploading'
                                ? `UPLOADING (${percent}%)`
                                : transfer.status === 'needs_attention'
                                ? 'UPLOAD ATTENTION'
                                : transfer.status === 'paused'
                                ? 'UPLOAD PAUSED'
                                : 'IN QUEUE'
                              : isAlbumRow
                              ? 'AWAITING ALBUM'
                              : isFrameRow
                              ? 'AWAITING FRAMES'
                              : 'AWAITING FOOTAGE'}
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
                          {transfer ? (
                            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border ${
                              transfer.status === 'uploading'
                                ? 'bg-blue-50 text-blue-800 border-blue-200'
                                : transfer.status === 'needs_attention'
                                ? 'bg-red-50 text-red-800 border-red-200'
                                : transfer.status === 'paused'
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                            }`}>
                              {transfer.status === 'uploading'
                                ? `⚡ Uploading Raw (${percent}%)`
                                : transfer.status === 'needs_attention'
                                ? `⚠️ Needs Attention (${percent}%)`
                                : transfer.status === 'paused'
                                ? `⏸️ Paused (${percent}%)`
                                : '⏳ Queued'}
                            </span>
                          ) : isAlbumRow ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              ⭐ Album Selection (200 Photos)
                            </span>
                          ) : isFrameRow ? (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-purple-50 text-purple-800 border border-purple-200">
                              🖼️ Frame Selection (4 Frames)
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              Awaiting Footage
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-medium text-[#111417]">
                          {job.dueDate || '—'}
                        </td>
                        <td className="py-3 px-4 text-xs text-[#6b6660]">—</td>
                        <td className="py-3 px-4 text-xs text-[#6b6660]">—</td>
                        <td className="py-3 px-4 text-right">
                          <div className="inline-flex flex-col items-end gap-1">
                            {(isAlbumRow || isFrameRow) && (
                              <button
                                type="button"
                                onClick={() => handleDirectWhatsAppSelectionFollowUp(job, pendingRow)}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-[#0f5132] hover:text-emerald-700 cursor-pointer bg-[#25D366]/10 px-2 py-0.5 rounded-md border border-[#25D366]/30 mb-0.5"
                                title="Open WhatsApp directly requesting photo selection with formula & instructions"
                              >
                                <MessageCircle className="w-3 h-3 text-[#25D366]" />
                                Request Selection
                              </button>
                            )}
                            {pendingRow.reusableDeliverables && pendingRow.reusableDeliverables.length > 0 && (
                              <button
                                type="button"
                                disabled={attachingId === pendingRow.target.id}
                                onClick={async () => {
                                  try {
                                    setAttachingId(pendingRow.target.id);
                                    await reuseDeliverableRawData(
                                      pendingRow.target.clientId!,
                                      pendingRow.target.id,
                                      pendingRow.reusableDeliverables![0].id,
                                      pendingRow.target.serviceType
                                    );
                                  } catch (err: any) {
                                    console.error('Failed to reuse data:', err);
                                    alert(err.message || 'Failed to reuse data');
                                  } finally {
                                    setAttachingId(null);
                                  }
                                }}
                                className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 hover:text-emerald-800 cursor-pointer disabled:opacity-60"
                                title={`Attach raw data from ${pendingRow.reusableDeliverables[0].reusedFromTitle || pendingRow.reusableDeliverables[0].title}`}
                              >
                                <LinkIcon className="w-3 h-3" />
                                {attachingId === pendingRow.target.id ? 'Attaching... ⚡' : 'Reuse client data'}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => setManualRawTarget({ target: pendingRow.target, title: `${job.title} · ${job.serviceType}` })}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#111417] hover:text-[#7a2e33] cursor-pointer"
                              title="Share offline: scan hard drive folder or log hand-off"
                            >
                              <HardDrive className="w-3 h-3 text-[#7a2e33]" />
                              Share Offline
                            </button>
                            {transfer ? (
                              <button
                                type="button"
                                onClick={() => {
                                  if (onViewTransfer) onViewTransfer(transfer.id);
                                  else onGoToQueue?.();
                                }}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-blue-700 hover:text-blue-900 hover:underline cursor-pointer"
                                title="View transfer progress in Up Down Queue"
                              >
                                <ArrowUpDown className="w-3 h-3 text-emerald-600" />
                                View in Queue ({percent}%)
                              </button>
                            ) : (
                              <button
                                type="button"
                                disabled={!onUploadForDeliverable}
                                onClick={() => onUploadForDeliverable?.(pendingRow.target)}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#7a2e33] hover:underline disabled:opacity-40 cursor-pointer"
                              >
                                <Upload className="w-3 h-3" />
                                Upload raw
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleEditPendingDeliverable(pendingRow)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-[#111417] hover:text-[#7a2e33] cursor-pointer"
                              title="Edit Deliverable"
                            >
                              <Edit3 className="w-3 h-3 text-[#7a2e33]" />
                              Edit Deliverable
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

                  const freelanceTransfer = transfers.find(t =>
                    t.status !== 'completed' &&
                    t.target?.kind === 'freelance' &&
                    t.target.id === job.id
                  );

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
                        {freelanceTransfer ? (
                          <div className="text-[10px] text-blue-700 font-bold flex items-center gap-1 mt-0.5">
                            <UploadCloud className="w-3 h-3 text-blue-600 animate-pulse" />
                            <span>Uploading Raw ({Math.round(progressFraction(freelanceTransfer) * 100)}%)</span>
                          </div>
                        ) : !job.rawDataLink && job.rawDataSource !== 'hard_drive' ? (
                          <div className="text-[10px] text-amber-700 font-semibold flex items-center gap-1 mt-0.5">
                            <AlertCircle className="w-3 h-3 text-amber-600" />
                            <span>Data Pending</span>
                          </div>
                        ) : null}
                      </td>
                      <td className="py-3 px-4">
                        {job.editorName ? (
                          <div className="flex items-center justify-between gap-2">
                            <div>
                              <div className="font-semibold text-[#111417]">{job.editorName}</div>
                              <div className="text-[10px] text-[#6b6660]">
                                {job.assignedType === 'in_house' ? 'In-House' : 'Freelancer'}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setAssigningJob(job)}
                              className="text-[10px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                              title="Change Editor"
                            >
                              Change
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setAssigningJob(job)}
                            className="inline-flex items-center gap-1 px-2 py-1 bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-bold rounded-md shadow-2xs cursor-pointer"
                            title="Assign Editor"
                          >
                            <User className="w-3 h-3" />
                            <span>Assign</span>
                          </button>
                        )}
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
                          {freelanceTransfer ? (
                            <button
                              onClick={() => {
                                if (onViewTransfer) onViewTransfer(freelanceTransfer.id);
                                else onGoToQueue?.();
                              }}
                              className="p-1.5 bg-blue-50 border border-blue-300 hover:bg-blue-100 text-blue-700 rounded-lg cursor-pointer"
                              title={`View Upload in Queue (${Math.round(progressFraction(freelanceTransfer) * 100)}%)`}
                            >
                              <ArrowUpDown className="w-3.5 h-3.5 text-emerald-600" />
                            </button>
                          ) : !job.rawDataLink && job.rawDataSource !== 'hard_drive' ? (
                            <button
                              onClick={() => {
                                const jobTarget: WorkTarget = {
                                  kind: 'freelance',
                                  id: job.id,
                                  title: job.title,
                                  clientName: job.clientName,
                                  serviceType: job.serviceType,
                                  purpose: 'raw',
                                  jobCode: job.jobCode,
                                  dueDate: freelanceDueDate(job),
                                };
                                onUploadForDeliverable?.(jobTarget);
                              }}
                              className="p-1.5 bg-[#7a2e33]/10 border border-[#7a2e33]/30 hover:bg-[#7a2e33] hover:text-white text-[#7a2e33] rounded-lg cursor-pointer transition-colors"
                              title="Scan Folder to Upload Raw Data to Google Drive"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                            </button>
                          ) : null}
                          {(job.stage === 'data_received' || job.stage === 'pending_assignment') && job.editorName && (
                            <button
                              onClick={() => handleShareDataWhatsApp(job)}
                              className="p-1.5 bg-emerald-50 border border-emerald-300 hover:bg-emerald-100 text-emerald-700 rounded-lg cursor-pointer"
                              title={job.rawDataLink ? "Send Data Link to Editor on WhatsApp" : "Attach Raw Link & Send to Editor"}
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
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
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-7 gap-4 overflow-x-auto pb-4">
          {[
            { stageKey: 'data_received', label: '1. Data Received', color: 'border-amber-300 bg-amber-50/30' },
            { stageKey: 'sent_to_editor', label: '2. With Editor', color: 'border-blue-300 bg-blue-50/30' },
            { stageKey: 'internal_review', label: '3. Studio Review', color: 'border-indigo-300 bg-indigo-50/30' },
            { stageKey: 'sent_to_client', label: '4. Client Review', color: 'border-sky-300 bg-sky-50/30' },
            { stageKey: 'changes_received', label: '5. Revisions', color: 'border-orange-300 bg-orange-50/30' },
            { stageKey: 'final_delivered', label: '6. Final Master', color: 'border-purple-300 bg-purple-50/30' },
            { stageKey: 'completed', label: '7. Completed', color: 'border-emerald-300 bg-emerald-50/30' },
          ].map(col => {
            // Kanban files work by the stage it has reached. A deliverable with no
            // footage has reached none, so it is not on this board — it is on the
            // other two, where it can still be acted on.
            const colJobs = filteredJobs.filter(j => !(j as PendingRow).pendingDeliverable).filter(j =>
              col.stageKey === 'internal_review'
                ? j.stage === 'internal_review' || j.stage === 'internal_changes' || j.stage === 'draft_received'
                : col.stageKey === 'changes_received'
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
                      {col.stageKey === 'sent_to_client' && (
                        <div className="pt-2 border-t border-[#d4c1a3]/50 flex items-center justify-between gap-1">
                          <span className="text-[9.5px] font-semibold text-[#6b6660]">
                            {j.lastFollowUpDate ? `Followed: ${j.lastFollowUpDate}` : 'No follow-up yet'}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSendFollowUpWhatsApp(j);
                            }}
                            className="flex items-center gap-1 px-2 py-1 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-md transition-all cursor-pointer shadow-2xs"
                            title="Send WhatsApp follow-up nudge to client"
                          >
                            <Clock className="w-3 h-3" />
                            <span>Follow Up</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
        onAssignEditor={job => {
          setSelectedDetailJobId(null);
          setAssigningJob(job);
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
      {revisionModalState.isOpen && revisionModalState.job && (
        <FreelanceRevisionModal
          isOpen={true}
          onClose={() => setRevisionModalState({ isOpen: false, job: null, revisionType: 'client' })}
          job={revisionModalState.job}
          revisionType={revisionModalState.revisionType}
        />
      )}

      {/* Assign Editor Panel */}
      <AssignEditorPanel
        isOpen={Boolean(assigningJob)}
        job={assigningJob}
        onClose={() => setAssigningJob(null)}
      />

      {/* Attach / Log Raw Data Modal (Cloud or Physical Hard Drive) */}
      {rawLinkPromptJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-[#d4c1a3] shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-[#d4c1a3] flex items-center justify-between bg-[#f9f8f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-900 flex items-center justify-center">
                  <LinkIcon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111417] text-base">Raw Data Intake & Logistics</h3>
                  <p className="text-xs text-[#6b6660]">
                    {rawLinkPromptJob.title} ({rawLinkPromptJob.jobCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRawLinkPromptJob(null);
                  setRawLinkInput('');
                  setRawHddNotes('');
                }}
                className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#111417] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              {/* Intake Source Selector */}
              <div>
                <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-2">
                  Data Intake Source
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'partner_upload', label: 'Partner Studio Link', desc: 'GDrive / WeTransfer' },
                    { id: 'studio_upload', label: 'Studio Upload', desc: 'Uploaded by us' },
                    { id: 'hard_drive', label: 'Physical Hard Drive', desc: 'Courier / In-Hand' },
                  ].map((src) => (
                    <button
                      key={src.id}
                      type="button"
                      onClick={() => setRawSourceType(src.id as any)}
                      className={`p-2.5 rounded-xl border text-left cursor-pointer transition-all ${
                        rawSourceType === src.id
                          ? 'border-[#7a2e33] bg-[#7a2e33]/5 text-[#7a2e33] shadow-2xs'
                          : 'border-[#d4c1a3] bg-[#f9f8f6] text-[#6b6660] hover:text-[#111417]'
                      }`}
                    >
                      <div className="text-xs font-bold">{src.label}</div>
                      <div className="text-[10px] text-[#6b6660]">{src.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {rawSourceType === 'hard_drive' ? (
                <div className="space-y-3 p-3.5 bg-amber-50/70 border border-amber-200 rounded-xl">
                  <div>
                    <label className="block text-xs font-bold text-[#111417] mb-1">
                      Hard Drive Current Location
                    </label>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setRawHddStatus('received_by_studio')}
                        className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                          rawHddStatus === 'received_by_studio'
                            ? 'bg-[#7a2e33] text-white border-[#7a2e33]'
                            : 'bg-white text-[#111417] border-[#d4c1a3]'
                        }`}
                      >
                        💽 At Studio
                      </button>
                      <button
                        type="button"
                        onClick={() => setRawHddStatus('sent_to_editor')}
                        className={`flex-1 py-1.5 px-3 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                          rawHddStatus === 'sent_to_editor'
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-[#111417] border-[#d4c1a3]'
                        }`}
                      >
                        🚚 Sent to Editor
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-[#111417] mb-1">
                      Drive / Courier / Tracking Details
                    </label>
                    <input
                      type="text"
                      value={rawHddNotes}
                      onChange={(e) => setRawHddNotes(e.target.value)}
                      placeholder="e.g. SanDisk 2TB SSD, sent via DTDC tracking #D12345678"
                      className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                    />
                  </div>

                  <div className="pt-2 border-t border-amber-200/80">
                    <button
                      type="button"
                      onClick={() => {
                        const t: WorkTarget = {
                          kind: 'freelance',
                          id: rawLinkPromptJob.id,
                          title: rawLinkPromptJob.title,
                          clientName: rawLinkPromptJob.clientName,
                          serviceType: rawLinkPromptJob.serviceType,
                          purpose: 'raw',
                          jobCode: rawLinkPromptJob.jobCode,
                          dueDate: freelanceDueDate(rawLinkPromptJob),
                        };
                        const jobTitle = `${rawLinkPromptJob.title} · ${rawLinkPromptJob.serviceType}`;
                        setRawLinkPromptJob(null);
                        setManualRawTarget({ target: t, title: jobTitle });
                      }}
                      className="w-full py-2 px-3 bg-white hover:bg-amber-100/60 border border-amber-300 rounded-xl text-xs font-bold text-amber-950 flex items-center justify-center gap-2 cursor-pointer transition-all"
                    >
                      <HardDrive className="w-4 h-4 text-[#7a2e33]" />
                      <span>Scan Folder on Hard Drive to Measure Files 💽</span>
                    </button>
                  </div>
                </div>
              ) : rawSourceType === 'studio_upload' ? (
                <div className="space-y-3 p-3.5 bg-stone-50 border border-[#d4c1a3] rounded-xl">
                  <div className="space-y-1">
                    <div className="text-xs font-bold text-[#111417] flex items-center gap-1.5">
                      <UploadCloud className="w-4 h-4 text-[#7a2e33]" />
                      <span>Scan Folder & Upload to Google Drive</span>
                    </div>
                    <p className="text-[11px] text-[#6b6660]">
                      Select the raw rushes folder on your Mac or external drive. The desktop app will scan it and upload directly to Google Drive.
                    </p>
                  </div>

                  <button
                    type="button"
                    disabled={!onUploadForDeliverable}
                    onClick={() => {
                      const t: WorkTarget = {
                        kind: 'freelance',
                        id: rawLinkPromptJob.id,
                        title: rawLinkPromptJob.title,
                        clientName: rawLinkPromptJob.clientName,
                        serviceType: rawLinkPromptJob.serviceType,
                        purpose: 'raw',
                        jobCode: rawLinkPromptJob.jobCode,
                        dueDate: freelanceDueDate(rawLinkPromptJob),
                      };
                      setRawLinkPromptJob(null);
                      onUploadForDeliverable?.(t);
                    }}
                    className="w-full py-2.5 px-4 bg-[#7a2e33] hover:bg-[#632529] text-white text-xs font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 cursor-pointer transition-all disabled:opacity-40"
                  >
                    <UploadCloud className="w-4 h-4" />
                    <span>Select Folder to Scan & Upload ⚡</span>
                  </button>

                  <div className="pt-2 border-t border-[#d4c1a3]/60 space-y-1.5">
                    <label className="text-[11px] font-bold text-[#6b6660]">
                      Or paste an existing cloud link:
                    </label>
                    <input
                      type="url"
                      value={rawLinkInput}
                      onChange={(e) => setRawLinkInput(e.target.value)}
                      placeholder="https://drive.google.com/..."
                      className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] placeholder:text-[#6b6660]/60 focus:outline-none focus:border-[#7a2e33]"
                    />
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#111417] uppercase tracking-wider">
                    Partner Studio Download Link
                  </label>
                  <input
                    type="url"
                    value={rawLinkInput}
                    onChange={(e) => setRawLinkInput(e.target.value)}
                    placeholder="https://drive.google.com/... or https://wetransfer.com/..."
                    className="w-full px-3.5 py-2.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-sm text-[#111417] placeholder:text-[#6b6660]/60 focus:outline-none focus:border-[#7a2e33]"
                    autoFocus
                  />
                  <p className="text-[11px] text-[#6b6660]">
                    Paste the link shared by the partner studio or client.
                  </p>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => {
                  setRawLinkPromptJob(null);
                  setRawLinkInput('');
                  setRawHddNotes('');
                }}
                className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl cursor-pointer"
              >
                Cancel
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={isSavingRawLink}
                  onClick={() => handleSaveRawData(false)}
                  className="px-4 py-2 text-xs font-bold text-[#7a2e33] bg-white border border-[#d4c1a3] hover:border-[#7a2e33] rounded-xl cursor-pointer"
                >
                  Save Only
                </button>
                {rawLinkPromptJob.editorPhone && (
                  <button
                    type="button"
                    disabled={isSavingRawLink}
                    onClick={() => handleSaveRawData(true)}
                    className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>Save & WhatsApp Editor</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Extra Data / Footage Modal (Append Anytime) */}
      {extraDataPromptJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-[#d4c1a3] shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-[#d4c1a3] flex items-center justify-between bg-[#f9f8f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-sky-100 text-sky-900 flex items-center justify-center">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111417] text-base">Add More Footage / Data</h3>
                  <p className="text-xs text-[#6b6660]">
                    {extraDataPromptJob.title} ({extraDataPromptJob.jobCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setExtraDataPromptJob(null)}
                className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#111417] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#111417] mb-1">
                  Data Description / Title *
                </label>
                <input
                  type="text"
                  required
                  value={extraDataTitle}
                  onChange={(e) => setExtraDataTitle(e.target.value)}
                  placeholder="e.g. Reception Drone Footage, Bride Entry Audio WAV, Haldi Ceremony Extra"
                  className="w-full px-3.5 py-2.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111417] mb-1">
                  Footage Download Link (Drive, Dropbox, WeTransfer)
                </label>
                <input
                  type="url"
                  value={extraDataUrl}
                  onChange={(e) => setExtraDataUrl(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111417] mb-1">
                  Notes / Instructions for Editor (Optional)
                </label>
                <textarea
                  rows={2}
                  value={extraDataNotes}
                  onChange={(e) => setExtraDataNotes(e.target.value)}
                  placeholder="e.g. Please sync this audio with card 2 footage."
                  className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                />
              </div>

              {extraDataPromptJob.editorPhone && (
                <label className="flex items-center gap-2.5 p-3 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={extraDataNotifyWhatsApp}
                    onChange={(e) => setExtraDataNotifyWhatsApp(e.target.checked)}
                    className="rounded text-[#7a2e33] focus:ring-[#7a2e33] w-4 h-4 accent-[#7a2e33]"
                  />
                  <div className="text-xs text-[#111417]">
                    <span className="font-bold">Notify Editor on WhatsApp immediately</span>
                    <p className="text-[11px] text-[#6b6660]">
                      Sends project title and the new footage link directly to {extraDataPromptJob.editorName}
                    </p>
                  </div>
                </label>
              )}
            </div>

            <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setExtraDataPromptJob(null)}
                className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingExtraData || !extraDataTitle.trim()}
                onClick={handleSaveExtraData}
                className="px-5 py-2 text-xs font-bold text-white bg-[#7a2e33] hover:bg-[#5a2226] disabled:opacity-50 rounded-xl shadow-xs cursor-pointer"
              >
                {isSavingExtraData ? 'Saving...' : 'Save & Add Footage'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Receive / Attach Cut Modal (The Single Delivery Link Rule) */}
      {receiveCutPromptJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-[#d4c1a3] shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-[#d4c1a3] flex items-center justify-between bg-[#f9f8f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-100 text-indigo-900 flex items-center justify-center">
                  <Film className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111417] text-base">Receive / Attach Project Cut</h3>
                  <p className="text-xs text-[#6b6660]">
                    {receiveCutPromptJob.title} ({receiveCutPromptJob.jobCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReceiveCutPromptJob(null);
                  setReceiveCutLinkInput('');
                  setReceiveCutEditorNotes('');
                }}
                className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#111417] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 text-xs text-indigo-900 leading-relaxed">
                <p className="font-bold mb-1">One Delivery Link Rule</p>
                <p>
                  Paste the review link (Frame.io, Google Drive, Vimeo, YouTube unlisted) shared by editor{' '}
                  <span className="font-bold">{receiveCutPromptJob.editorName || 'assigned to this project'}</span>.
                  Once saved, the project moves to <span className="font-bold underline">Studio Review</span> for internal check before sharing with the client.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1">
                  Cut / Preview Link *
                </label>
                <input
                  type="url"
                  required
                  value={receiveCutLinkInput}
                  onChange={(e) => setReceiveCutLinkInput(e.target.value)}
                  placeholder="https://frame.io/... or https://drive.google.com/..."
                  className="w-full px-3.5 py-2.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-sm text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  autoFocus
                />
              </div>

              {/* If job has active revisions, show requested notes and editor response field */}
              {receiveCutPromptJob.revisions && receiveCutPromptJob.revisions.length > 0 && (() => {
                const latestRev = receiveCutPromptJob.revisions[receiveCutPromptJob.revisions.length - 1];
                return (
                  <div className="space-y-3 p-3.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl">
                    <div className="text-xs">
                      <span className="font-bold text-[#7a2e33]">Revision Round #{latestRev.roundNumber} Feedback:</span>
                      <p className="text-[#6b6660] mt-0.5">{latestRev.feedbackNotes}</p>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-[#111417] mb-1">
                        Editor Notes / Unaddressed Changes (Optional)
                      </label>
                      <textarea
                        rows={3}
                        value={receiveCutEditorNotes}
                        onChange={(e) => setReceiveCutEditorNotes(e.target.value)}
                        placeholder="e.g. Completed music and color changes. Night footage grain at 02:15 could not be reduced further without facial blur."
                        className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                      />
                      <p className="text-[10px] text-[#6b6660] mt-0.5">
                        These notes will be displayed on the job card so you have context during Studio Review.
                      </p>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setReceiveCutPromptJob(null);
                  setReceiveCutLinkInput('');
                  setReceiveCutEditorNotes('');
                }}
                className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSavingCut || !receiveCutLinkInput.trim()}
                onClick={handleSaveCut}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-xl shadow-xs cursor-pointer"
              >
                {isSavingCut ? 'Saving...' : 'Save Cut & Move to Review'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Attach Deliverable / Master Link Modal */}
      {deliverableLinkPromptJob && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white w-full max-w-lg rounded-2xl border border-[#d4c1a3] shadow-2xl overflow-hidden animate-scale-in">
            <div className="p-5 border-b border-[#d4c1a3] flex items-center justify-between bg-[#f9f8f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-purple-100 text-purple-900 flex items-center justify-center">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111417] text-base">
                    Attach {deliverableLinkPromptJob.type === 'final' ? 'Master Delivery' : 'Draft Preview'} Link
                  </h3>
                  <p className="text-xs text-[#6b6660]">
                    {deliverableLinkPromptJob.job.title} ({deliverableLinkPromptJob.job.jobCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDeliverableLinkPromptJob(null);
                  setDeliverableLinkInput('');
                }}
                className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#111417] hover:bg-black/5 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-purple-50 border border-purple-200 rounded-xl p-3 text-xs text-purple-950 leading-relaxed">
                <p className="font-bold mb-1">
                  {deliverableLinkPromptJob.type === 'final' ? 'Final Master Delivery Link' : 'Draft Preview Link'}
                </p>
                <p>
                  You are sending the {deliverableLinkPromptJob.type === 'final' ? 'final 4K master delivery' : 'draft video preview'} to client{' '}
                  <span className="font-bold">{getJobDisplayClient(deliverableLinkPromptJob.job)}</span>.
                  Paste the Google Drive, Dropbox, YouTube, Vimeo, or Frame.io download link so the client can review or download it immediately.
                </p>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-[#111417] uppercase tracking-wider">
                  {deliverableLinkPromptJob.type === 'final' ? 'Master Download Link' : 'Draft Preview Link'}
                </label>
                <div className="relative">
                  <input
                    type="url"
                    value={deliverableLinkInput}
                    onChange={(e) => setDeliverableLinkInput(e.target.value)}
                    placeholder="https://drive.google.com/... or https://vimeo.com/..."
                    className="w-full px-3.5 py-2.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-sm text-[#111417] placeholder:text-[#6b6660]/60 focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-[#6b6660]">
                  This link will be saved to the project and formatted into the WhatsApp message.
                </p>
              </div>

              {deliverableLinkPromptJob.job.clientPhone && (
                <div className="text-xs text-[#6b6660] flex items-center gap-1.5">
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-600" />
                  <span>
                    WhatsApp will open for <b>{getJobDisplayClient(deliverableLinkPromptJob.job)}</b> ({clientWhatsAppNumber(deliverableLinkPromptJob.job)})
                  </span>
                </div>
              )}
            </div>

            <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleSendWithoutDeliverableLink}
                className="text-xs text-[#6b6660] hover:text-[#111417] underline font-medium cursor-pointer"
              >
                Deliver without link
              </button>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDeliverableLinkPromptJob(null);
                    setDeliverableLinkInput('');
                  }}
                  className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl hover:bg-stone-50 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingDeliverableLink || !deliverableLinkInput.trim()}
                  onClick={handleSaveAndSendDeliverableLink}
                  className="px-4 py-2 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>{isSavingDeliverableLink ? 'Saving...' : 'Save & Open WhatsApp'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Editor Doubts & Clarifications Modal */}
      {doubtModalJob && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl border border-[#d4c1a3] shadow-2xl max-w-xl w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150 my-8">
            <div className="p-5 border-b border-[#d4c1a3] flex items-center justify-between bg-[#f9f8f6]">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-600 text-white flex items-center justify-center shadow-2xs">
                  <HelpCircle className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-[#111417] text-base">Editor Queries & Clarifications</h3>
                  <p className="text-xs text-[#6b6660]">
                    {getJobDisplayTitle(doubtModalJob)} ({doubtModalJob.jobCode})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setDoubtModalJob(null);
                  setResolvingDoubtId(null);
                }}
                className="p-2 text-[#6b6660] hover:text-[#111417] rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
              {/* Form: Add New Query / Doubt */}
              <div className="p-4 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3] space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#111417] uppercase tracking-wider flex items-center gap-1.5">
                    <Plus className="w-3.5 h-3.5 text-amber-700" />
                    Log New Doubt / Query
                  </span>
                  <span className="text-[10px] text-[#6b6660]">Ask before final render</span>
                </div>

                <textarea
                  value={newDoubtQuestion}
                  onChange={(e) => setNewDoubtQuestion(e.target.value)}
                  placeholder="e.g. Song choice clarification, missing clip in folder, or why requested change is technically not possible..."
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] placeholder:text-[#6b6660]/60 focus:outline-none focus:border-[#7a2e33]"
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6b6660] mb-1">
                      Category
                    </label>
                    <select
                      value={newDoubtCategory}
                      onChange={(e: any) => setNewDoubtCategory(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                    >
                      <option value="general">💬 General Query</option>
                      <option value="song_music">🎵 Song / Music Selection</option>
                      <option value="revision_feedback">⚠️ Revision Feasibility / Feedback</option>
                      <option value="footage_clip">📹 Footage / Missing Clip</option>
                      <option value="audio_sync">🔊 Audio / Sync Clarification</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[#6b6660] mb-1">
                      Asked By
                    </label>
                    <input
                      type="text"
                      value={newDoubtAskedBy}
                      onChange={(e) => setNewDoubtAskedBy(e.target.value)}
                      placeholder="Editor name or Studio"
                      className="w-full px-3 py-1.5 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    disabled={isSavingDoubt || !newDoubtQuestion.trim()}
                    onClick={handleAddDoubt}
                    className="px-4 py-1.5 bg-amber-700 hover:bg-amber-800 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-2xs flex items-center gap-1.5 cursor-pointer transition-all"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>{isSavingDoubt ? 'Saving...' : 'Add Query'}</span>
                  </button>
                </div>
              </div>

              {/* List of Logged Queries */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-[#111417] uppercase tracking-wider">
                    Logged Queries ({(doubtModalJob.doubts || []).length})
                  </h4>
                  <span className="text-[11px] text-[#6b6660]">
                    Client WhatsApp: <b>{clientWhatsAppNumber(doubtModalJob)}</b>
                  </span>
                </div>

                {(!doubtModalJob.doubts || doubtModalJob.doubts.length === 0) ? (
                  <div className="p-6 text-center text-xs text-[#6b6660] bg-[#f9f8f6] rounded-xl border border-dashed border-[#d4c1a3]">
                    No editor queries logged yet. Use the form above to log any questions or song feedback.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {doubtModalJob.doubts.map((d) => {
                      const isResolved = d.status === 'resolved';
                      const isShared = d.status === 'shared_with_client';
                      return (
                        <div
                          key={d.id}
                          className={`p-3 rounded-xl border transition-all ${
                            isResolved
                              ? 'bg-emerald-50/40 border-emerald-200'
                              : isShared
                              ? 'bg-sky-50/50 border-sky-200'
                              : 'bg-amber-50/60 border-amber-200'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                                  isResolved
                                    ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                    : isShared
                                    ? 'bg-sky-100 text-sky-800 border-sky-300'
                                    : 'bg-amber-100 text-amber-800 border-amber-300'
                                }`}>
                                  {isResolved ? '✅ Resolved' : isShared ? '📤 Sent via WhatsApp' : '🟡 Pending Input'}
                                </span>
                                <span className="text-[10px] text-[#6b6660] bg-white px-1.5 py-0.5 rounded border border-[#d4c1a3]/60">
                                  {d.category === 'song_music'
                                    ? '🎵 Song Choice'
                                    : d.category === 'revision_feedback'
                                    ? '⚠️ Revision Feedback'
                                    : d.category === 'footage_clip'
                                    ? '📹 Clip Query'
                                    : d.category === 'audio_sync'
                                    ? '🔊 Audio Sync'
                                    : '💬 General Query'}
                                </span>
                                <span className="text-[10px] text-[#6b6660]">
                                  by <b>{d.askedBy || 'Editor'}</b> on {d.askedAt}
                                </span>
                              </div>

                              <p className="text-xs text-[#111417] font-medium whitespace-pre-wrap pt-0.5">
                                "{d.question}"
                              </p>

                              {d.clientResponse && (
                                <div className="text-[11px] text-emerald-900 bg-white p-2 rounded-lg border border-emerald-200 mt-1">
                                  <b>Resolution / Client Input:</b> {d.clientResponse}
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-1 shrink-0">
                              {!isResolved && (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => handleShareDoubtWhatsApp(doubtModalJob, d)}
                                    className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors cursor-pointer shadow-2xs"
                                    title="Send to client on WhatsApp"
                                  >
                                    <MessageCircle className="w-3.5 h-3.5" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setResolvingDoubtId(resolvingDoubtId === d.id ? null : d.id)}
                                    className="p-1.5 bg-white border border-[#d4c1a3] hover:border-emerald-600 text-emerald-700 rounded-lg transition-colors cursor-pointer"
                                    title="Mark as resolved"
                                  >
                                    <Check className="w-3.5 h-3.5" />
                                  </button>
                                </>
                              )}
                              <button
                                type="button"
                                onClick={() => handleDeleteDoubt(doubtModalJob, d.id)}
                                className="p-1.5 text-stone-400 hover:text-rose-600 rounded-lg transition-colors cursor-pointer"
                                title="Delete query"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          {/* Inline resolution input */}
                          {resolvingDoubtId === d.id && (
                            <div className="mt-2.5 pt-2 border-t border-stone-200/60 flex items-center gap-2">
                              <input
                                type="text"
                                value={doubtResolutionNote}
                                onChange={(e) => setDoubtResolutionNote(e.target.value)}
                                placeholder="Note client decision / response (e.g. Song confirmed)..."
                                className="flex-1 px-2.5 py-1 text-xs bg-white border border-[#d4c1a3] rounded-lg focus:outline-none focus:border-emerald-600"
                              />
                              <button
                                type="button"
                                onClick={() => handleResolveDoubt(doubtModalJob, d.id, doubtResolutionNote)}
                                className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg cursor-pointer"
                              >
                                Confirm Resolved
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-[#f9f8f6] border-t border-[#d4c1a3] flex items-center justify-end">
              <button
                type="button"
                onClick={() => {
                  setDoubtModalJob(null);
                  setResolvingDoubtId(null);
                }}
                className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl hover:bg-stone-50 cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Message Formats Customizable Drawer */}
      <WhatsAppTemplatesDrawer
        isOpen={isWhatsAppTemplatesOpen}
        onClose={() => setIsWhatsAppTemplatesOpen(false)}
      />

      {/* Manual Raw-Data / Physical Hard Disk Modal */}
      {manualRawTarget && (
        <ManualRawDataModal
          target={manualRawTarget.target}
          title={manualRawTarget.title}
          onClose={() => setManualRawTarget(null)}
          onSaved={() => setManualRawTarget(null)}
        />
      )}



      {/* Edit Deliverable Modal */}
      {editingDeliverableState.isOpen && editingDeliverableState.deliverable && (
        <EditDeliverableModal
          isOpen={editingDeliverableState.isOpen}
          onClose={() =>
            setEditingDeliverableState({
              isOpen: false,
              clientId: '',
              clientName: '',
              deliverable: null,
            })
          }
          clientId={editingDeliverableState.clientId}
          clientName={editingDeliverableState.clientName}
          deliverable={editingDeliverableState.deliverable}
        />
      )}
    </div>
  );
};
