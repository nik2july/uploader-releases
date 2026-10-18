import React, { useState, useMemo } from 'react';
import {
  Film,
  Plus,
  Search,
  Filter,
  ArrowUpDown,
  Calendar,
  Clock,
  MessageCircle,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  User,
  HardDrive,
  Copy,
  Check,
  Trash2,
  UploadCloud,
  Edit3,
  Link as LinkIcon,
  LayoutGrid,
  List,
  Columns,
  Sparkles,
  Camera,
  BookOpen,
  IndianRupee,
  MessageSquare,
  RefreshCw,
  FolderOpen,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { useTransfers } from '../../hooks/useTransfers';
import {
  getClientEvents,
  getClientEventsStatus,
  isClientPostProductionEligible,
  getDueDateStatus,
  formatINR,
  inrDigits,
} from '../../utils/formatters';
import { updateClientDeliverable, deleteClientDeliverable } from '../../lib/studioRepository';
import { AddDeliverableModal } from '../modals/AddDeliverableModal';
import { EditDeliverableModal } from '../modals/EditDeliverableModal';
import { ManualRawDataModal } from '../ManualRawDataModal';
import { WhatsAppTemplatesDrawer } from '../freelance/WhatsAppTemplatesDrawer';
import { renderWhatsAppMessage } from '../../utils/whatsappTemplates';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { toWhatsAppNumber } from '../../utils/phone';
import type { WorkTarget } from '../../../../shared/contracts';
import type { Client, ClientDeliverable, DeliverableStatus, TeamMember, ProjectEvent } from '../../types';

export interface DeliverableRowItem {
  id: string;
  clientId: string;
  client: Client;
  deliverable: ClientDeliverable;
  events: ProjectEvent[];
  eventPassed: boolean;
  eventDateStr?: string;
  coupleOrClientName: string;
  assignedEditor?: TeamMember;
  dueStatus: ReturnType<typeof getDueDateStatus>;
  target: WorkTarget;
}

export const DeliverablesScreen: React.FC<{
  onUploadForDeliverable?: (target: WorkTarget) => void;
  onGoToQueue?: () => void;
}> = ({ onUploadForDeliverable, onGoToQueue }) => {
  const { clients, projects, team, freelanceJobs, studioSettings } = useApp();
  const { transfers } = useTransfers();

  // Toolbar & filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('active');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [editorFilter, setEditorFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('due_asc');
  const [viewMode, setViewMode] = useState<'grid' | 'table' | 'kanban'>('grid');
  const [shootsPassedOnly, setShootsPassedOnly] = useState<boolean>(true);

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
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

  const [manualRawTarget, setManualRawTarget] = useState<{ target: WorkTarget; title: string } | null>(null);
  const [deliveryLinkModal, setDeliveryLinkModal] = useState<{
    clientId: string;
    deliverable: ClientDeliverable;
    link: string;
  } | null>(null);

  const [assigningEditorDeliverable, setAssigningEditorDeliverable] = useState<{
    clientId: string;
    deliverable: ClientDeliverable;
  } | null>(null);

  const [isWhatsAppDrawerOpen, setIsWhatsAppDrawerOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [actionBusyId, setActionBusyId] = useState<string | null>(null);

  // Collect and filter all deliverables
  const allDeliverableRows = useMemo<DeliverableRowItem[]>(() => {
    const rows: DeliverableRowItem[] = [];
    const now = Date.now();

    for (const client of clients || []) {
      const s = (client.status || '').toLowerCase();
      // Exclude leads, inquiries, and lost clients
      if (s === 'new_enquiry' || s === 'new lead' || s === 'lost' || s === 'inquiry') {
        continue;
      }

      const clientEvents = getClientEvents(client, projects);
      const eventStatus = getClientEventsStatus(client, clientEvents, now);

      // Rule: Deliverables are only shown when their events date have passed!
      // If shootsPassedOnly is active, strictly exclude clients whose event dates haven't passed yet.
      if (shootsPassedOnly && !isClientPostProductionEligible(client, clientEvents, now)) {
        continue;
      }

      const coupleOrClientName = client.couple || client.name || `Client #${client.id}`;
      const eventDateStr = eventStatus.earliestDate || undefined;

      for (const item of (client.deliverables || []) as ClientDeliverable[]) {
        const assignedEditor = team.find(m => Number(m.id) === Number(item.assignedMemberId));
        const dueStatus = getDueDateStatus(item.dueDate);

        const target: WorkTarget = {
          kind: 'deliverable',
          id: item.id,
          clientId: String(client.id),
          title: item.title,
          clientName: coupleOrClientName,
          serviceType: item.category || 'Video',
          purpose: 'raw',
          dueDate: item.dueDate,
        };

        rows.push({
          id: `${client.id}:${item.id}`,
          clientId: String(client.id),
          client,
          deliverable: item,
          events: clientEvents,
          eventPassed: eventStatus.anyEventPassed || !eventStatus.hasEvents,
          eventDateStr,
          coupleOrClientName,
          assignedEditor,
          dueStatus,
          target,
        });
      }
    }

    return rows;
  }, [clients, projects, team, shootsPassedOnly]);

  // Overall KPI metrics
  const metrics = useMemo(() => {
    let awaitingFootage = 0;
    let inProgress = 0;
    let review = 0;
    let completed = 0;
    let overdue = 0;

    for (const row of allDeliverableRows) {
      const st = row.deliverable.status;
      const hasFootage = Boolean(row.deliverable.rawDataLink) || row.deliverable.rawDataSource === 'hard_drive' || Object.keys(row.deliverable.desktopTransfers || {}).length > 0;

      if (st === 'delivered') {
        completed++;
      } else if (st === 'review' || st === 'changes') {
        review++;
      } else if (st === 'in-progress') {
        inProgress++;
      } else {
        awaitingFootage++;
      }

      if (row.dueStatus.isOverdue && st !== 'delivered') {
        overdue++;
      }
    }

    return {
      total: allDeliverableRows.length,
      awaitingFootage,
      inProgress,
      review,
      completed,
      overdue,
    };
  }, [allDeliverableRows]);

  // Filtered and sorted deliverables
  const filteredRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return allDeliverableRows.filter(row => {
      // Search query
      if (q) {
        const matchTitle = row.deliverable.title.toLowerCase().includes(q);
        const matchClient = row.coupleOrClientName.toLowerCase().includes(q);
        const matchEditor = (row.assignedEditor?.name || '').toLowerCase().includes(q);
        const matchCategory = (row.deliverable.category || '').toLowerCase().includes(q);
        if (!matchTitle && !matchClient && !matchEditor && !matchCategory) return false;
      }

      // Status filter
      if (statusFilter !== 'all') {
        const st = row.deliverable.status;
        if (statusFilter === 'active' && st === 'delivered') return false;
        if (statusFilter === 'pending' && st !== 'pending') return false;
        if (statusFilter === 'in_progress' && st !== 'in-progress') return false;
        if (statusFilter === 'review' && st !== 'review' && st !== 'changes' && st !== 'sent') return false;
        if (statusFilter === 'completed' && st !== 'delivered') return false;
        if (statusFilter === 'overdue' && (!row.dueStatus.isOverdue || st === 'delivered')) return false;
      }

      // Category filter
      if (categoryFilter !== 'all') {
        const cat = (row.deliverable.category || '').toLowerCase();
        if (!cat.includes(categoryFilter.toLowerCase())) return false;
      }

      // Editor filter
      if (editorFilter !== 'all') {
        if (editorFilter === 'unassigned') {
          if (row.deliverable.assignedMemberId) return false;
        } else if (String(row.deliverable.assignedMemberId) !== editorFilter) {
          return false;
        }
      }

      return true;
    }).sort((a, b) => {
      if (sortBy === 'due_asc') {
        return (a.deliverable.dueDate || '9999').localeCompare(b.deliverable.dueDate || '9999');
      }
      if (sortBy === 'due_desc') {
        return (b.deliverable.dueDate || '0000').localeCompare(a.deliverable.dueDate || '0000');
      }
      if (sortBy === 'client_asc') {
        return a.coupleOrClientName.localeCompare(b.coupleOrClientName);
      }
      if (sortBy === 'event_date') {
        return (b.eventDateStr || '').localeCompare(a.eventDateStr || '');
      }
      return 0;
    });
  }, [allDeliverableRows, searchQuery, statusFilter, categoryFilter, editorFilter, sortBy]);

  // Handle inline status change
  const handleUpdateStatus = async (row: DeliverableRowItem, newStatus: DeliverableStatus) => {
    try {
      setActionBusyId(row.id);
      await updateClientDeliverable(row.clientId, row.deliverable.id, {
        status: newStatus,
        deliveredDate: newStatus === 'delivered' ? new Date().toISOString().slice(0, 10) : row.deliverable.deliveredDate,
      });
    } catch (err: any) {
      console.error('Failed to change status:', err);
      alert(err.message || 'Failed to update status.');
    } finally {
      setActionBusyId(null);
    }
  };

  // Handle inline editor assignment
  const handleAssignEditor = async (row: DeliverableRowItem, editorId: number | '') => {
    try {
      setActionBusyId(row.id);
      await updateClientDeliverable(row.clientId, row.deliverable.id, {
        assignedMemberId: editorId === '' ? undefined : Number(editorId),
      });
      setAssigningEditorDeliverable(null);
    } catch (err: any) {
      console.error('Failed to assign editor:', err);
      alert(err.message || 'Failed to assign editor.');
    } finally {
      setActionBusyId(null);
    }
  };

  // Handle save delivery link
  const handleSaveDeliveryLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deliveryLinkModal) return;

    try {
      setActionBusyId(deliveryLinkModal.deliverable.id);
      await updateClientDeliverable(deliveryLinkModal.clientId, deliveryLinkModal.deliverable.id, {
        deliveryLink: deliveryLinkModal.link.trim() || undefined,
        status: deliveryLinkModal.link.trim() ? 'delivered' : deliveryLinkModal.deliverable.status,
      });
      setDeliveryLinkModal(null);
    } catch (err: any) {
      console.error('Failed to save delivery link:', err);
      alert(err.message || 'Failed to save delivery link.');
    } finally {
      setActionBusyId(null);
    }
  };

  // Handle WhatsApp share to client
  const handleWhatsAppShare = (row: DeliverableRowItem) => {
    const clientPhone = row.client.phone || '';
    if (!clientPhone) {
      alert('No phone number saved for this client.');
      return;
    }

    const studioName = studioSettings?.studioName || 'Baawaray Films';
    const clientName = row.coupleOrClientName;
    const deliverableTitle = row.deliverable.title;
    const link = row.deliverable.deliveryLink || row.deliverable.link || '';

    let message = '';
    if (link) {
      message = `Hello ${clientName}! ✨\n\nYour deliverable *${deliverableTitle}* from ${studioName} is ready for you.\n\n🔗 Access and download your files here:\n${link}\n\nWarm regards,\n${studioName}`;
    } else {
      message = `Hello ${clientName}! ✨\n\nWe are currently editing your *${deliverableTitle}* at ${studioName}. We are on track for timely completion and will share the download link shortly!\n\nWarm regards,\n${studioName}`;
    }

    const url = getWhatsAppUrl(clientPhone, message);
    window.open(url, '_blank');
  };

  // Copy link helper
  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Active uploads badge count
  const activeUploadsCount = useMemo(() => {
    return transfers.filter(t => t.status === 'uploading' || t.status === 'scanning' || t.status === 'verifying').length;
  }, [transfers]);

  return (
    <div className="p-6 space-y-6 pb-16 text-left">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-[#7a2e33] text-[#f9f8f6] flex items-center justify-center shadow-xs shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-lg md:text-xl font-bold font-serif text-[#111417] tracking-tight">
              Client Deliverables
            </h1>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-[#7a2e33]/10 text-[#7a2e33] border border-[#7a2e33]/20">
              {filteredRows.length} of {allDeliverableRows.length}
            </span>
            {metrics.completed > 0 && statusFilter === 'active' && (
              <span className="text-[10px] font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                {metrics.completed} Completed Hidden
              </span>
            )}
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#f9f8f6] p-0.5 rounded-lg border border-[#d4c1a3]">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'grid' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Cards Grid View"
            >
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'table' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Compact Table View"
            >
              <List className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`p-1.5 rounded-md transition-all cursor-pointer ${
                viewMode === 'kanban' ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
              }`}
              title="Pipeline Stages Kanban"
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Queue Button */}
          {onGoToQueue && (
            <button
              type="button"
              onClick={onGoToQueue}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-stone-50 text-[#111417] border border-[#d4c1a3] font-semibold text-xs rounded-lg shadow-2xs transition-all cursor-pointer"
              title="Open Google Drive uploader queue"
            >
              <UploadCloud className="w-3.5 h-3.5 text-[#7a2e33]" />
              <span className="hidden sm:inline">Uploader</span>
              {activeUploadsCount > 0 && (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              )}
            </button>
          )}

          {/* WhatsApp Message Formats */}
          <button
            type="button"
            onClick={() => setIsWhatsAppDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-emerald-50 text-emerald-800 border border-[#d4c1a3] hover:border-emerald-500 font-semibold text-xs rounded-lg shadow-2xs transition-all cursor-pointer"
            title="Custom WhatsApp message templates"
          >
            <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
            <span className="hidden sm:inline">WhatsApp</span>
          </button>

          {/* ADD DELIVERABLE BUTTON */}
          <button
            id="btn-add-deliverable"
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white font-bold text-xs rounded-lg shadow-xs transition-all hover:scale-[1.02] active:scale-95 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Deliverable</span>
          </button>
        </div>
      </div>

      {/* Single-Line Unified Filter Bar */}
      <div className="bg-white rounded-xl px-3 py-2 border border-[#d4c1a3] shadow-2xs overflow-x-auto">
        <div className="flex items-center gap-2.5 min-w-max md:min-w-0 md:w-full whitespace-nowrap">
          {/* Search Box */}
          <div className="relative flex-1 min-w-[140px]">
            <Search className="w-3.5 h-3.5 text-[#6b6660] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search couple, deliverable, or editor..."
              className="w-full pl-8 pr-7 py-1.5 text-xs bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-[#6b6660] hover:text-[#111417]"
              >
                ✕
              </button>
            )}
          </div>

          {/* Status Filter Dropdown */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-[#6b6660] font-medium">Status:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2 py-1 text-xs font-semibold bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg focus:outline-none focus:border-[#7a2e33] cursor-pointer"
            >
              <option value="active">Active (Hide Completed)</option>
              <option value="all">All (Show Completed)</option>
              <option value="pending">To Do / Awaiting</option>
              <option value="in_progress">In Progress</option>
              <option value="review">Review / Changes</option>
              <option value="completed">Delivered</option>
              <option value="overdue">Overdue</option>
            </select>
          </div>

          {/* Editor Dropdown */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-[#6b6660] font-medium">Editor:</span>
            <select
              value={editorFilter}
              onChange={(e) => setEditorFilter(e.target.value)}
              className="px-2 py-1 text-xs font-semibold bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg focus:outline-none focus:border-[#7a2e33] cursor-pointer max-w-[130px] truncate"
            >
              <option value="all">All Editors</option>
              <option value="unassigned">Unassigned</option>
              {team.map((member) => (
                <option key={member.id} value={String(member.id)}>
                  {member.name}
                </option>
              ))}
            </select>
          </div>

          {/* Sort Dropdown */}
          <div className="flex items-center gap-1 shrink-0">
            <span className="text-[11px] text-[#6b6660] font-medium">Sort:</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="px-2 py-1 text-xs font-semibold bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg focus:outline-none focus:border-[#7a2e33] cursor-pointer"
            >
              <option value="due_asc">Due Date (Earliest)</option>
              <option value="due_desc">Due Date (Latest)</option>
              <option value="client_asc">Client Name (A-Z)</option>
              <option value="event_date">Shoot Date (Recent)</option>
            </select>
          </div>

          {/* Shoot Date Passed Checkbox */}
          <label className="flex items-center gap-1.5 cursor-pointer text-[#111417] select-none text-[11px] shrink-0">
            <input
              type="checkbox"
              checked={shootsPassedOnly}
              onChange={(e) => setShootsPassedOnly(e.target.checked)}
              className="rounded border-[#d4c1a3] text-[#7a2e33] focus:ring-[#7a2e33] cursor-pointer w-3.5 h-3.5"
            />
            <span className="font-semibold">Shoot date passed only</span>
          </label>
        </div>
      </div>

      {/* Main Deliverables Content */}
      {filteredRows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#d4c1a3] p-12 text-center space-y-4 shadow-2xs">
          <div className="w-14 h-14 mx-auto rounded-full bg-[#7a2e33]/10 text-[#7a2e33] flex items-center justify-center">
            <Film className="w-7 h-7" />
          </div>
          <div className="max-w-md mx-auto">
            <h3 className="text-base font-bold text-[#111417] font-serif">No Deliverables to Display</h3>
            <p className="text-xs text-[#6b6660] mt-1">
              {searchQuery || statusFilter !== 'active' || editorFilter !== 'all'
                ? 'No deliverables match the active search or filter criteria. Try clearing filters.'
                : shootsPassedOnly
                ? 'Only clients whose shoot events have already taken place are shown. Future booked shoots will appear once their event date arrives.'
                : 'No client deliverables found in the system yet.'}
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            {(searchQuery || statusFilter !== 'active' || editorFilter !== 'all') && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setStatusFilter('active');
                  setCategoryFilter('all');
                  setEditorFilter('all');
                }}
                className="px-4 py-2 text-xs font-bold text-[#7a2e33] bg-[#7a2e33]/10 rounded-xl hover:bg-[#7a2e33]/20 transition-colors"
              >
                Clear Search & Filters
              </button>
            )}
            {statusFilter === 'active' && allDeliverableRows.length > 0 && filteredRows.length === 0 && (
              <button
                onClick={() => setStatusFilter('all')}
                className="px-4 py-2 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
              >
                Show All (Including Completed)
              </button>
            )}
            <button
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-bold text-white bg-[#7a2e33] hover:bg-[#5a2226] rounded-xl shadow-xs transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>Add First Deliverable</span>
            </button>
          </div>
        </div>
      ) : viewMode === 'grid' ? (
        /* GRID / CARDS VIEW */
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3.5">
          {filteredRows.map((row) => {
            const hasRawData = Boolean(row.deliverable.rawDataLink) || row.deliverable.rawDataSource === 'hard_drive' || Object.keys(row.deliverable.desktopTransfers || {}).length > 0;
            const hasDeliveryLink = Boolean(row.deliverable.deliveryLink || row.deliverable.link);
            const isCompleted = row.deliverable.status === 'delivered';

            return (
              <div
                key={row.id}
                className="bg-white rounded-xl border border-[#d4c1a3] p-3.5 shadow-2xs hover:shadow-xs transition-all flex flex-col justify-between space-y-3 text-left"
              >
                {/* Client Header */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className="font-serif font-bold text-sm text-[#111417] truncate flex-1 min-w-0"
                      title={row.coupleOrClientName}
                    >
                      {row.coupleOrClientName}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Status Dropdown in Top Right */}
                      <select
                        disabled={actionBusyId === row.id}
                        value={row.deliverable.status || 'pending'}
                        onChange={(e) => handleUpdateStatus(row, e.target.value as DeliverableStatus)}
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-all cursor-pointer ${
                          row.deliverable.status === 'delivered'
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                            : row.deliverable.status === 'in-progress'
                            ? 'bg-sky-50 text-sky-800 border-sky-300'
                            : row.deliverable.status === 'review'
                            ? 'bg-purple-50 text-purple-800 border-purple-300'
                            : row.deliverable.status === 'sent'
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-300'
                            : 'bg-[#f9f8f6] text-[#111417] border-[#d4c1a3]'
                        }`}
                      >
                        <option value="pending">To Do</option>
                        <option value="in-progress">In Progress</option>
                        <option value="review">Review</option>
                        <option value="sent">Sent</option>
                        <option value="delivered">Delivered</option>
                      </select>

                      {row.client.phone && (
                        <button
                          onClick={() => handleWhatsAppShare(row)}
                          title="Chat on WhatsApp"
                          className="text-emerald-700 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50 cursor-pointer"
                        >
                          <MessageCircle className="w-3.5 h-3.5" />
                        </button>
                      )}

                      {/* Edit Button on Top Right */}
                      <button
                        onClick={() => setEditingDeliverableState({
                          isOpen: true,
                          clientId: row.clientId,
                          clientName: row.coupleOrClientName,
                          deliverable: row.deliverable,
                        })}
                        className="p-1 text-[#6b6660] hover:text-[#7a2e33] rounded hover:bg-[#7a2e33]/10 transition-colors cursor-pointer"
                        title="Edit deliverable details"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>

                      {row.deliverable.isExtra && (
                        <button
                          onClick={async () => {
                            if (window.confirm(`Remove extra deliverable "${row.deliverable.title}"?`)) {
                              await deleteClientDeliverable(row.clientId, row.deliverable.id);
                            }
                          }}
                          className="p-1 text-rose-600 hover:text-rose-800 rounded hover:bg-rose-50 transition-colors cursor-pointer"
                          title="Delete extra deliverable"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>

                  {row.eventDateStr && (
                    <div className="flex items-center gap-1 text-[10px] text-[#6b6660] mt-0.5">
                      <Calendar className="w-3 h-3 text-[#7a2e33]" />
                      <span>{row.eventDateStr}</span>
                    </div>
                  )}
                </div>

                {/* Deliverable Info Block */}
                <div className="p-2.5 bg-[#f9f8f6] rounded-lg border border-[#d4c1a3]/60 space-y-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="font-bold text-xs text-[#111417] leading-snug">
                      {row.deliverable.title}
                    </h4>
                    {row.deliverable.isExtra && (
                      <span className="font-bold px-1.5 py-0.2 rounded bg-amber-50 text-amber-800 border border-amber-200 text-[9px] shrink-0">
                        Extra {row.deliverable.sellingPrice !== undefined ? (row.deliverable.sellingPrice === 0 ? '• Free' : `• ${formatINR(row.deliverable.sellingPrice)}`) : ''}
                      </span>
                    )}
                  </div>

                  {/* Due Date Indicator - clickable to edit */}
                  <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#d4c1a3]/30">
                    <span className="text-[#6b6660] flex items-center gap-1">
                      <Clock className="w-3 h-3" /> Due:
                    </span>
                    <button
                      type="button"
                      onClick={() => setEditingDeliverableState({
                        isOpen: true,
                        clientId: row.clientId,
                        clientName: row.coupleOrClientName,
                        deliverable: row.deliverable,
                      })}
                      className={`font-semibold px-1.5 py-0.5 rounded text-[9px] border hover:opacity-80 transition-opacity cursor-pointer ${
                        isCompleted
                          ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                          : row.dueStatus.color
                      }`}
                      title="Click to edit due date"
                    >
                      {isCompleted ? 'Delivered' : row.deliverable.dueDate ? `${row.deliverable.dueDate} (${row.dueStatus.label})` : 'Unscheduled'}
                    </button>
                  </div>
                </div>

                {/* 3 Action Boxes: Editor | Footage | Delivery */}
                <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                  {/* BOX 1: EDITOR */}
                  {row.assignedEditor ? (
                    <button
                      type="button"
                      onClick={() => setAssigningEditorDeliverable({ clientId: row.clientId, deliverable: row.deliverable })}
                      className="flex items-center justify-center gap-1 px-2 rounded-lg border border-[#d4c1a3] hover:border-[#7a2e33] bg-white hover:bg-stone-50 transition-all text-center group cursor-pointer h-9 w-full min-w-0"
                      title={`Assigned editor: ${row.assignedEditor.name} (Click to change)`}
                    >
                      <User className="w-3 h-3 text-[#7a2e33] shrink-0" />
                      <span className="text-[10.5px] font-bold text-[#111417] group-hover:text-[#7a2e33] truncate">
                        {row.assignedEditor.name}
                      </span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAssigningEditorDeliverable({ clientId: row.clientId, deliverable: row.deliverable })}
                      className="flex items-center justify-center gap-1 px-1.5 rounded-lg border border-dashed border-[#d4c1a3] hover:border-[#7a2e33] bg-[#fdfcfb] hover:bg-stone-50 transition-all text-center group cursor-pointer h-9 w-full min-w-0"
                      title="Assign an editor"
                    >
                      <Plus className="w-3 h-3 text-amber-800 shrink-0" />
                      <span className="text-[10.5px] font-bold text-amber-800 group-hover:text-[#7a2e33] truncate">
                        Assign Editor
                      </span>
                    </button>
                  )}

                  {/* BOX 2: FOOTAGE / RAW DATA */}
                  {hasRawData ? (
                    <div className="flex items-center justify-between px-2 rounded-lg border border-emerald-200 bg-emerald-50/70 text-center h-9 w-full min-w-0">
                      <div className="flex items-center gap-1 truncate text-emerald-950 font-bold text-[10px] min-w-0">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">{row.deliverable.rawDataSource === 'hard_drive' ? 'HDD Ready' : 'Cloud Ready'}</span>
                      </div>
                      <div className="flex items-center gap-0.5 shrink-0 ml-1">
                        {row.deliverable.rawDataLink && (
                          <a
                            href={row.deliverable.rawDataLink}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-[#7a2e33] hover:text-[#5a2226] rounded hover:bg-emerald-100/60 transition-colors"
                            title="Open raw data link"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => setManualRawTarget({ target: row.target, title: `${row.coupleOrClientName} — ${row.deliverable.title}` })}
                          className="p-1 text-[#6b6660] hover:text-[#7a2e33] rounded hover:bg-emerald-100/60 transition-colors cursor-pointer"
                          title="Edit footage details"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between px-2 rounded-lg border border-dashed border-[#d4c1a3] hover:border-[#7a2e33] bg-[#fdfcfb] transition-all text-center h-9 w-full group min-w-0">
                      <button
                        type="button"
                        onClick={() => setManualRawTarget({ target: row.target, title: `${row.coupleOrClientName} — ${row.deliverable.title}` })}
                        className="flex items-center gap-1 text-[10px] font-bold text-amber-800 hover:text-[#7a2e33] cursor-pointer truncate min-w-0"
                        title="Attach raw data or hard drive"
                      >
                        <Plus className="w-3 h-3 shrink-0" />
                        <span className="truncate">Raw Data</span>
                      </button>
                      {onUploadForDeliverable && (
                        <button
                          type="button"
                          onClick={() => onUploadForDeliverable(row.target)}
                          className="text-[#6b6660] hover:text-blue-700 p-0.5 rounded hover:bg-stone-100 cursor-pointer shrink-0 ml-1"
                          title="Upload to Google Drive"
                        >
                          <UploadCloud className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* BOX 3: DELIVERY LINK */}
                  {hasDeliveryLink ? (
                    <div className="flex items-center justify-between px-2 rounded-lg border border-emerald-200 bg-emerald-50/70 text-center h-9 w-full min-w-0">
                      <a
                        href={row.deliverable.deliveryLink || row.deliverable.link}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 text-[10px] font-bold text-emerald-950 hover:underline truncate min-w-0"
                        title="Open delivery link"
                      >
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate">Ready</span>
                      </a>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleCopy(row.id, row.deliverable.deliveryLink || row.deliverable.link || '')}
                          className="text-[#6b6660] hover:text-[#111417] p-0.5 cursor-pointer"
                          title="Copy delivery link"
                        >
                          {copiedId === row.id ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-2.5 h-2.5" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeliveryLinkModal({ clientId: row.clientId, deliverable: row.deliverable, link: row.deliverable.deliveryLink || row.deliverable.link || '' })}
                          className="text-[#6b6660] hover:text-[#111417] text-[10px] p-0.5 cursor-pointer"
                          title="Edit delivery link"
                        >
                          <Edit3 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setDeliveryLinkModal({ clientId: row.clientId, deliverable: row.deliverable, link: '' })}
                      className="flex items-center justify-center gap-1 px-1.5 rounded-lg border border-dashed border-[#d4c1a3] hover:border-[#7a2e33] bg-[#fdfcfb] hover:bg-stone-50 transition-all text-center group cursor-pointer h-9 w-full min-w-0"
                      title="Add final delivery link"
                    >
                      <Plus className="w-3 h-3 text-amber-800 shrink-0" />
                      <span className="text-[10.5px] font-bold text-amber-800 group-hover:text-[#7a2e33] truncate">
                        Delivery Link
                      </span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : viewMode === 'table' ? (
        /* TABLE / LIST VIEW */
        <div className="bg-white rounded-2xl border border-[#d4c1a3] overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="bg-[#f9f8f6] border-b border-[#d4c1a3] text-[#6b6660] uppercase text-[10px] tracking-wider">
                  <th className="py-3 px-4">Client / Couple</th>
                  <th className="py-3 px-4">Deliverable Title</th>
                  <th className="py-3 px-3">Type</th>
                  <th className="py-3 px-3">Billing</th>
                  <th className="py-3 px-3">Editor</th>
                  <th className="py-3 px-3">Due Date</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4c1a3]/40">
                {filteredRows.map((row) => {
                  return (
                    <tr key={row.id} className="hover:bg-stone-50/80 transition-colors">
                      <td className="py-3 px-4">
                        <div className="font-bold text-[#111417]">{row.coupleOrClientName}</div>
                        <div className="text-[11px] text-[#6b6660]">
                          {row.eventDateStr ? `Shoot: ${row.eventDateStr}` : 'No shoot recorded'}
                        </div>
                      </td>

                      <td className="py-3 px-4 max-w-xs">
                        <div className="font-bold text-[#111417] leading-tight">{row.deliverable.title}</div>
                        {row.deliverable.notes && (
                          <div className="text-[10px] text-[#6b6660] truncate">{row.deliverable.notes}</div>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-stone-100 text-stone-800 border border-stone-200">
                          {row.deliverable.category || 'General'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        {row.deliverable.isExtra ? (
                          <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                            Extra {row.deliverable.sellingPrice !== undefined ? (row.deliverable.sellingPrice === 0 ? '(₹0)' : `(${formatINR(row.deliverable.sellingPrice)})`) : ''}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[#6b6660]">
                            Quotation {row.deliverable.sellingPrice ? `(${formatINR(row.deliverable.sellingPrice)})` : ''}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3">
                        {row.assignedEditor ? (
                          <button
                            onClick={() => setAssigningEditorDeliverable({ clientId: row.clientId, deliverable: row.deliverable })}
                            className="font-bold text-[#111417] hover:underline text-xs cursor-pointer"
                          >
                            {row.assignedEditor.name}
                          </button>
                        ) : (
                          <button
                            onClick={() => setAssigningEditorDeliverable({ clientId: row.clientId, deliverable: row.deliverable })}
                            className="text-[10px] text-amber-800 font-semibold hover:underline cursor-pointer"
                          >
                            + Assign
                          </button>
                        )}
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${row.dueStatus.color}`}>
                          {row.deliverable.dueDate || 'Unscheduled'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <select
                          disabled={actionBusyId === row.id}
                          value={row.deliverable.status || 'pending'}
                          onChange={(e) => handleUpdateStatus(row, e.target.value as DeliverableStatus)}
                          className="text-[11px] font-bold px-2 py-1 rounded bg-[#f9f8f6] border border-[#d4c1a3] cursor-pointer"
                        >
                          <option value="pending">To Do</option>
                          <option value="in-progress">In Progress</option>
                          <option value="review">Review</option>
                          <option value="sent">Sent</option>
                          <option value="delivered">Delivered</option>
                        </select>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {row.client.phone && (
                            <button
                              onClick={() => handleWhatsAppShare(row)}
                              title="WhatsApp client"
                              className="text-emerald-700 hover:text-emerald-800 p-1 rounded hover:bg-emerald-50 cursor-pointer"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setEditingDeliverableState({
                              isOpen: true,
                              clientId: row.clientId,
                              clientName: row.coupleOrClientName,
                              deliverable: row.deliverable,
                            })}
                            title="Edit deliverable"
                            className="text-[#6b6660] hover:text-[#111417] p-1 rounded hover:bg-stone-100 cursor-pointer"
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
        /* KANBAN / PIPELINE VIEW */
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
          {[
            { id: 'pending', title: 'To Do / Awaiting Footage', badgeColor: 'bg-amber-100 text-amber-900', count: metrics.awaitingFootage },
            { id: 'in_progress', title: 'In Progress (Editing)', badgeColor: 'bg-sky-100 text-sky-900', count: metrics.inProgress },
            { id: 'review', title: 'Under Review / Revisions', badgeColor: 'bg-purple-100 text-purple-900', count: metrics.review },
            { id: 'completed', title: 'Completed / Delivered', badgeColor: 'bg-emerald-100 text-emerald-900', count: metrics.completed },
          ].map((column) => {
            const columnRows = filteredRows.filter(row => {
              const st = row.deliverable.status;
              if (column.id === 'pending') return st === 'pending' || !st;
              if (column.id === 'in_progress') return st === 'in-progress';
              if (column.id === 'review') return st === 'review' || st === 'changes' || st === 'sent';
              if (column.id === 'completed') return st === 'delivered';
              return false;
            });

            return (
              <div key={column.id} className="bg-[#f9f8f6] rounded-2xl p-3 border border-[#d4c1a3] space-y-3 min-h-[420px]">
                <div className="flex items-center justify-between pb-2 border-b border-[#d4c1a3]/60">
                  <h3 className="font-bold text-xs text-[#111417] uppercase tracking-wider">{column.title}</h3>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${column.badgeColor}`}>
                    {columnRows.length}
                  </span>
                </div>

                <div className="space-y-2.5">
                  {column.id === 'completed' && statusFilter === 'active' && metrics.completed > 0 ? (
                    <div className="text-center py-8 px-3 space-y-2.5 border border-dashed border-[#d4c1a3] rounded-xl bg-white/70">
                      <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                      <div className="text-xs font-bold text-[#111417]">
                        {metrics.completed} Completed {metrics.completed === 1 ? 'Item' : 'Items'} Hidden
                      </div>
                      <p className="text-[10px] text-[#6b6660] leading-relaxed">
                        Completed deliverables are hidden by default to keep the board focused.
                      </p>
                      <button
                        onClick={() => setStatusFilter('all')}
                        className="px-3 py-1.5 text-xs font-bold text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-xl transition-colors cursor-pointer"
                      >
                        Show {metrics.completed} Completed
                      </button>
                    </div>
                  ) : columnRows.length === 0 ? (
                    <div className="text-center py-8 text-xs text-[#6b6660] italic">
                      No deliverables in this stage
                    </div>
                  ) : (
                    columnRows.map(row => (
                      <div
                        key={row.id}
                        className="bg-white p-3 rounded-xl border border-[#d4c1a3] shadow-2xs space-y-2 hover:shadow-xs transition-shadow"
                      >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-[#111417] truncate">{row.coupleOrClientName}</span>
                        <span className="text-[9px] font-semibold text-[#6b6660]">{row.eventDateStr || ''}</span>
                      </div>

                      <div className="text-xs font-semibold text-[#7a2e33]">{row.deliverable.title}</div>

                      <div className="flex items-center justify-between text-[10px] pt-1 border-t border-[#d4c1a3]/30">
                        <span className="text-[#6b6660]">
                          {row.assignedEditor?.name || 'Unassigned'}
                        </span>
                        <span className={`font-semibold px-1.5 py-0.5 rounded ${row.dueStatus.color}`}>
                          {row.deliverable.dueDate || 'No due date'}
                        </span>
                      </div>

                      {/* Quick Move Action */}
                      <div className="flex items-center justify-between pt-1">
                        <select
                          value={row.deliverable.status || 'pending'}
                          onChange={(e) => handleUpdateStatus(row, e.target.value as DeliverableStatus)}
                          className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[#f9f8f6] border border-[#d4c1a3] cursor-pointer"
                        >
                          <option value="pending">Move: To Do</option>
                          <option value="in-progress">Move: Editing</option>
                          <option value="review">Move: Review</option>
                          <option value="sent">Move: Sent</option>
                          <option value="delivered">Move: Delivered</option>
                        </select>

                        <button
                          onClick={() => setEditingDeliverableState({
                            isOpen: true,
                            clientId: row.clientId,
                            clientName: row.coupleOrClientName,
                            deliverable: row.deliverable,
                          })}
                          className="text-[10px] text-[#7a2e33] font-bold hover:underline"
                        >
                          Edit
                        </button>
                      </div>
                    </div>
                  )))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Deliverable Modal */}
      <AddDeliverableModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onSuccess={() => {
          setIsAddModalOpen(false);
        }}
      />

      {/* Edit Deliverable Modal */}
      {editingDeliverableState.deliverable && (
        <EditDeliverableModal
          isOpen={editingDeliverableState.isOpen}
          clientId={editingDeliverableState.clientId}
          clientName={editingDeliverableState.clientName}
          deliverable={editingDeliverableState.deliverable}
          onClose={() => setEditingDeliverableState(prev => ({ ...prev, isOpen: false, deliverable: null }))}
        />
      )}

      {/* Manual Raw Data / Hard Drive Modal */}
      {manualRawTarget && (
        <ManualRawDataModal
          target={manualRawTarget.target}
          title={manualRawTarget.title}
          onClose={() => setManualRawTarget(null)}
          onSaved={() => setManualRawTarget(null)}
        />
      )}

      {/* Save Delivery Link Modal */}
      {deliveryLinkModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full border border-[#d4c1a3] shadow-2xl space-y-4">
            <h3 className="font-serif font-bold text-base text-[#111417]">Final Delivery Link</h3>
            <p className="text-xs text-[#6b6660]">
              Paste the Google Drive, Dropbox, or Gallery Portal link for{' '}
              <strong>{deliveryLinkModal.deliverable.title}</strong>:
            </p>

            <form onSubmit={handleSaveDeliveryLink} className="space-y-4">
              <input
                type="url"
                required
                value={deliveryLinkModal.link}
                onChange={(e) => setDeliveryLinkModal(prev => prev ? { ...prev, link: e.target.value } : null)}
                placeholder="https://drive.google.com/... or https://dropbox.com/..."
                className="w-full px-3.5 py-2 text-xs bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33]"
              />

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDeliveryLinkModal(null)}
                  className="px-3.5 py-1.5 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-bold text-white bg-[#7a2e33] hover:bg-[#5a2226] rounded-xl"
                >
                  Save Delivery Link
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Assign Editor Modal */}
      {assigningEditorDeliverable && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full border border-[#d4c1a3] shadow-2xl space-y-4 text-left">
            <h3 className="font-serif font-bold text-base text-[#111417]">Assign Post-Production Editor</h3>
            <p className="text-xs text-[#6b6660]">
              Assign an internal editor for <strong>{assigningEditorDeliverable.deliverable.title}</strong>:
            </p>

            <div className="space-y-2 max-h-60 overflow-y-auto">
              <button
                onClick={() => handleAssignEditor(
                  allDeliverableRows.find(r => r.deliverable.id === assigningEditorDeliverable.deliverable.id)!,
                  ''
                )}
                className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-stone-100 border border-[#d4c1a3] text-stone-600 font-semibold cursor-pointer"
              >
                — Unassign Editor —
              </button>
              {team.filter(m => m.active !== false).map((member) => (
                <button
                  key={member.id}
                  onClick={() => handleAssignEditor(
                    allDeliverableRows.find(r => r.deliverable.id === assigningEditorDeliverable.deliverable.id)!,
                    member.id
                  )}
                  className="w-full text-left px-3 py-2 text-xs rounded-xl hover:bg-[#7a2e33]/10 border border-[#d4c1a3] hover:border-[#7a2e33] flex items-center justify-between cursor-pointer"
                >
                  <span className="font-bold text-[#111417]">{member.name}</span>
                  <span className="text-[10px] text-[#6b6660]">{member.role || 'Editor'}</span>
                </button>
              ))}
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setAssigningEditorDeliverable(null)}
                className="px-3.5 py-1.5 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* WhatsApp Templates Drawer */}
      <WhatsAppTemplatesDrawer
        isOpen={isWhatsAppDrawerOpen}
        onClose={() => setIsWhatsAppDrawerOpen(false)}
      />
    </div>
  );
};
