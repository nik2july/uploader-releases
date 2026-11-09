import React, { useState, useEffect, useMemo } from 'react';
import {
  Share2,
  FolderOpen,
  Send,
  Phone,
  HardDrive,
  CheckCircle2,
  Sparkles,
  MessageCircle,
  Plus,
  Clock,
  Edit3,
  Film,
  Camera,
  Check,
  ExternalLink,
  AlertCircle,
  Video,
  ChevronDown,
  ChevronRight,
  FileVideo,
  Layers,
  Search,
  RefreshCw
} from 'lucide-react';
import type {
  ClientRevisionItem,
  DropboxDeliverableConfig,
  DropboxUploadStatus,
  StudioClientData,
  StudioDeliverableItem
} from '../types/contracts';
import { STUDIO_WEB_APP_CLIENTS, getStandardVideoDeliverables, getStandardPhotoDeliverables } from '@shared/studioClients';
import { computeProjectRootFolderName } from '@shared/naming';

export const DropboxReviewView: React.FC = () => {
  // Client selection
  const [clients, setClients] = useState<StudioClientData[]>(STUDIO_WEB_APP_CLIENTS);
  const [selectedClientName, setSelectedClientName] = useState<string>('Dhanur & Jhanvi');
  const [clientPhone, setClientPhone] = useState<string>('+1(647)862-8537');

  // Video & Photo Deliverables for the selected client
  const [videoDeliverables, setVideoDeliverables] = useState<StudioDeliverableItem[]>([]);
  const [photoDeliverables, setPhotoDeliverables] = useState<StudioDeliverableItem[]>([]);
  const [selectedDeliverableId, setSelectedDeliverableId] = useState<string>('deliv-dj-1');
  const [showPhotoSection, setShowPhotoSection] = useState<boolean>(false);
  const [isSyncingStudio, setIsSyncingStudio] = useState<boolean>(false);

  // New Deliverable inline modal
  const [showAddDeliverable, setShowAddDeliverable] = useState(false);
  const [newDelivTitle, setNewDelivTitle] = useState('');
  const [newDelivFormat, setNewDelivFormat] = useState('16:9 4K Cinema');

  // Selected Deliverable active details
  const [deliverableTitle, setDeliverableTitle] = useState('Edited Film');
  const [cutVersion, setCutVersion] = useState('Cut 1');
  const [renderFilePath, setRenderFilePath] = useState('/Volumes/40/261028 Dhanur & Jhanvi/04_RENDER_DELIVERABLES/02_Highlight_Film/Edited_Film_Cut1.mp4');
  const [sendWhatsApp, setSendWhatsApp] = useState(true);
  const [isFolderUpload, setIsFolderUpload] = useState<boolean>(false);

  // Dropbox upload state
  const [uploadStatus, setUploadStatus] = useState<DropboxUploadStatus>({
    state: 'idle',
    percent: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    shareUrl: 'https://www.dropbox.com/scl/fo/dhanur-jhanvi/teaser-cut1-review?rlkey=bw'
  });

  // Client revisions log
  const [revisions, setRevisions] = useState<ClientRevisionItem[]>([]);
  const [revisionFilterMode, setRevisionFilterMode] = useState<'this_deliv' | 'all'>('this_deliv');
  const [showAddRevision, setShowAddRevision] = useState(false);
  const [newCutVersion, setNewCutVersion] = useState('Cut 1');
  const [newRawNotes, setNewRawNotes] = useState('');
  const [newTimecodes, setNewTimecodes] = useState('');
  const [newPoints, setNewPoints] = useState('');
  const [newSource, setNewSource] = useState<'whatsapp' | 'call' | 'portal' | 'manual'>('call');
  const [aiParsing, setAiParsing] = useState(false);

  // Sync live with Studio OS Firestore
  const handleSyncStudio = async () => {
    setIsSyncingStudio(true);
    try {
      await window.clipsApi.syncStudioClients();
      const updatedClients = await window.clipsApi.getStudioClients();
      if (updatedClients && updatedClients.length > 0) {
        setClients(updatedClients);
      }
      const delivs = await window.clipsApi.getClientDeliverables(selectedClientName);
      if (delivs) {
        setVideoDeliverables(delivs.videoDeliverables || []);
        setPhotoDeliverables(delivs.photoDeliverables || []);
      }
    } catch (err) {
      console.warn('[DropboxReviewView] Studio live sync error:', err);
    } finally {
      setIsSyncingStudio(false);
    }
  };

  // Load clients and initial deliverables
  useEffect(() => {
    window.clipsApi.getStudioClients().then(list => {
      if (list && list.length > 0) {
        setClients(list);
      }
    });

    window.clipsApi.getRevisions().then(list => {
      if (list) setRevisions(list);
    });

    const unsub = window.clipsApi.onDropboxStatus(st => {
      setUploadStatus(st);
    });
    const unsubRaw = window.clipsApi.onDropboxRawClipsStatus(st => {
      setUploadStatus(prev => ({
        ...prev,
        state: st.state === 'cancelled' ? 'idle' : (st.state as any),
        percent: st.overallPercent,
        bytesUploaded: st.bytesUploaded,
        totalBytes: st.totalBytes,
        shareUrl: st.shareUrl || prev.shareUrl,
        whatsappSent: st.whatsappSent,
        error: st.error
      }));
    });
    return () => {
      unsub();
      unsubRaw();
    };
  }, []);

  // When client changes, load their categorized deliverables
  useEffect(() => {
    const current =
      clients.find(c => c.name.toLowerCase() === selectedClientName.toLowerCase()) ||
      clients.find(c => c.name.toLowerCase().includes('dhanur')) ||
      clients[0];

    if (current) {
      if (current.phone) setClientPhone(current.phone);

      window.clipsApi.getClientDeliverables(current.name).then(res => {
        const vids: StudioDeliverableItem[] =
          res.videoDeliverables && res.videoDeliverables.length > 0
            ? res.videoDeliverables
            : current.videoDeliverables && current.videoDeliverables.length > 0
            ? current.videoDeliverables
            : [];
        const phos: StudioDeliverableItem[] =
          res.photoDeliverables && res.photoDeliverables.length > 0
            ? res.photoDeliverables
            : current.photoDeliverables && current.photoDeliverables.length > 0
            ? current.photoDeliverables
            : [];

        setVideoDeliverables(vids);
        setPhotoDeliverables(phos);

        if (vids.length > 0) {
          const first = vids[0];
          setSelectedDeliverableId(first.id);
          setDeliverableTitle(first.title);
          setCutVersion(first.currentCut || 'Cut 1');
          if (first.renderFilePath) {
            setRenderFilePath(first.renderFilePath);
          } else {
            const rootName = computeProjectRootFolderName(current.name, current.events);
            let sub = '01_Teaser';
            if (/film|feature|full|documentary/i.test(first.title)) sub = '02_Highlight_Film';
            else if (/reel|social/i.test(first.title)) sub = '03_Reels';
            setRenderFilePath(
              `/Volumes/40/${rootName}/04_RENDER_DELIVERABLES/${sub}/${first.title.replace(/\W+/g, '_')}_Cut1.mp4`
            );
          }
          if (first.dropboxShareUrl) {
            setUploadStatus(prev => ({ ...prev, shareUrl: first.dropboxShareUrl }));
          }
        }
      });
    }
  }, [selectedClientName, clients]);

  // Handle clicking a video deliverable card
  const handleSelectDeliverable = (deliv: StudioDeliverableItem) => {
    setSelectedDeliverableId(deliv.id);
    setDeliverableTitle(deliv.title);
    setCutVersion(deliv.currentCut || 'Cut 1');

    const isRaw = /raw|rushes/i.test(deliv.title);
    setIsFolderUpload(isRaw);

    if (deliv.renderFilePath) {
      setRenderFilePath(deliv.renderFilePath);
    } else {
      const rootName = computeProjectRootFolderName(selectedClientName);
      if (isRaw) {
        setRenderFilePath(`/Volumes/40/${rootName}/05_CLIENT_CLIPS_DELIVERY/Raw Clips`);
      } else {
        let subDir = '01_Teaser';
        if (/film|feature|full/i.test(deliv.title)) subDir = '02_Highlight_Film';
        else if (/reel|social|instagram/i.test(deliv.title)) subDir = '03_Reels';
        else if (/speech|ritual|ceremony/i.test(deliv.title)) subDir = '04_Full_Length_Feature';
        setRenderFilePath(`/Volumes/40/${rootName}/04_RENDER_DELIVERABLES/${subDir}/${deliv.title.replace(/\W+/g, '_')}_Cut1.mp4`);
      }
    }

    if (deliv.dropboxShareUrl) {
      setUploadStatus(prev => ({ ...prev, shareUrl: deliv.dropboxShareUrl }));
    }
  };

  // Browse local video file or folder
  const handleSelectRenderFileOrFolder = async () => {
    if (isFolderUpload) {
      const rootName = computeProjectRootFolderName(selectedClientName);
      const defaultDir = renderFilePath || `/Volumes/40/${rootName}/05_CLIENT_CLIPS_DELIVERY/Raw Clips`;
      const dir = await window.clipsApi.openDirectory(defaultDir);
      if (dir) {
        setRenderFilePath(dir);
        setVideoDeliverables(prev =>
          prev.map(d => (d.id === selectedDeliverableId ? { ...d, renderFilePath: dir } : d))
        );
      }
    } else {
      const file = await window.clipsApi.openFile({ extensions: ['mp4', 'mov', 'm4v'] });
      if (file) {
        setRenderFilePath(file);
        setVideoDeliverables(prev =>
          prev.map(d => (d.id === selectedDeliverableId ? { ...d, renderFilePath: file } : d))
        );
      }
    }
  };

  // Upload to Dropbox & Share
  const handleUploadAndShare = async () => {
    if (!renderFilePath || !selectedClientName) return;

    if (isFolderUpload) {
      setUploadStatus({
        state: 'uploading',
        percent: 0,
        bytesUploaded: 0,
        totalBytes: 0
      });
      const res = await window.clipsApi.uploadDropboxRawClips({
        clientName: selectedClientName,
        clientPhone,
        folderPath: renderFilePath,
        deliverableTitle,
        sendWhatsApp
      });
      if (res && res.shareUrl) {
        setUploadStatus({
          state: 'completed',
          percent: 100,
          bytesUploaded: 100,
          totalBytes: 100,
          shareUrl: res.shareUrl,
          whatsappSent: res.whatsappSent
        });
        const updatedVids = videoDeliverables.map(d =>
          d.id === selectedDeliverableId
            ? {
                ...d,
                status: 'delivered' as const,
                currentCut: cutVersion,
                renderFilePath,
                dropboxShareUrl: res.shareUrl
              }
            : d
        );
        setVideoDeliverables(updatedVids);
        void window.clipsApi.saveClientDeliverables(selectedClientName, updatedVids, photoDeliverables);
      }
      return;
    }

    const config: DropboxDeliverableConfig = {
      clientId: selectedClientName,
      clientName: selectedClientName,
      clientPhone,
      deliverableId: selectedDeliverableId,
      deliverableTitle: `${deliverableTitle} (${cutVersion})`,
      renderFilePath,
      targetFolder: selectedClientName,
      sendWhatsApp,
      cutVersion
    };

    const res = await window.clipsApi.uploadDropboxDeliverable(config);
    if (res && res.shareUrl) {
      // Update deliverable state in memory and persist
      const updatedVids = videoDeliverables.map(d =>
        d.id === selectedDeliverableId
          ? {
              ...d,
              status: 'review' as const,
              currentCut: cutVersion,
              renderFilePath,
              dropboxShareUrl: res.shareUrl
            }
          : d
      );
      setVideoDeliverables(updatedVids);
      void window.clipsApi.saveClientDeliverables(selectedClientName, updatedVids, photoDeliverables);
    }
  };

  // Add new video deliverable for this client
  const handleAddVideoDeliverable = async () => {
    if (!newDelivTitle.trim()) return;
    const newDeliv: StudioDeliverableItem = {
      id: `deliv-custom-${Date.now()}`,
      title: newDelivTitle.trim(),
      category: 'video',
      format: newDelivFormat,
      status: 'todo',
      currentCut: 'Cut 1',
      renderFilePath: ''
    };
    const updated = [...videoDeliverables, newDeliv];
    setVideoDeliverables(updated);
    setSelectedDeliverableId(newDeliv.id);
    setDeliverableTitle(newDeliv.title);
    setShowAddDeliverable(false);
    setNewDelivTitle('');
    await window.clipsApi.saveClientDeliverables(selectedClientName, updated, photoDeliverables);
  };

  // AI Parse raw revision notes
  const handleAiParse = async () => {
    if (!newRawNotes.trim()) return;
    setAiParsing(true);
    const parsed = await window.clipsApi.aiParseNotes(newRawNotes);
    setNewPoints(parsed.points);
    setNewTimecodes(parsed.timecodes);
    setAiParsing(false);
  };

  // Submit client revision
  const handleAddRevisionSubmit = async () => {
    if (!newPoints.trim()) return;

    const added = await window.clipsApi.addRevision({
      deliverableId: selectedDeliverableId,
      deliverableTitle: `${deliverableTitle} (${newCutVersion})`,
      clientId: selectedClientName,
      clientName: selectedClientName,
      cutVersion: newCutVersion,
      timecodes: newTimecodes || 'General',
      points: newPoints,
      rawNotes: newRawNotes,
      source: newSource,
      status: 'pending',
      postProductionContact: '+91 88945 62004'
    });

    setRevisions([added, ...revisions]);
    setShowAddRevision(false);
    setNewRawNotes('');
    setNewPoints('');
    setNewTimecodes('');

    // Mark current deliverable as changes requested
    const updatedVids = videoDeliverables.map(d =>
      d.id === selectedDeliverableId ? { ...d, status: 'changes_requested' as const, currentCut: newCutVersion } : d
    );
    setVideoDeliverables(updatedVids);
    void window.clipsApi.saveClientDeliverables(selectedClientName, updatedVids, photoDeliverables);
  };

  const handleUpdateStatus = async (id: string, status: ClientRevisionItem['status']) => {
    const updated = await window.clipsApi.updateRevisionStatus(id, status);
    if (updated) {
      setRevisions(revisions.map(r => (r.id === id ? updated : r)));
    }
  };

  const isUploading =
    uploadStatus.state === 'uploading' ||
    uploadStatus.state === 'generating_link' ||
    uploadStatus.state === 'sending_whatsapp';

  // Filter revisions
  const filteredRevisions = useMemo(() => {
    if (revisionFilterMode === 'all') {
      return revisions.filter(
        r => r.clientName.toLowerCase() === selectedClientName.toLowerCase()
      );
    }
    return revisions.filter(
      r =>
        r.clientName.toLowerCase() === selectedClientName.toLowerCase() &&
        (r.deliverableId === selectedDeliverableId ||
          r.deliverableTitle.toLowerCase().includes(deliverableTitle.toLowerCase()))
    );
  }, [revisions, selectedClientName, selectedDeliverableId, deliverableTitle, revisionFilterMode]);

  const activeDeliverable = videoDeliverables.find(d => d.id === selectedDeliverableId);

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0D0C0A]">
      {/* Title & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#2D2824] gap-4">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#FBFAF7]">
            <Share2 className="w-5 h-5 text-[#E8A317]" />
            Dropbox Review Hub &amp; Client Changes Live Tracker
          </h1>
          <p className="text-xs text-[#8C857B] mt-1">
            Video editor workspace: Quoted video deliverables are listed below. Pick a cut, render, sync to Dropbox, and share review links with client.
          </p>
        </div>

        <button
          onClick={handleUploadAndShare}
          disabled={isUploading || !renderFilePath}
          className="sindoor-gradient-btn flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-lg disabled:opacity-40 cursor-pointer shrink-0"
        >
          <HardDrive className="w-4 h-4 text-[#E8A317]" />
          {isUploading ? 'Uploading to Dropbox…' : 'Sync to Dropbox & Share Review'}
        </button>
      </div>

      {/* CLIENT SELECTION BAR */}
      <div className="panel-card p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 border border-[#2D2824]">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#9B2226]/20 border border-[#9B2226]/40 flex items-center justify-center text-[#E8A317]">
            <Film className="w-4 h-4" />
          </div>
          <div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E8A317]">
              Current Client &amp; Quotation Scope
            </span>
            <div className="flex items-center gap-2 mt-0.5">
              <select
                value={selectedClientName}
                onChange={e => setSelectedClientName(e.target.value)}
                className="bg-[#1F1B18] border border-[#3D3630] rounded-lg px-3 py-1.5 text-sm font-serif font-bold text-[#FBFAF7] focus:outline-none cursor-pointer"
              >
                {clients.map(c => (
                  <option key={c.id || c.name} value={c.name}>
                    {c.name}
                  </option>
                ))}
              </select>
              <span className="text-xs text-[#8C857B] font-mono">{clientPhone}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={handleSyncStudio}
            disabled={isSyncingStudio}
            className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-semibold bg-[#1F1B18] text-[#D6D0C6] hover:text-[#FBFAF7] hover:bg-[#2A2420] border border-[#3D3630] cursor-pointer disabled:opacity-50 transition-colors"
            title="Sync latest quotation deliverables live from Studio OS (Firestore)"
          >
            <RefreshCw className={`w-3 h-3 text-[#E8A317] ${isSyncingStudio ? 'animate-spin' : ''}`} />
            <span>{isSyncingStudio ? 'Syncing Studio OS…' : 'Sync with Studio OS'}</span>
          </button>
          <span className="text-[11px] px-3 py-1 rounded-full font-mono font-bold bg-[#9B2226]/20 text-[#FBFAF7] border border-[#9B2226]/40">
            🎬 {videoDeliverables.length} {videoDeliverables.length === 1 ? 'Video Deliverable' : 'Video Deliverables'} Quoted
          </span>
          <span className="text-[11px] px-3 py-1 rounded-full font-mono bg-[#1F1B18] text-[#8C857B] border border-[#2D2824]">
            📷 {photoDeliverables.length} {photoDeliverables.length === 1 ? 'Photo Deliverable' : 'Photo Deliverables'}
          </span>
        </div>
      </div>

      {/* Main 2-Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (7 cols): Video Deliverables & Dropbox Sync */}
        <div className="lg:col-span-7 flex flex-col gap-5">
          {/* SECTION 1: VIDEO DELIVERABLES (Quotation Scope - Video Editor Responsibility) */}
          <div className="panel-card p-5 flex flex-col gap-4 border border-[#2D2824]">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-md bg-[#9B2226] text-white flex items-center justify-center">
                  <Film className="w-3.5 h-3.5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
                    Video Deliverables (Video Editor Scope)
                  </h3>
                  <p className="text-[11px] text-[#8C857B]">
                    These are the video deliverables quoted for {selectedClientName}. Click any to inspect cut version or sync to Dropbox.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowAddDeliverable(true)}
                className="flex items-center gap-1 px-2.5 py-1 rounded bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-[#E8A317] text-[11px] font-semibold transition-colors cursor-pointer shrink-0"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Video Cut</span>
              </button>
            </div>

            {/* Inline Add Deliverable Form */}
            {showAddDeliverable && (
              <div className="p-3.5 rounded-xl bg-[#141110] border border-[#E8A317]/50 flex flex-col gap-3">
                <span className="text-xs font-bold text-[#E8A317]">Add New Video Deliverable</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <input
                    type="text"
                    placeholder="Deliverable Title (e.g. SDE Party Reel 9:16)"
                    value={newDelivTitle}
                    onChange={e => setNewDelivTitle(e.target.value)}
                    className="bg-[#1F1B18] border border-[#2D2824] rounded-lg px-3 py-1.5 text-xs text-[#FBFAF7] focus:outline-none"
                  />
                  <select
                    value={newDelivFormat}
                    onChange={e => setNewDelivFormat(e.target.value)}
                    className="bg-[#1F1B18] border border-[#2D2824] rounded-lg px-3 py-1.5 text-xs text-[#FBFAF7] focus:outline-none"
                  >
                    <option value="16:9 4K Cinema">16:9 4K Cinema</option>
                    <option value="9:16 Vertical Reel">9:16 Vertical Reel</option>
                    <option value="16:9 Documentary">16:9 Documentary</option>
                    <option value="4K Master Archive">4K Master Archive</option>
                  </select>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAddDeliverable(false)}
                    className="px-3 py-1 rounded text-xs text-[#8C857B] hover:text-[#FBFAF7]"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAddVideoDeliverable}
                    disabled={!newDelivTitle.trim()}
                    className="sindoor-gradient-btn px-4 py-1.5 rounded-lg text-xs font-bold cursor-pointer disabled:opacity-40"
                  >
                    Save Deliverable
                  </button>
                </div>
              </div>
            )}

            {/* List of Video Deliverable Cards */}
            <div className="grid grid-cols-1 gap-2.5">
              {videoDeliverables.map(deliv => {
                const isSelected = deliv.id === selectedDeliverableId;
                return (
                  <div
                    key={deliv.id}
                    onClick={() => handleSelectDeliverable(deliv)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      isSelected
                        ? 'bg-[#1A1313] border-[#9B2226] shadow-md shadow-[#9B2226]/10'
                        : 'bg-[#141110] border-[#2D2824] hover:border-[#3D3630]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                            isSelected ? 'bg-[#9B2226] text-white' : 'bg-[#1F1B18] text-[#8C857B]'
                          }`}
                        >
                          <Video className="w-3.5 h-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h4
                              className={`text-xs font-bold ${
                                isSelected ? 'text-[#FBFAF7]' : 'text-[#D6D0C6]'
                              }`}
                            >
                              {deliv.title}
                            </h4>
                            {deliv.notes && deliv.notes.toLowerCase().includes('long form') && (
                              <span className="text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#2A231D] text-[#E8A317] border border-[#E8A317]/40">
                                LONG FORM
                              </span>
                            )}
                            {deliv.notes && deliv.notes.toLowerCase().includes('raw') && (
                              <span className="text-[9px] font-mono font-medium px-2 py-0.5 rounded bg-[#1F1B18] text-[#A8A29E] border border-[#3D3630]">
                                Raw footage basis
                              </span>
                            )}
                          </div>
                          {deliv.format && (
                            <span className="text-[10px] font-mono text-[#8C857B]">
                              Format: {deliv.format}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-[#1F1B18] text-[#E8A317] border border-[#3D3630]">
                          {deliv.currentCut || 'Cut 1'}
                        </span>

                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                            deliv.status === 'review'
                              ? 'bg-[#2A9D8F]/15 border-[#2A9D8F]/40 text-[#2A9D8F]'
                              : deliv.status === 'changes_requested'
                                ? 'bg-[#9B2226]/20 border-[#9B2226]/40 text-[#F87171]'
                                : deliv.status === 'approved'
                                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-400'
                                  : deliv.status === 'in_progress'
                                    ? 'bg-[#E8A317]/15 border-[#E8A317]/40 text-[#E8A317]'
                                    : 'bg-[#1F1B18] border-[#2D2824] text-[#8C857B]'
                          }`}
                        >
                          {deliv.status === 'review'
                            ? 'In Review'
                            : deliv.status === 'changes_requested'
                              ? 'Changes Requested'
                              : deliv.status === 'approved'
                                ? 'Approved'
                                : deliv.status === 'in_progress'
                                  ? 'In Editing'
                                  : 'Todo'}
                        </span>
                      </div>
                    </div>

                    {deliv.notes && (
                      <p className="text-[11px] text-[#8C857B] italic line-clamp-1">
                        "{deliv.notes}"
                      </p>
                    )}

                    {deliv.dropboxShareUrl && (
                      <div className="flex items-center justify-between pt-1 border-t border-[#24201C] text-[10px] font-mono text-[#60A5FA]">
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#2A9D8F]" />
                          Dropbox Active
                        </span>
                        <a
                          href={deliv.dropboxShareUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="hover:underline flex items-center gap-0.5 text-[#60A5FA]"
                        >
                          Open Review Link <ExternalLink className="w-2.5 h-2.5 ml-0.5" />
                        </a>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Collapsible Photo Deliverables Section (for clarity) */}
            <div className="pt-2 border-t border-[#24201C]">
              <button
                type="button"
                onClick={() => setShowPhotoSection(!showPhotoSection)}
                className="w-full flex items-center justify-between py-1 text-xs text-[#8C857B] hover:text-[#FBFAF7] cursor-pointer"
              >
                <span className="flex items-center gap-1.5">
                  <Camera className="w-3.5 h-3.5 text-amber-400" />
                  <span>Photo Deliverables ({photoDeliverables.length} Items — Photo Team Scope)</span>
                </span>
                {showPhotoSection ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
              </button>

              {showPhotoSection && (
                <div className="mt-2 space-y-1.5 pl-2 border-l border-amber-500/20">
                  {photoDeliverables.map(p => (
                    <div key={p.id} className="p-2 rounded-lg bg-[#141110] border border-[#2D2824] flex items-center justify-between text-xs">
                      <span className="text-[#D6D0C6]">{p.title}</span>
                      <span className="text-[10px] font-mono text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
                        Photo Dept
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* SECTION 2: DROPBOX SYNC & DISPATCH (Selected Deliverable) */}
          <div className="panel-card p-5 flex flex-col gap-4 border border-[#2D2824]">
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
              <div className="flex items-center gap-2">
                <HardDrive className="w-4 h-4 text-[#E8A317]" />
                <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
                  Sync Selected Deliverable To Dropbox
                </h3>
              </div>
              <span className="text-[10px] font-mono text-[#E8A317] font-bold">
                Target: {activeDeliverable?.title || deliverableTitle}
              </span>
            </div>

            {/* Cut Version & Render File */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label className="text-xs text-[#8C857B]">Cut Version</label>
                <select
                  value={cutVersion}
                  onChange={e => setCutVersion(e.target.value)}
                  className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
                >
                  <option value="Cut 1">Cut 1 (Initial Review)</option>
                  <option value="Cut 2">Cut 2 (After Revisions)</option>
                  <option value="Cut 3">Cut 3</option>
                  <option value="Final Master">Final Master Delivery</option>
                </select>
              </div>

              <div className="flex flex-col gap-1.5 sm:col-span-2">
                <label className="text-xs text-[#8C857B]">Deliverable Title on Dropbox</label>
                <input
                  type="text"
                  value={deliverableTitle}
                  onChange={e => setDeliverableTitle(e.target.value)}
                  className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
                />
              </div>
            </div>

            {/* Upload Type Selector: Single Video Cut vs Transcoded Raw Clips Folder */}
            <div className="flex items-center gap-2 p-1 bg-[#141110] border border-[#2D2824] rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setIsFolderUpload(false);
                  const rootName = computeProjectRootFolderName(selectedClientName);
                  setRenderFilePath(`/Volumes/40/${rootName}/04_RENDER_DELIVERABLES/02_Highlight_Film/${deliverableTitle.replace(/\W+/g, '_')}_Cut1.mp4`);
                }}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
                  !isFolderUpload
                    ? 'bg-[#9B2226] text-white shadow-sm'
                    : 'text-[#8C857B] hover:text-[#FBFAF7]'
                }`}
              >
                🎬 Single Video File (Master Cut)
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsFolderUpload(true);
                  const rootName = computeProjectRootFolderName(selectedClientName);
                  setRenderFilePath(`/Volumes/40/${rootName}/05_CLIENT_CLIPS_DELIVERY/Raw Clips`);
                  setDeliverableTitle('Transcoded Raw Clips (Rec.709)');
                }}
                className={`flex-1 py-1.5 px-3 rounded text-xs font-semibold transition-all cursor-pointer ${
                  isFolderUpload
                    ? 'bg-[#0061FE] text-white shadow-sm'
                    : 'text-[#8C857B] hover:text-[#FBFAF7]'
                }`}
              >
                📁 Transcoded Raw Clips Folder
              </button>
            </div>

            {/* Rendered File / Folder Selector */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8C857B] flex items-center justify-between">
                <span>
                  {isFolderUpload
                    ? 'Transcoded Raw Clips Folder (from 05_CLIENT_CLIPS_DELIVERY)'
                    : 'Rendered Video File (from 04_RENDER_DELIVERABLES)'}
                </span>
                {isFolderUpload && (
                  <span className="text-[10px] text-[#60A5FA] font-mono">
                    Batch Folder Mode
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={renderFilePath}
                  placeholder={
                    isFolderUpload
                      ? 'Select folder containing transcoded raw clips…'
                      : 'Select rendered .mp4 or .mov file…'
                  }
                  className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none truncate"
                />
                <button
                  type="button"
                  onClick={handleSelectRenderFileOrFolder}
                  disabled={isUploading}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7] cursor-pointer shrink-0"
                >
                  <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                  {isFolderUpload ? 'Select Folder…' : 'Select File…'}
                </button>
              </div>
            </div>

            {/* WhatsApp Phone & Toggle */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs text-[#8C857B]">Client WhatsApp Phone Number</label>
                <input
                  type="text"
                  value={clientPhone}
                  onChange={e => setClientPhone(e.target.value)}
                  placeholder="+91..."
                  className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 h-[38px]">
                <div className="flex items-center gap-2">
                  <MessageCircle className="w-4 h-4 text-[#2A9D8F]" />
                  <span className="text-xs font-semibold text-[#FBFAF7]">
                    Auto-Share WhatsApp
                  </span>
                </div>
                <input
                  type="checkbox"
                  checked={sendWhatsApp}
                  onChange={e => setSendWhatsApp(e.target.checked)}
                  className="w-4 h-4 accent-[#2A9D8F]"
                />
              </div>
            </div>

            {/* WhatsApp Message Live Preview */}
            <div className="bg-[#0A100D] border border-[#16382B] rounded-xl p-4 text-xs text-[#D8E2DC] leading-relaxed relative flex flex-col gap-2.5">
              <div className="flex items-center justify-between text-[10px] font-mono text-[#2A9D8F]">
                <span>WHATSAPP DISPATCH PREVIEW</span>
                <span>Official Meta Graph API</span>
              </div>
              <div className="font-semibold text-[#FBFAF7]">Dear {selectedClientName},</div>
              <div>
                {isFolderUpload ? (
                  <span>
                    Your color-graded raw video rushes (Rec.709) are ready for viewing &amp; download on Studio Dropbox! 🎥✨
                  </span>
                ) : (
                  <span>
                    Your <strong className="text-[#E8A317]">{deliverableTitle} ({cutVersion})</strong> is ready for your private review! 🎬
                  </span>
                )}
              </div>
              <div className="p-2.5 rounded-lg bg-[#0E1A15] border border-[#1B4332] text-[#60A5FA] font-mono text-[11px] truncate">
                🔗 {uploadStatus.shareUrl || `https://www.dropbox.com/scl/fo/${selectedClientName.toLowerCase().replace(/\W+/g, '-')}/${isFolderUpload ? 'raw-clips' : 'review'}`}
              </div>
              <div className="text-[11px] text-[#A3B18A] flex flex-col gap-1">
                {isFolderUpload ? (
                  <span>💡 All clips converted from flat Sony S-Log3 into vibrant Rec.709 High Definition MP4 video. Stream directly or download full batch.</span>
                ) : (
                  <>
                    <span>📝 <strong>How to request changes:</strong></span>
                    <span>Please watch the cut and reply with notes specifying exact timecodes (e.g. 01:23 - change background song).</span>
                  </>
                )}
              </div>
              <div className="pt-2 border-t border-[#1B4332] flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-[#E8A317] font-semibold">
                  <Phone className="w-3.5 h-3.5" /> Call Post-Production: +91 88945 62004
                </span>
                <span className="text-[#6B7280] font-mono text-[10px]">Baawaray Films</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Client Changes & Revisions Log */}
        <div className="lg:col-span-5 panel-card p-5 flex flex-col gap-4 border border-[#2D2824]">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
            <div>
              <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
                Client Revisions &amp; Changes ({filteredRevisions.length})
              </h3>
              <p className="text-[11px] text-[#8C857B]">
                Changes received reflect instantly in app for assigned editors.
              </p>
            </div>

            <button
              onClick={() => setShowAddRevision(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#E8A317] cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" /> Log Change
            </button>
          </div>

          {/* Filter Bar: This Deliverable vs All */}
          <div className="flex rounded-lg bg-[#141110] p-1 border border-[#2D2824]">
            <button
              type="button"
              onClick={() => setRevisionFilterMode('this_deliv')}
              className={`flex-1 py-1 text-center rounded text-xs font-semibold transition-all ${
                revisionFilterMode === 'this_deliv'
                  ? 'bg-[#9B2226] text-[#FBFAF7]'
                  : 'text-[#8C857B] hover:text-[#FBFAF7]'
              }`}
            >
              Selected Deliverable
            </button>
            <button
              type="button"
              onClick={() => setRevisionFilterMode('all')}
              className={`flex-1 py-1 text-center rounded text-xs font-semibold transition-all ${
                revisionFilterMode === 'all'
                  ? 'bg-[#9B2226] text-[#FBFAF7]'
                  : 'text-[#8C857B] hover:text-[#FBFAF7]'
              }`}
            >
              All for {selectedClientName}
            </button>
          </div>

          {/* Add Revision Form Modal / Inline */}
          {showAddRevision && (
            <div className="p-4 rounded-xl bg-[#141110] border border-[#E8A317]/50 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#E8A317] flex items-center gap-1.5">
                  <Edit3 className="w-4 h-4" /> Log Received Changes
                </span>
                <button
                  onClick={() => setShowAddRevision(false)}
                  className="text-[#8C857B] hover:text-[#FBFAF7] text-xs"
                >
                  ✕ Cancel
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8C857B]">Cut Version</label>
                  <select
                    value={newCutVersion}
                    onChange={e => setNewCutVersion(e.target.value)}
                    className="bg-[#1F1B18] border border-[#2D2824] rounded px-2 py-1.5 text-xs text-[#FBFAF7]"
                  >
                    <option value="Cut 1">Cut 1</option>
                    <option value="Cut 2">Cut 2</option>
                    <option value="Cut 3">Cut 3</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[11px] text-[#8C857B]">Channel Received</label>
                  <select
                    value={newSource}
                    onChange={e => setNewSource(e.target.value as any)}
                    className="bg-[#1F1B18] border border-[#2D2824] rounded px-2 py-1.5 text-xs text-[#FBFAF7]"
                  >
                    <option value="call">Phone Call (+91 88945 62004)</option>
                    <option value="whatsapp">WhatsApp Message</option>
                    <option value="portal">Review Portal</option>
                    <option value="manual">Studio Walk-in</option>
                  </select>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-[11px] text-[#8C857B]">Raw Notes / Client Audio</label>
                  <button
                    onClick={handleAiParse}
                    disabled={aiParsing || !newRawNotes.trim()}
                    className="text-[10px] text-[#E8A317] hover:underline flex items-center gap-1 cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" />
                    {aiParsing ? 'Structuring…' : 'Parse Points with Gemini AI'}
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={newRawNotes}
                  onChange={e => setNewRawNotes(e.target.value)}
                  placeholder="Paste client raw text or call summary: 'At 00:28 replace ring exchange angle and remove song at 01:12...'"
                  className="bg-[#1F1B18] border border-[#2D2824] rounded p-2 text-xs text-[#FBFAF7] focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#8C857B]">Specific Timecodes</label>
                <input
                  type="text"
                  value={newTimecodes}
                  onChange={e => setNewTimecodes(e.target.value)}
                  placeholder="00:28, 01:12..."
                  className="bg-[#1F1B18] border border-[#2D2824] rounded px-2 py-1.5 text-xs text-[#FBFAF7] font-mono"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[11px] text-[#8C857B]">Formatted Edit Points</label>
                <textarea
                  rows={3}
                  value={newPoints}
                  onChange={e => setNewPoints(e.target.value)}
                  placeholder="1. Replace ring exchange angle with CAM B closeup.&#10;2. Reduce background music volume during vows."
                  className="bg-[#1F1B18] border border-[#2D2824] rounded p-2 text-xs text-[#FBFAF7] focus:outline-none"
                />
              </div>

              <button
                onClick={handleAddRevisionSubmit}
                disabled={!newPoints.trim()}
                className="sindoor-gradient-btn py-2 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Save &amp; Notify Assigned Editor
              </button>
            </div>
          )}

          {/* Revisions List */}
          <div className="flex flex-col gap-3 overflow-y-auto max-h-[500px] pr-1">
            {filteredRevisions.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#8C857B] italic bg-[#141110] rounded-xl border border-dashed border-[#2D2824]">
                No revision notes logged for this deliverable yet.
              </div>
            ) : (
              filteredRevisions.map(rev => (
                <div
                  key={rev.id}
                  className="p-3.5 rounded-xl bg-[#141110] border border-[#2D2824] flex flex-col gap-2.5 hover:border-[#3D3630] transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="font-serif font-bold text-xs text-[#FBFAF7]">
                        {rev.clientName}
                      </span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-[#1F1B18] text-[#E8A317] border border-[#3D3630]">
                        {rev.cutVersion}
                      </span>
                    </div>

                    {/* Status Dropdown */}
                    <select
                      value={rev.status}
                      onChange={e => handleUpdateStatus(rev.id, e.target.value as any)}
                      className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border focus:outline-none ${
                        rev.status === 'approved'
                          ? 'bg-[#2A9D8F]/15 border-[#2A9D8F]/40 text-[#2A9D8F]'
                          : rev.status === 'in_progress'
                            ? 'bg-[#E8A317]/15 border-[#E8A317]/40 text-[#E8A317]'
                            : 'bg-[#9B2226]/15 border-[#9B2226]/40 text-[#F87171]'
                      }`}
                    >
                      <option value="pending">Pending Changes</option>
                      <option value="in_progress">In Editing</option>
                      <option value="revised">Revised Cut Uploaded</option>
                      <option value="approved">Approved by Client</option>
                    </select>
                  </div>

                  {/* Deliverable Tag */}
                  <div className="text-[10px] font-mono text-[#8C857B] truncate">
                    Deliverable: <span className="text-[#D6D0C6]">{rev.deliverableTitle}</span>
                  </div>

                  {/* Timecodes */}
                  {rev.timecodes && (
                    <div className="flex items-center gap-1.5 text-[11px] font-mono text-[#E8A317]">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Timecodes: {rev.timecodes}</span>
                    </div>
                  )}

                  {/* Revision Points */}
                  <div className="text-xs text-[#D6D0C6] whitespace-pre-line bg-[#0D0C0A] p-2.5 rounded-lg border border-[#24201C] font-mono text-[11px]">
                    {rev.points}
                  </div>

                  <div className="flex items-center justify-between text-[10px] text-[#8C857B] pt-1 border-t border-[#24201C]">
                    <span>Source: {rev.source === 'call' ? '📞 Hotline Call (+91 88945 62004)' : '💬 WhatsApp Message'}</span>
                    <span className="font-mono">
                      {new Date(rev.timestamp).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
