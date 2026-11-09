import React, { useState, useEffect, useMemo } from 'react';
import {
  Film,
  FolderOpen,
  Play,
  Pause,
  XCircle,
  FileCheck2,
  Tv,
  CheckCircle2,
  Layers,
  Sparkles,
  Video,
  Wand2,
  Zap,
  FolderCheck,
  RefreshCw,
  HardDrive,
  Cloud,
  UploadCloud,
  Share2,
  Copy,
  ExternalLink,
  MessageCircle,
  Phone,
  Check,
  X,
  AlertTriangle
} from 'lucide-react';
import type {
  ActiveStudioProject,
  ClipDeliveryMode,
  ClipDeliveryRunState,
  ClipDeliverySettings,
  DetectedTranscodedFolder,
  DropboxFolderUploadStatus,
  FootageFolderStats,
  FpsCapChoice,
  LutPreset
} from '../types/contracts';
import { STUDIO_WEB_APP_CLIENTS } from '@shared/studioClients';
import { computeProjectRootFolderName, formatEventSubfolderName } from '@shared/naming';
import {
  getActiveStudioProject,
  saveActiveStudioProject,
  getRecentStudioProjects,
  resolveSmartProjectContext,
  subscribeActiveStudioProject
} from '@shared/smartPathResolver';

const DEFAULT_DELIVERY_PREFERENCES = {
  deliveryMode: 'raw_only' as ClipDeliveryMode,
  applyRawLut: true,
  quality: 'balanced' as 'archive' | 'balanced' | 'compact',
  fullHD: true,
  fpsCap: 50 as FpsCapChoice,
  autoHLG: true
};

function getSavedDeliveryPreferences() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      const raw = window.localStorage.getItem('baawaray_delivery_preferences_v1');
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          deliveryMode: (parsed.deliveryMode || DEFAULT_DELIVERY_PREFERENCES.deliveryMode) as ClipDeliveryMode,
          applyRawLut: typeof parsed.applyRawLut === 'boolean' ? parsed.applyRawLut : DEFAULT_DELIVERY_PREFERENCES.applyRawLut,
          quality: (parsed.quality || DEFAULT_DELIVERY_PREFERENCES.quality) as 'archive' | 'balanced' | 'compact',
          fullHD: typeof parsed.fullHD === 'boolean' ? parsed.fullHD : DEFAULT_DELIVERY_PREFERENCES.fullHD,
          fpsCap: (parsed.fpsCap !== undefined ? parsed.fpsCap : DEFAULT_DELIVERY_PREFERENCES.fpsCap) as FpsCapChoice,
          autoHLG: typeof parsed.autoHLG === 'boolean' ? parsed.autoHLG : DEFAULT_DELIVERY_PREFERENCES.autoHLG
        };
      }
    }
  } catch {}
  return DEFAULT_DELIVERY_PREFERENCES;
}

export interface ClipsDeliveryViewProps {
  onOpenSettings?: () => void;
}

export const ClipsDeliveryView: React.FC<ClipsDeliveryViewProps> = ({ onOpenSettings }) => {
  const initialPrefs = useMemo(() => getSavedDeliveryPreferences(), []);

  const [deliveryMode, setDeliveryMode] = useState<ClipDeliveryMode>(initialPrefs.deliveryMode);
  const [rawSourcePath, setRawSourcePath] = useState('');
  const [editedSourcePath, setEditedSourcePath] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [applyRawLut, setApplyRawLut] = useState(initialPrefs.applyRawLut);
  const [lutPresets, setLutPresets] = useState<LutPreset[]>([]);
  const [selectedLutPath, setSelectedLutPath] = useState('');
  const [quality, setQuality] = useState<'archive' | 'balanced' | 'compact'>(initialPrefs.quality);
  const [targetSizeGB, setTargetSizeGB] = useState<number | undefined>(undefined);
  const [useTargetSize, setUseTargetSize] = useState(false);
  const [fullHD, setFullHD] = useState(initialPrefs.fullHD);
  const [fpsCap, setFpsCap] = useState<FpsCapChoice>(initialPrefs.fpsCap);
  const [autoHLG, setAutoHLG] = useState(initialPrefs.autoHLG);

  const [activeProject, setActiveProject] = useState<ActiveStudioProject | null>(() => getActiveStudioProject());
  const [recentProjects, setRecentProjects] = useState<ActiveStudioProject[]>(() => getRecentStudioProjects());
  const [autoLinkedNote, setAutoLinkedNote] = useState<string>('');
  const [footageStats, setFootageStats] = useState<FootageFolderStats | null>(null);
  const [isScanningFootage, setIsScanningFootage] = useState(false);

  const previewLayoutPath = useMemo(() => {
    if (!destinationPath) return '[Destination]';
    const clean = destinationPath.replace(/\\/g, '/').replace(/\/+$/, '');
    const base = clean.split('/').pop() || '';
    const norm = (s: string) => s.trim().toLowerCase().replace(/[\s–—_-]+/g, '-');
    const eventName =
      activeProject?.eventName ||
      (rawSourcePath.includes(' - ') ? rawSourcePath.split('/').pop() || '' : '');

    if (eventName && !norm(base).includes(norm(eventName)) && !/^\d{4}\.\d{2}\.\d{2}/.test(base)) {
      return `${clean}/${eventName}`;
    }
    return clean;
  }, [destinationPath, activeProject?.eventName, rawSourcePath]);

  // Dropbox Raw Clips Upload states
  const [dropboxUploadFolder, setDropboxUploadFolder] = useState('');
  const [dropboxClientName, setDropboxClientName] = useState('');
  const [dropboxClientPhone, setDropboxClientPhone] = useState('');
  const [dropboxSendWhatsApp, setDropboxSendWhatsApp] = useState(true);
  const [autoUploadToDropbox, setAutoUploadToDropbox] = useState(false);
  const [showDropboxModal, setShowDropboxModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [isDetectingFolder, setIsDetectingFolder] = useState(false);
  const [detectedFolderInfo, setDetectedFolderInfo] = useState<DetectedTranscodedFolder | null>(null);
  const [dropboxConnected, setDropboxConnected] = useState<boolean | null>(null);
  const [dropboxConnectedEmail, setDropboxConnectedEmail] = useState<string | null>(null);
  const [quickToken, setQuickToken] = useState<string>('');
  const [isConnectingToken, setIsConnectingToken] = useState(false);
  const [tokenError, setTokenError] = useState<string | null>(null);
  const [dropboxStatus, setDropboxStatus] = useState<DropboxFolderUploadStatus>({
    state: 'idle',
    currentFileIndex: 0,
    totalFiles: 0,
    currentFileName: '',
    currentFilePercent: 0,
    overallPercent: 0,
    bytesUploaded: 0,
    totalBytes: 0,
    logs: []
  });

  const defaultRawClipsFolder = useMemo(() => {
    if (detectedFolderInfo?.found && detectedFolderInfo.folderPath) {
      return detectedFolderInfo.folderPath;
    }
    if (!destinationPath) return '';
    const clean = destinationPath.replace(/\\/g, '/').replace(/\/+$/, '');
    if (clean.endsWith('/Raw Clips') || clean.endsWith('Raw Clips')) return clean;
    return `${clean}/Raw Clips`;
  }, [destinationPath, detectedFolderInfo]);

  const dropboxDestinationPreview = useMemo(() => {
    const client = dropboxClientName || activeProject?.clientName || 'Client';
    const match = STUDIO_WEB_APP_CLIENTS.find(
      c => c.name.toLowerCase() === client.toLowerCase()
    );
    const clientFolder = computeProjectRootFolderName(
      client,
      match?.events,
      activeProject?.eventDate,
      activeProject?.eventName
    );
    const evName =
      detectedFolderInfo?.eventName ||
      activeProject?.eventName ||
      match?.events?.[0]?.eventName ||
      'Wedding';
    const evDate = activeProject?.eventDate || match?.events?.[0]?.date;
    const eventFolder = formatEventSubfolderName(evName, evDate, client);
    return `/Deliverables/${clientFolder}/${eventFolder}/Raw Clips`;
  }, [dropboxClientName, activeProject, detectedFolderInfo]);

  useEffect(() => {
    if (activeProject) {
      setDropboxClientName(activeProject.clientName);
      const match = STUDIO_WEB_APP_CLIENTS.find(
        c => c.name.toLowerCase() === activeProject.clientName.toLowerCase()
      );
      if (match?.phone) {
        setDropboxClientPhone(match.phone);
      }
    }
  }, [activeProject]);

  useEffect(() => {
    const unsub = window.clipsApi.onDropboxRawClipsStatus(s => {
      setDropboxStatus(s);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    // Check initial Dropbox connection status
    window.clipsApi.testDropboxConnection().then(res => {
      setDropboxConnected(res.ok);
      if (res.ok && res.email) {
        setDropboxConnectedEmail(res.email);
      }
    }).catch(() => setDropboxConnected(false));

    window.clipsApi.getDropboxConfig().then(cfg => {
      if (cfg?.refreshToken) {
        setQuickToken(cfg.refreshToken);
      }
    }).catch(() => {});
  }, []);

  const [state, setState] = useState<ClipDeliveryRunState>({
    state: 'idle',
    rawClipsCount: 0,
    rawClipsDone: 0,
    editedVideosCount: 0,
    editedVideosDone: 0,
    totalCount: 0,
    completedCount: 0,
    totalDuration: 0,
    completedDuration: 0,
    currentFile: '',
    currentType: '',
    percent: 0,
    logs: []
  });

  useEffect(() => {
    // 1. Initial check for active project created by Smart Folders
    const initialActive = getActiveStudioProject();
    if (initialActive) {
      setActiveProject(initialActive);
      setRawSourcePath(initialActive.rawSourcePath);
      setDestinationPath(initialActive.clientDeliveryDestinationPath);
      if (initialActive.editedSourcePath) setEditedSourcePath(initialActive.editedSourcePath);
      setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${initialActive.projectName}`);
    } else if (window.clipsApi?.getActiveProject) {
      window.clipsApi.getActiveProject().then(p => {
        if (p) {
          setActiveProject(p);
          saveActiveStudioProject(p);
          setRawSourcePath(p.rawSourcePath);
          setDestinationPath(p.clientDeliveryDestinationPath);
          if (p.editedSourcePath) setEditedSourcePath(p.editedSourcePath);
          setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${p.projectName}`);
        }
      }).catch(() => {});
    }

    const unsubProject = subscribeActiveStudioProject(p => {
      setActiveProject(p);
      setRecentProjects(getRecentStudioProjects());
      if (p) {
        setRawSourcePath(p.rawSourcePath);
        setDestinationPath(p.clientDeliveryDestinationPath);
        if (p.editedSourcePath) setEditedSourcePath(p.editedSourcePath);
        setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${p.projectName}`);
      }
    });

    window.clipsApi.getClipsDeliveryState().then(st => {
      if (st) setState(st);
    });

    window.clipsApi.getLutPresets().then(list => {
      if (list && list.length > 0) {
        setLutPresets(list);
        const sLog3 = list.find(p => p.name.includes('S-Log3') || p.id.includes('s-log3'));
        if (sLog3) {
          setSelectedLutPath(sLog3.path);
        } else {
          setSelectedLutPath(list[0].path);
        }
      }
    });

    const unsubState = window.clipsApi.onClipsDeliveryState(s => setState(s));
    return () => {
      unsubProject();
      unsubState();
    };
  }, []);

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(
          'baawaray_delivery_preferences_v1',
          JSON.stringify({
            deliveryMode,
            applyRawLut,
            quality,
            fullHD,
            fpsCap,
            autoHLG
          })
        );
      }
    } catch {}
  }, [deliveryMode, applyRawLut, quality, fullHD, fpsCap, autoHLG]);

  useEffect(() => {
    if (!rawSourcePath) {
      setFootageStats(null);
      return;
    }
    if (window.clipsApi?.getFootageStats) {
      setIsScanningFootage(true);
      window.clipsApi
        .getFootageStats(rawSourcePath)
        .then(st => {
          if (st) setFootageStats(st);
          setIsScanningFootage(false);
        })
        .catch(() => setIsScanningFootage(false));
    }
  }, [rawSourcePath]);

  const applyFolderSelection = async (dir: string) => {
    // Call IPC or fallback to shared resolver
    let ctx = window.clipsApi?.resolveProjectContext
      ? await window.clipsApi.resolveProjectContext(dir)
      : resolveSmartProjectContext(dir);

    if (ctx && ctx.isSmartProject) {
      // Use smart raw footage path (e.g. 01_RAW_FOOTAGE or 01_RAW_FOOTAGE/<Event>)
      const resolvedRaw = ctx.rawSourcePath || dir;
      setRawSourcePath(resolvedRaw);
      setDestinationPath(ctx.clientDeliveryDestinationPath);
      if (ctx.editedSourcePath) {
        setEditedSourcePath(ctx.editedSourcePath);
      }

      const updatedProject: ActiveStudioProject = {
        projectName: ctx.projectName,
        clientName: ctx.clientName,
        eventName: ctx.eventSubfolder || 'Wedding',
        rootPath: ctx.rootPath,
        rawSourcePath: resolvedRaw,
        rec709DestinationPath: ctx.rec709DestinationPath,
        clientDeliveryDestinationPath: ctx.clientDeliveryDestinationPath,
        editedSourcePath: ctx.editedSourcePath,
        updatedAt: new Date().toISOString()
      };

      saveActiveStudioProject(updatedProject);
      setActiveProject(updatedProject);
      if (window.clipsApi?.setActiveProject) {
        window.clipsApi.setActiveProject(updatedProject).catch(() => {});
      }

      const sub = ctx.eventSubfolder ? `/${ctx.eventSubfolder}` : '';
      setAutoLinkedNote(`✓ Auto-selected: 01_RAW_FOOTAGE${sub ? `/${ctx.eventSubfolder}` : ''} ➔ 05_CLIENT_CLIPS_DELIVERY${sub}`);
    } else {
      setRawSourcePath(dir);
    }
  };

  const handleAutoDetectProject = async () => {
    const defaultSearch = activeProject?.rootPath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) {
      await applyFolderSelection(dir);
    }
  };

  const handleSelectRawSource = async () => {
    const defaultSearch = rawSourcePath || activeProject?.rootPath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) {
      await applyFolderSelection(dir);
    }
  };

  const handleSelectEditedSource = async () => {
    const defaultSearch = editedSourcePath || activeProject?.editedSourcePath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) setEditedSourcePath(dir);
  };

  const handleSelectDestination = async () => {
    const defaultSearch = destinationPath || activeProject?.clientDeliveryDestinationPath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) setDestinationPath(dir);
  };

  const handleStart = async () => {
    if (!destinationPath) return;
    if (deliveryMode !== 'edited_only' && !rawSourcePath) return;
    if (deliveryMode !== 'raw_only' && !editedSourcePath) return;

    const settings: ClipDeliverySettings = {
      rawSourcePath,
      editedSourcePath,
      destinationPath,
      deliveryMode,
      applyRawLut,
      lutPath: selectedLutPath || undefined,
      quality,
      targetSizeGB: useTargetSize ? targetSizeGB : undefined,
      fullHD,
      fpsCap,
      autoHLG,
      autoUploadToDropbox,
      clientName: activeProject?.clientName || dropboxClientName,
      clientPhone: dropboxClientPhone,
      sendWhatsApp: dropboxSendWhatsApp
    };

    await window.clipsApi.startClipsDelivery(settings);
  };

  const handleCancel = async () => {
    await window.clipsApi.cancelClipsDelivery();
  };

  const handlePauseDelivery = async () => {
    await window.clipsApi.pauseDelivery();
  };

  const handleResumeDelivery = async () => {
    await window.clipsApi.resumeDelivery();
  };

  const handlePauseDropboxUpload = async () => {
    await window.clipsApi.pauseDropboxRawClips();
  };

  const handleResumeDropboxUpload = async () => {
    await window.clipsApi.resumeDropboxRawClips();
  };

  const handleAutoDetectTranscodedFolder = async (hint?: string, cName?: string) => {
    setIsDetectingFolder(true);
    try {
      const searchHint = hint || dropboxUploadFolder || destinationPath || activeProject?.rootPath || '';
      const client = cName || dropboxClientName || activeProject?.clientName || '';
      const res = await window.clipsApi.autoDetectTranscodedFolder(searchHint, client);
      setDetectedFolderInfo(res);
      if (res && res.found && res.folderPath) {
        setDropboxUploadFolder(res.folderPath);
      }
    } catch (e) {
      console.warn('Auto-detect folder error:', e);
    } finally {
      setIsDetectingFolder(false);
    }
  };

  const handleOpenDropboxModal = (targetDir?: string) => {
    const client = dropboxClientName || activeProject?.clientName || '';
    if (!dropboxClientName && client) {
      setDropboxClientName(client);
    }
    if (!dropboxClientPhone && client) {
      const match = STUDIO_WEB_APP_CLIENTS.find(
        c => c.name.toLowerCase() === client.toLowerCase()
      );
      if (match?.phone) setDropboxClientPhone(match.phone);
    }
    const folder = targetDir || detectedFolderInfo?.folderPath || defaultRawClipsFolder || destinationPath;
    setDropboxUploadFolder(folder);
    setShowDropboxModal(true);

    // Check Dropbox connection status
    window.clipsApi.testDropboxConnection().then(res => {
      setDropboxConnected(res.ok);
      if (res.ok && res.email) {
        setDropboxConnectedEmail(res.email);
      }
    });

    // Automatically detect transcoded folder upon opening
    void handleAutoDetectTranscodedFolder(folder, client);
  };

  const handleConnectQuickToken = async () => {
    if (!quickToken.trim()) return;
    setIsConnectingToken(true);
    setTokenError(null);
    try {
      const res = await window.clipsApi.configureDropbox({
        refreshToken: quickToken.trim()
      });
      if (res.ok) {
        setDropboxConnected(true);
        setDropboxConnectedEmail(res.email || 'Connected');
        setTokenError(null);
      } else {
        setTokenError(res.error || 'Connection failed. Please check token.');
      }
    } catch (err: any) {
      setTokenError(err?.message || 'Connection failed');
    } finally {
      setIsConnectingToken(false);
    }
  };

  const handleSelectDropboxFolder = async () => {
    const dir = await window.clipsApi.openDirectory(
      dropboxUploadFolder || destinationPath || '/Volumes/40'
    );
    if (dir) setDropboxUploadFolder(dir);
  };

  const handleStartDropboxUpload = async (customFolder?: string) => {
    const folderToUpload = customFolder || dropboxUploadFolder || detectedFolderInfo?.folderPath || defaultRawClipsFolder;
    if (!folderToUpload) return;
    const client = dropboxClientName || activeProject?.clientName || 'Wedding Client';
    const match = STUDIO_WEB_APP_CLIENTS.find(
      c => c.name.toLowerCase() === client.toLowerCase()
    );
    const evName = detectedFolderInfo?.eventName || activeProject?.eventName || match?.events?.[0]?.eventName || 'Wedding';
    const evDate = activeProject?.eventDate || match?.events?.[0]?.date;

    setShowDropboxModal(true);
    setDropboxStatus(prev => ({
      ...prev,
      state: 'scanning',
      logs: [`Preparing Dropbox upload for ${client}…`]
    }));

    try {
      await window.clipsApi.uploadDropboxRawClips({
        clientName: client,
        clientPhone: dropboxClientPhone,
        folderPath: folderToUpload,
        eventName: evName,
        eventDate: evDate,
        deliverableTitle: 'Raw Clips (Rec.709)',
        sendWhatsApp: dropboxSendWhatsApp
      });
    } catch (err: any) {
      setDropboxStatus(prev => ({
        ...prev,
        state: 'error',
        error: err?.message || 'Failed to upload clips to Dropbox'
      }));
    }
  };

  const handleCancelDropboxUpload = async () => {
    await window.clipsApi.cancelDropboxRawClips();
  };

  const handleCopyLink = (url: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(url);
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    }
  };

  // Trigger auto-upload when export finishes if requested
  useEffect(() => {
    if (state.state === 'completed' && autoUploadToDropbox && defaultRawClipsFolder) {
      handleStartDropboxUpload(defaultRawClipsFolder);
    }
  }, [state.state, autoUploadToDropbox, defaultRawClipsFolder]);

  const isRunning = state.state === 'running' || state.state === 'scanning' || state.state === 'paused';

  // Live estimated file size calculation
  const baseBitrateUhd = quality === 'archive' ? 90 : quality === 'balanced' ? 65 : 40;
  const effectiveBitrateMbps = fullHD ? Math.round(baseBitrateUhd * 0.28) : baseBitrateUhd;
  // Size factor based on FPS cap: capping 100fps down to 25/30 reduces redundant inter-frame delta entropy in VBR (~15% - 20% savings)
  const fpsFactor =
    fpsCap === 24 || fpsCap === 25 ? 0.82 : fpsCap === 30 ? 0.85 : fpsCap === 50 || fpsCap === 60 ? 0.92 : 1.0;
  const gbPerHour = (effectiveBitrateMbps * 3600 * fpsFactor) / (8 * 1024);

  const durationSec = footageStats?.durationSeconds || state.totalDuration || 0;
  const totalEstimatedGB =
    durationSec > 0 ? ((effectiveBitrateMbps * durationSec * fpsFactor) / (8 * 1024)).toFixed(1) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0D0C0A]">
      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2D2824]">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#FBFAF7]">
            <Film className="w-5 h-5 text-[#E8A317]" />
            Client Clips Delivery Package (Raw Clips &amp; Edited Videos)
          </h1>
          <p className="text-xs text-[#8C857B] mt-1">
            Studio-standard H.264 High / 8-bit 4:2:0 / Rec.709 / AAC MP4. Raw clips are graded to Rec.709 with Sony S-Log3 LUT; edited films are packaged for client playback.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {activeProject && (
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#2A9D8F] inline-block animate-pulse"></span>
              <span className="text-[#8C857B]">Active:</span>
              <span className="font-bold text-[#2A9D8F] font-mono">{activeProject.projectName}</span>
              <button
                onClick={() => {
                  setRawSourcePath(activeProject.rawSourcePath);
                  setDestinationPath(activeProject.clientDeliveryDestinationPath);
                  setEditedSourcePath(activeProject.editedSourcePath);
                  setAutoLinkedNote(`⚡ Re-synced paths to active project: ${activeProject.projectName}`);
                }}
                className="ml-1 text-[11px] underline text-[#E8A317] hover:text-[#FBFAF7] cursor-pointer"
                title="Click to re-populate source and destination folders from active project"
              >
                Sync
              </button>
            </div>
          )}

          <select
            defaultValue=""
            onChange={async e => {
              const val = e.target.value;
              if (!val) return;
              if (val.startsWith('recent:')) {
                const root = val.replace('recent:', '');
                await applyFolderSelection(root);
              } else if (val.startsWith('client:')) {
                const clientName = val.replace('client:', '');
                const client = STUDIO_WEB_APP_CLIENTS.find(c => c.name === clientName);
                const rootName = computeProjectRootFolderName(clientName, client?.events);
                const candidatePath = `/Volumes/40/${rootName}`;
                await applyFolderSelection(candidatePath);
              }
            }}
            disabled={isRunning}
            className="bg-[#1F1B18] border border-[#3D3630] rounded-lg px-2.5 py-2 text-xs text-[#E8A317] font-semibold focus:outline-none cursor-pointer max-w-[210px]"
          >
            <option value="" disabled>Load Client Project…</option>
            {recentProjects.length > 0 && (
              <optgroup label="Recent Smart Projects">
                {recentProjects.map(rp => (
                  <option key={rp.rootPath} value={`recent:${rp.rootPath}`}>
                    📁 {rp.projectName}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Studio OS Clients">
              {STUDIO_WEB_APP_CLIENTS.map(c => (
                <option key={c.id || c.name} value={`client:${c.name}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          </select>

          <button
            onClick={handleAutoDetectProject}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#FBFAF7] cursor-pointer"
          >
            <Wand2 className="w-4 h-4 text-[#E8A317]" /> Browse Root…
          </button>

          <button
            onClick={() => handleOpenDropboxModal()}
            disabled={isRunning}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#0061FE]/15 hover:bg-[#0061FE]/25 border border-[#0061FE]/40 text-xs font-semibold text-[#60A5FA] cursor-pointer transition-all shadow-sm"
            title="Upload Transcoded Raw Clips to Studio Dropbox & Share Link"
          >
            <Cloud className="w-4 h-4 text-[#60A5FA]" />
            Upload to Dropbox…
          </button>

          {isRunning ? (
            <div className="flex items-center gap-2">
              {state.state === 'paused' ? (
                <button
                  onClick={handleResumeDelivery}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2A9D8F]/20 hover:bg-[#2A9D8F]/30 border border-[#2A9D8F]/50 text-[#2A9D8F] text-xs font-semibold cursor-pointer transition-all"
                  title="Resume encoding"
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  Resume
                </button>
              ) : (
                <button
                  onClick={handlePauseDelivery}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E8A317]/20 hover:bg-[#E8A317]/30 border border-[#E8A317]/50 text-[#E8A317] text-xs font-semibold cursor-pointer transition-all"
                  title="Pause encoding (frees CPU/GPU immediately)"
                >
                  <Pause className="w-3.5 h-3.5" />
                  Pause
                </button>
              )}
              <button
                onClick={handleCancel}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#9B2226] hover:bg-[#B82B30] text-[#FBFAF7] text-xs font-semibold shadow-md transition-all cursor-pointer"
              >
                <XCircle className="w-4 h-4" />
                Cancel Export
              </button>
            </div>
          ) : (
            <button
              onClick={handleStart}
              disabled={!destinationPath || (deliveryMode !== 'edited_only' && !rawSourcePath) || (deliveryMode !== 'raw_only' && !editedSourcePath)}
              className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-lg disabled:opacity-40 cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-[#E8A317]" />
              Start Client Delivery Export
            </button>
          )}
        </div>
      </div>

      {/* Auto-Linked Notification Banner */}
      {autoLinkedNote && (
        <div className="p-3 bg-[#2A9D8F]/10 border border-[#2A9D8F]/40 rounded-xl flex items-center justify-between text-xs text-[#2A9D8F]">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#E8A317] flex-shrink-0" />
            <span className="font-semibold">{autoLinkedNote}</span>
          </div>
          <span className="text-[11px] text-[#8C857B] font-mono">
            Smart Folders Auto-Select Active
          </span>
        </div>
      )}

      {/* Package Delivery Mode Selector */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            id: 'both' as ClipDeliveryMode,
            title: 'Complete Package (Raw Clips + Edited Videos)',
            desc: 'Packages both S-Log3 graded raw rushes and finalized edited cuts in separate folders'
          },
          {
            id: 'raw_only' as ClipDeliveryMode,
            title: 'Raw Clips Only',
            desc: 'Converts and delivers raw camera clips to playable Rec.709 MP4s'
          },
          {
            id: 'edited_only' as ClipDeliveryMode,
            title: 'Edited Videos Only',
            desc: 'Optimizes and delivers final master cuts (Teaser, Highlights, Feature)'
          }
        ].map(m => {
          const active = deliveryMode === m.id;
          return (
            <div
              key={m.id}
              onClick={() => !isRunning && setDeliveryMode(m.id)}
              className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                active
                  ? 'bg-[#9B2226]/15 border-[#E8A317] ring-1 ring-[#E8A317]/50'
                  : 'bg-[#141110] border-[#2D2824] hover:border-[#3D3630]'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#FBFAF7]">{m.title}</span>
                {active && <CheckCircle2 className="w-4 h-4 text-[#E8A317]" />}
              </div>
              <p className="text-[11px] text-[#8C857B] mt-1">{m.desc}</p>
            </div>
          );
        })}
      </div>

      {/* Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Sources & Destination */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Raw Clips Source Folder */}
          {(deliveryMode === 'both' || deliveryMode === 'raw_only') && (
            <div className="panel-card p-4 flex flex-col gap-2 border-l-4 border-l-[#E8A317]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-2">
                  <Video className="w-4 h-4 text-[#E8A317]" />
                  Raw Clips Source Folder (01_RAW_FOOTAGE)
                </label>
                <span className="text-[11px] text-[#E8A317] font-mono">Camera Masters</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={rawSourcePath}
                  placeholder="Select folder containing raw camera footage (e.g. 01_RAW_FOOTAGE)"
                  className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                />
                <button
                  onClick={handleSelectRawSource}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
                >
                  <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                  Browse…
                </button>
              </div>

              {/* Sony S-Log3 LUT Toggle & Selector for Raw Clips */}
              <div className="flex items-center justify-between p-2.5 rounded-lg bg-[#141110] border border-[#2D2824] mt-1">
                <div className="flex items-center gap-2 flex-1 mr-3">
                  <Sparkles className="w-4 h-4 text-[#E8A317] flex-shrink-0" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-[#FBFAF7]">
                        Apply BaseLUTs - Sony S-Log3 to Rec.709
                      </span>
                      {lutPresets.length > 0 && (
                        <select
                          value={selectedLutPath}
                          onChange={e => setSelectedLutPath(e.target.value)}
                          disabled={isRunning || !applyRawLut}
                          className="bg-[#1C1815] border border-[#3D3630] rounded px-2 py-0.5 text-[11px] text-[#E8A317] font-semibold focus:outline-none focus:border-[#E8A317] cursor-pointer"
                        >
                          {lutPresets.map(p => (
                            <option key={p.id} value={p.path}>
                              {p.name}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                    <p className="text-[10px] text-[#8C857B]">
                      Converts flat S-Gamut3.Cine / S-Log3 raw camera footage to vibrant Rec.709 client color
                    </p>
                  </div>
                </div>
                <input
                  type="checkbox"
                  checked={applyRawLut}
                  onChange={e => setApplyRawLut(e.target.checked)}
                  disabled={isRunning}
                  className="w-4 h-4 accent-[#9B2226]"
                />
              </div>
            </div>
          )}

          {/* Edited Videos Source Folder */}
          {(deliveryMode === 'both' || deliveryMode === 'edited_only') && (
            <div className="panel-card p-4 flex flex-col gap-2 border-l-4 border-l-[#2A9D8F]">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-2">
                  <Film className="w-4 h-4 text-[#2A9D8F]" />
                  Edited Videos Source Folder (04_RENDER_DELIVERABLES)
                </label>
                <span className="text-[11px] text-[#2A9D8F] font-mono">Master Cuts</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={editedSourcePath}
                  placeholder="Select folder containing finished edits (Teaser, Highlights, Reels)"
                  className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                />
                <button
                  onClick={handleSelectEditedSource}
                  disabled={isRunning}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
                >
                  <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                  Browse…
                </button>
              </div>
              <p className="text-[10px] text-[#8C857B] pl-1">
                Edited videos keep their original color grade and are packaged directly into the client delivery folder.
              </p>
            </div>
          )}

          {/* Destination Folder Picker */}
          <div className="panel-card p-4 flex flex-col gap-2 border-l-4 border-l-[#9B2226]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#FBFAF7]">
                Client Delivery Destination (External SSD / USB / Client Folder)
              </label>
              {destinationPath && (destinationPath.includes('05_CLIENT_CLIPS_DELIVERY') || destinationPath.includes('03_CLIENT_CLIPS_DELIVERY')) && (
                <span className="text-[11px] text-[#2A9D8F] flex items-center gap-1 font-mono font-medium">
                  <CheckCircle2 className="w-3.5 h-3.5 text-[#2A9D8F]" />
                  Auto-linked from Smart Folder
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={destinationPath}
                placeholder="Select output folder (e.g. 05_CLIENT_CLIPS_DELIVERY or Client USB Drive)"
                className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
              <button
                onClick={handleSelectDestination}
                disabled={isRunning}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
              >
                <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                Browse…
              </button>
            </div>

            {/* Structure Summary */}
            <div className="p-2.5 rounded-lg bg-[#0D0C0A] border border-[#24201C] text-[11px] font-mono text-[#8C857B] flex flex-col gap-0.5 mt-1">
              <span className="text-[#E8A317]">Package Layout Created in Destination:</span>
              {(deliveryMode === 'both' || deliveryMode === 'raw_only') && (
                <span>
                  📁 {previewLayoutPath}/Raw Clips/ (
                  {applyRawLut
                    ? `${lutPresets.find(p => p.path === selectedLutPath)?.name || 'BaseLUTs - Sony S-Log3'} Converted`
                    : 'Original Log Preserved'}
                  )
                </span>
              )}
              {(deliveryMode === 'both' || deliveryMode === 'edited_only') && (
                <span>📁 {previewLayoutPath}/Edited Videos/ (Finished Master Cuts)</span>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Bitrate & Delivery Rules */}
        <div className="flex flex-col gap-5">
          <div className="panel-card p-4 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
              Delivery Settings
            </h3>

            {/* Quality Presets */}
            <div className="flex flex-col gap-2">
              <label className="text-xs text-[#8C857B]">Quality &amp; Bitrate</label>
              <div className="grid grid-cols-3 gap-2">
                {(['archive', 'balanced', 'compact'] as const).map(q => {
                  const selected = quality === q && !useTargetSize;
                  return (
                    <div
                      key={q}
                      onClick={() => {
                        if (!isRunning) {
                          setQuality(q);
                          setUseTargetSize(false);
                        }
                      }}
                      className={`p-2.5 rounded-lg border text-center cursor-pointer transition-all ${
                        selected
                          ? 'bg-[#9B2226]/15 border-[#E8A317] ring-1 ring-[#E8A317]/50'
                          : 'bg-[#141110] border-[#2D2824]'
                      }`}
                    >
                      <span className="text-xs font-bold text-[#FBFAF7] capitalize block">{q}</span>
                      <span className="text-[10px] text-[#8C857B] font-mono">
                        {q === 'archive' ? '90 Mbps' : q === 'balanced' ? '65 Mbps' : '40 Mbps'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* HLG Tonemapping */}
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[#141110] border border-[#2D2824]">
              <div>
                <span className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-1.5">
                  <Tv className="w-3.5 h-3.5 text-[#E8A317]" />
                  Auto-Tonemap HLG
                </span>
                <p className="text-[10px] text-[#8C857B] mt-0.5">
                  Tonemaps ARIB-STD-B67 HDR clips with zscale to Rec.709 so they never look washed out.
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoHLG}
                onChange={e => setAutoHLG(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 accent-[#9B2226] shrink-0 mt-0.5"
              />
            </div>

            {/* Force Full HD */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#141110] border border-[#2D2824]">
              <div>
                <span className="text-xs font-semibold text-[#FBFAF7]">Deliver as 1080p Full HD</span>
                <p className="text-[10px] text-[#8C857B]">Scale 4K down for lighter client storage</p>
              </div>
              <input
                type="checkbox"
                checked={fullHD}
                onChange={e => setFullHD(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 accent-[#9B2226]"
              />
            </div>

            {/* Auto-Upload to Dropbox */}
            <div className="flex items-start justify-between gap-3 p-3 rounded-lg bg-[#141110] border border-[#2D2824]">
              <div>
                <span className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-1.5">
                  <Cloud className="w-3.5 h-3.5 text-[#60A5FA]" />
                  Auto-Upload to Dropbox
                </span>
                <p className="text-[10px] text-[#8C857B] mt-0.5">
                  Upload transcoded raw clips to Dropbox &amp; create client review link when export finishes
                </p>
              </div>
              <input
                type="checkbox"
                checked={autoUploadToDropbox}
                onChange={e => setAutoUploadToDropbox(e.target.checked)}
                disabled={isRunning}
                className="w-4 h-4 accent-[#0061FE] shrink-0 mt-0.5"
              />
            </div>

            {/* FPS Capping */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#2D2824]">
              <label className="text-xs text-[#8C857B]">High-FPS Capping / Frame Rate</label>
              <select
                value={fpsCap}
                onChange={e =>
                  setFpsCap(e.target.value === 'original' ? 'original' : (Number(e.target.value) as FpsCapChoice))
                }
                disabled={isRunning}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none focus:border-[#E8A317] cursor-pointer"
              >
                <option value="original">Original FPS (Keep high frame rate slow-mo)</option>
                <option value="100">Cap at 100 FPS (PAL 100p High Frame Rate)</option>
                <option value="60">Cap at 60 FPS (NTSC 60p Smooth)</option>
                <option value="50">Cap at 50 FPS (PAL 50p 2x Slow-mo)</option>
                <option value="30">Cap at 30 FPS (NTSC 30p Standard)</option>
                <option value="25">Cap at 25 FPS (PAL 25p Studio Standard)</option>
                <option value="24">Cap at 24 FPS (Cinematic 24p)</option>
              </select>
            </div>

            {/* Estimated Output Size & FPS Impact Card */}
            <div className="p-3.5 rounded-xl bg-[#141110] border border-[#2D2824] flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-[#E8A317]" />
                  Estimated Output Size
                </span>
                <span className="text-xs font-bold font-mono text-[#E8A317]">
                  {isScanningFootage ? (
                    <span className="text-[11px] text-[#8C857B] animate-pulse">Calculating size…</span>
                  ) : totalEstimatedGB ? (
                    `~${totalEstimatedGB} GB Total`
                  ) : (
                    `~${gbPerHour.toFixed(1)} GB / hr`
                  )}
                </span>
              </div>

              {footageStats && footageStats.fileCount > 0 && (
                <div className="flex items-center justify-between px-2.5 py-1.5 rounded bg-[#090807] border border-[#24201C] text-[11px] font-mono">
                  <span className="text-[#8C857B]">Folder Clips:</span>
                  <span className="text-[#2A9D8F] font-bold">
                    {footageStats.fileCount} clips · {Math.floor(footageStats.durationSeconds / 3600)}h{' '}
                    {Math.floor((footageStats.durationSeconds % 3600) / 60)}m ({(footageStats.totalBytes / (1024 ** 3)).toFixed(1)} GB Raw)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1.5 border-t border-[#24201C]">
                <div>
                  <span className="block text-[#6B655C]">Data Rate:</span>
                  <span className="text-[#FBFAF7]">{effectiveBitrateMbps} Mbps ({fullHD ? '1080p HD' : '4K UHD'})</span>
                </div>
                <div>
                  <span className="block text-[#6B655C]">FPS Impact:</span>
                  <span className={fpsCap !== 'original' ? 'text-[#2A9D8F]' : 'text-[#8C857B]'}>
                    {fpsCap !== 'original' ? `${fpsCap} FPS (~${Math.round((1 - fpsFactor) * 100)}% lighter)` : 'Original (Native)'}
                  </span>
                </div>
              </div>

              <p className="text-[10px] text-[#8C857B] leading-relaxed mt-0.5">
                {footageStats && totalEstimatedGB ? (
                  <span className="text-[#2A9D8F]">
                    ✓ Output will be ~{((1 - (parseFloat(totalEstimatedGB) / (footageStats.totalBytes / (1024 ** 3)))) * 100).toFixed(0)}% smaller than camera raw ({((footageStats.totalBytes / (1024 ** 3)) - parseFloat(totalEstimatedGB)).toFixed(1)} GB saved).
                  </span>
                ) : (
                  <span>🎯 25 FPS gives 4x more bits per frame for razor-sharp imagery &amp; avoids TV/phone player stutter.</span>
                )}
              </p>
            </div>

            {/* Resumable Run Notice */}
            <div className="p-3 rounded-lg bg-[#1F1B18] border border-[#3D3630] text-[11px] text-[#8C857B] flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-[#2A9D8F] shrink-0" />
              <span>Resumable: writes <code className="text-[#FBFAF7]">_logs/done.txt</code> so stopped batches resume instantly.</span>
            </div>
          </div>
        </div>
      </div>

      {/* Completed Delivery & Dropbox Upload Banner */}
      {state.state === 'completed' && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#0061FE]/15 via-[#1A1814] to-[#2A9D8F]/15 border border-[#0061FE]/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#0061FE]/20 text-[#60A5FA] shrink-0">
              <UploadCloud className="w-6 h-6" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#FBFAF7] flex items-center gap-2">
                Share Transcoded Raw Clips with Client via Dropbox
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2A9D8F]/20 text-[#2A9D8F] font-mono">
                  Export Complete
                </span>
              </h4>
              <p className="text-xs text-[#8C857B] mt-0.5">
                {state.rawClipsDone > 0 ? `${state.rawClipsDone} raw clips converted to Rec.709` : 'Delivered files ready'} in{' '}
                <code className="text-[#FBFAF7] font-mono">{defaultRawClipsFolder || previewLayoutPath}</code>. Upload directly to Dropbox to get a shareable client link.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={() => handleOpenDropboxModal()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0061FE] hover:bg-[#0052D4] text-[#FBFAF7] text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              <Cloud className="w-4 h-4 fill-current" />
              Upload to Dropbox &amp; Share
            </button>
          </div>
        </div>
      )}

      {/* Progress & Log Card */}
      {(state.state !== 'idle' || state.logs.length > 0) && (
        <div className="panel-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-[#E8A317]" />
              <span className="text-xs font-bold text-[#FBFAF7]">
                {state.state === 'running' ? 'Exporting Client Clips Delivery Package…' : 'Delivery Package Status'}
              </span>
              {state.currentType && (
                <span
                  className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                    state.currentType === 'raw'
                      ? 'bg-[#E8A317]/15 text-[#E8A317] border border-[#E8A317]/30'
                      : 'bg-[#2A9D8F]/15 text-[#2A9D8F] border border-[#2A9D8F]/30'
                  }`}
                >
                  {state.currentType === 'raw' ? 'Raw Clip' : 'Edited Video'}
                </span>
              )}
              {state.currentFile && (
                <span className="text-xs font-mono text-[#8C857B] truncate max-w-sm">
                  ({state.completedCount}/{state.totalCount}: {state.currentFile})
                </span>
              )}
            </div>

            <div className="flex items-center gap-3 text-xs font-mono">
              <span className="text-[#8C857B]">
                Raw: {state.rawClipsDone}/{state.rawClipsCount} | Edited: {state.editedVideosDone}/{state.editedVideosCount}
              </span>
              <span className="font-bold text-[#E8A317]">{state.percent}%</span>
            </div>
          </div>

          <div className="w-full h-2 rounded-full bg-[#141110] overflow-hidden border border-[#2D2824]">
            <div
              className="h-full bg-gradient-to-r from-[#9B2226] via-[#E8A317] to-[#2A9D8F] transition-all duration-300"
              style={{ width: `${state.percent}%` }}
            />
          </div>

          <div className="mt-2 bg-[#090807] border border-[#24201C] rounded-lg p-2.5 h-28 overflow-y-auto font-mono text-[11px] text-[#A8A29E] flex flex-col gap-0.5">
            {state.logs.map((log, idx) => (
              <div
                key={idx}
                className={
                  log.startsWith('✓')
                    ? 'text-[#2A9D8F]'
                    : log.startsWith('⚠')
                      ? 'text-[#E8A317]'
                      : 'text-[#8C857B]'
                }
              >
                {log}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dropbox Raw Clips Upload Modal */}
      {showDropboxModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#141110] border border-[#2D2824] rounded-2xl w-full max-w-2xl p-6 flex flex-col gap-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-[#0061FE]/20 text-[#60A5FA]">
                  <Cloud className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#FBFAF7] font-serif">
                    Upload Transcoded Raw Clips to Dropbox
                  </h3>
                  <p className="text-xs text-[#8C857B]">
                    Creates a private shared folder on Studio Dropbox for client viewing &amp; download
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowDropboxModal(false);
                }}
                className="text-[#8C857B] hover:text-[#FBFAF7] p-1 cursor-pointer"
                title="Close dialog (transfers continue in background)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Dropbox Connection Status Card */}
            {dropboxConnected ? (
              <div className="p-3 bg-[#2A9D8F]/10 border border-[#2A9D8F]/40 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#2A9D8F] flex-shrink-0" />
                  <div>
                    <span className="text-xs font-semibold text-[#2A9D8F]">
                      Connected to Studio Dropbox
                    </span>
                    <p className="text-[10px] text-[#8C857B] font-mono">
                      {dropboxConnectedEmail || 'Authenticated Account'}
                    </p>
                  </div>
                </div>
                {onOpenSettings && (
                  <button
                    type="button"
                    onClick={onOpenSettings}
                    className="text-[11px] text-[#8C857B] hover:text-[#FBFAF7] underline cursor-pointer"
                  >
                    Settings ⚙
                  </button>
                )}
              </div>
            ) : (
              <div className="p-3.5 bg-[#E8A317]/10 border border-[#E8A317]/40 rounded-xl flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-[#E8A317] flex-shrink-0" />
                    <span className="text-xs font-bold text-[#E8A317]">
                      Studio Dropbox Not Connected
                    </span>
                  </div>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={onOpenSettings}
                      className="text-[11px] text-[#E8A317] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      Open Settings ⚙
                    </button>
                  )}
                </div>
                <p className="text-[11px] text-[#A8A29E] leading-relaxed">
                  Paste your Dropbox Refresh Token below for chunked cloud uploads and generating verified public review links:
                </p>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={quickToken}
                    onChange={e => setQuickToken(e.target.value)}
                    placeholder="Paste Dropbox Refresh Token here…"
                    disabled={isConnectingToken}
                    className="flex-1 bg-[#1A1814] border border-[#3D3630] rounded-lg px-3 py-1.5 text-xs text-[#FBFAF7] font-mono focus:outline-none focus:border-[#0061FE]"
                  />
                  <button
                    type="button"
                    onClick={handleConnectQuickToken}
                    disabled={isConnectingToken || !quickToken.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-[#0061FE] hover:bg-[#0052D4] text-white text-xs font-semibold disabled:opacity-40 cursor-pointer transition-all flex items-center gap-1.5 shrink-0"
                  >
                    {isConnectingToken ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Verifying…</span>
                      </>
                    ) : (
                      'Connect & Verify'
                    )}
                  </button>
                </div>
                {tokenError && (
                  <div className="p-3 rounded-lg bg-[#141110] border border-[#E63946]/40 flex flex-col gap-2">
                    <div className="text-xs font-semibold text-[#E63946] flex items-center gap-1.5 font-mono">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{tokenError}</span>
                    </div>
                    <div className="p-2.5 rounded bg-[#1F1B18] border border-[#E8A317]/40 text-xs text-[#E8A317] flex flex-col gap-1.5 font-sans">
                      <span className="font-bold flex items-center gap-1">
                        💡 How to enable write permission (takes 1 minute):
                      </span>
                      <ol className="list-decimal list-inside text-[11px] text-[#FBFAF7] space-y-1 font-mono">
                        <li>In your browser (just opened), click your app: <b>App ID: 8421331</b></li>
                        <li>Click the <b>Permissions</b> tab</li>
                        <li>Check the boxes for:
                          <ul className="list-disc list-inside pl-4 text-[#2A9D8F] font-bold">
                            <li>files.content.write</li>
                            <li>files.metadata.write</li>
                            <li>sharing.write</li>
                          </ul>
                        </li>
                        <li>Scroll down and click the blue <b>Submit</b> button</li>
                        <li>Click the <b>Settings</b> tab &gt; click <b>Generate</b> under "Generated access token"</li>
                        <li>Paste that fresh token in the box above and click <b>Connect &amp; Verify</b></li>
                      </ol>
                      <button
                        type="button"
                        onClick={() => window.open('https://www.dropbox.com/developers/apps', '_blank')}
                        className="mt-1 self-start px-3 py-1.5 rounded-lg bg-[#0061FE] hover:bg-[#0052D4] text-white text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Dropbox App Console in Browser ↗
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Folder Selection */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-1.5">
                  <FolderOpen className="w-3.5 h-3.5 text-[#E8A317]" />
                  Transcoded Clips Folder (Source on Local SSD)
                </label>
                {detectedFolderInfo?.found && (
                  <span className="text-[11px] text-[#2A9D8F] flex items-center gap-1 font-mono font-bold">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#2A9D8F]" />
                    Auto-Detected ({detectedFolderInfo.clipCount} clips · {detectedFolderInfo.dataGb} GB)
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  readOnly
                  value={dropboxUploadFolder}
                  placeholder="Select folder containing transcoded clips (e.g. 05_CLIENT_CLIPS_DELIVERY/Raw Clips)"
                  className="flex-1 bg-[#1A1814] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => handleAutoDetectTranscodedFolder()}
                  disabled={dropboxStatus.state === 'uploading' || isDetectingFolder}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2A9D8F]/20 hover:bg-[#2A9D8F]/30 border border-[#2A9D8F]/50 text-xs font-semibold text-[#2A9D8F] cursor-pointer transition-all shrink-0"
                  title="Automatically scan and detect the transcoded raw clips folder"
                >
                  <Zap className={`w-3.5 h-3.5 text-[#E8A317] ${isDetectingFolder ? 'animate-spin' : ''}`} />
                  {isDetectingFolder ? 'Detecting…' : 'Auto-Detect ⚡'}
                </button>
                <button
                  type="button"
                  onClick={handleSelectDropboxFolder}
                  disabled={dropboxStatus.state === 'uploading'}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7] cursor-pointer shrink-0"
                  title="Manually browse and pick any folder"
                >
                  <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                  Browse…
                </button>
              </div>
              {detectedFolderInfo?.found && detectedFolderInfo.label && (
                <div className="text-[11px] text-[#2A9D8F] bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 rounded-lg px-2.5 py-1.5 flex items-center justify-between font-mono">
                  <span>⚡ Located: <strong className="text-[#FBFAF7]">{detectedFolderInfo.label}</strong></span>
                  <span className="text-[10px] text-[#8C857B]">Auto-detected</span>
                </div>
              )}
            </div>

            {/* Client Info Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex flex-col gap-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs text-[#8C857B]">Client Name</label>
                  <select
                    defaultValue=""
                    onChange={e => {
                      const cName = e.target.value;
                      if (!cName) return;
                      setDropboxClientName(cName);
                      const match = STUDIO_WEB_APP_CLIENTS.find(c => c.name === cName);
                      if (match?.phone) setDropboxClientPhone(match.phone);
                      void handleAutoDetectTranscodedFolder(undefined, cName);
                    }}
                    disabled={dropboxStatus.state === 'uploading'}
                    className="bg-transparent text-[10px] text-[#E8A317] hover:underline cursor-pointer focus:outline-none"
                  >
                    <option value="" disabled>Switch Client…</option>
                    {STUDIO_WEB_APP_CLIENTS.map(c => (
                      <option key={c.id || c.name} value={c.name} className="bg-[#141110] text-[#FBFAF7]">
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="text"
                  value={dropboxClientName}
                  onChange={e => {
                    setDropboxClientName(e.target.value);
                    void handleAutoDetectTranscodedFolder(undefined, e.target.value);
                  }}
                  placeholder="e.g. Dhanur & Jhanvi"
                  disabled={dropboxStatus.state === 'uploading'}
                  className="bg-[#1A1814] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none focus:border-[#0061FE]"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-xs text-[#8C857B] flex items-center gap-1">
                  <Phone className="w-3 h-3 text-[#2A9D8F]" />
                  Client Phone (for WhatsApp link delivery)
                </label>
                <input
                  type="text"
                  value={dropboxClientPhone}
                  onChange={e => setDropboxClientPhone(e.target.value)}
                  placeholder="+91..."
                  disabled={dropboxStatus.state === 'uploading'}
                  className="bg-[#1A1814] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none focus:border-[#0061FE]"
                />
              </div>
            </div>

            {/* Target Path in Dropbox preview */}
            <div className="p-3 rounded-lg bg-[#0D0C0A] border border-[#24201C] text-xs font-mono text-[#8C857B] flex items-center justify-between gap-2">
              <span className="text-[#60A5FA] shrink-0">Dropbox Destination:</span>
              <span className="text-[#FBFAF7] font-semibold text-right break-all">
                {dropboxDestinationPreview}
              </span>
            </div>

            {/* WhatsApp notification toggle */}
            <div className="flex items-center justify-between p-3 rounded-lg bg-[#1A1814] border border-[#2D2824]">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-4 h-4 text-[#2A9D8F]" />
                <div>
                  <span className="text-xs font-semibold text-[#FBFAF7]">
                    Dispatch WhatsApp Delivery Notice
                  </span>
                  <p className="text-[10px] text-[#8C857B]">
                    Sends customized WhatsApp message with shareable Dropbox link to client phone
                  </p>
                </div>
              </div>
              <input
                type="checkbox"
                checked={dropboxSendWhatsApp}
                onChange={e => setDropboxSendWhatsApp(e.target.checked)}
                disabled={dropboxStatus.state === 'uploading' || !dropboxClientPhone}
                className="w-4 h-4 accent-[#2A9D8F]"
              />
            </div>

            {/* Upload Progress Display */}
            {dropboxStatus.state !== 'idle' && (
              <div className="p-4 rounded-xl bg-[#0D0C0A] border border-[#2D2824] flex flex-col gap-3">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-[#FBFAF7] font-bold flex items-center gap-2">
                    {dropboxStatus.state === 'uploading' && (
                      <span className="w-2 h-2 rounded-full bg-[#0061FE] animate-pulse"></span>
                    )}
                    {dropboxStatus.state === 'paused' && (
                      <span className="w-2 h-2 rounded-full bg-[#E8A317]"></span>
                    )}
                    {dropboxStatus.state === 'uploading'
                      ? `Uploading Clips (${dropboxStatus.currentFileIndex}/${dropboxStatus.totalFiles})`
                      : dropboxStatus.state === 'paused'
                        ? `Upload Paused (${dropboxStatus.currentFileIndex}/${dropboxStatus.totalFiles})`
                        : dropboxStatus.state === 'generating_link'
                          ? 'Generating Public Shared Link…'
                          : dropboxStatus.state === 'sending_whatsapp'
                            ? 'Sending WhatsApp Notification…'
                            : dropboxStatus.state === 'completed'
                              ? 'Upload Completed!'
                              : dropboxStatus.state === 'error'
                                ? 'Upload Error'
                                : 'Preparing Upload…'}
                  </span>
                  <span className="text-[#60A5FA] font-bold">{dropboxStatus.overallPercent}%</span>
                </div>

                {dropboxStatus.currentFileName && (
                  <div className="text-[11px] font-mono text-[#8C857B] truncate">
                    Current: {dropboxStatus.currentFileName} ({dropboxStatus.currentFilePercent}%)
                  </div>
                )}

                {/* Progress bar */}
                <div className="w-full h-2 rounded-full bg-[#1A1814] overflow-hidden border border-[#2D2824]">
                  <div
                    className={`h-full transition-all duration-300 ${
                      dropboxStatus.state === 'paused'
                        ? 'bg-[#E8A317]'
                        : 'bg-gradient-to-r from-[#0061FE] via-[#E8A317] to-[#2A9D8F]'
                    }`}
                    style={{ width: `${dropboxStatus.overallPercent}%` }}
                  />
                </div>

                {/* Upload terminal logs */}
                <div className="bg-[#050505] border border-[#24201C] rounded-lg p-2.5 h-28 overflow-y-auto font-mono text-[11px] text-[#A8A29E] flex flex-col gap-0.5">
                  {dropboxStatus.logs.map((log, idx) => (
                    <div
                      key={idx}
                      className={
                        log.startsWith('✓') || log.startsWith('🎉')
                          ? 'text-[#2A9D8F]'
                          : log.startsWith('⚠') || log.includes('error')
                            ? 'text-[#E63946]'
                            : log.startsWith('⏸')
                              ? 'text-[#E8A317]'
                              : 'text-[#8C857B]'
                      }
                    >
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Diagnostics and Guidance Card */}
            {dropboxStatus.state === 'error' && (
              <div className="p-4 rounded-xl bg-[#E63946]/10 border border-[#E63946]/40 flex flex-col gap-2.5">
                <div className="flex items-center gap-2 text-xs font-bold text-[#E63946]">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>Dropbox Upload Encountered an Error</span>
                </div>
                <div className="font-mono text-xs text-[#FBFAF7] bg-[#141110] p-2.5 rounded-lg border border-[#2D2824]">
                  {dropboxStatus.error || 'Failed with code 400'}
                </div>
                {(dropboxStatus.error?.includes('scope') ||
                  dropboxStatus.error?.includes('files.content.write') ||
                  dropboxStatus.error?.includes('400') ||
                  (dropboxStatus.missingScopes && dropboxStatus.missingScopes.length > 0)) && (
                  <div className="p-3 rounded-lg bg-[#E8A317]/10 border border-[#E8A317]/30 text-xs flex flex-col gap-2">
                    <span className="font-bold text-[#E8A317] flex items-center gap-1.5">
                      💡 Exact Fix: Enable Missing Permissions on Dropbox App
                    </span>
                    <p className="text-[11px] text-[#A8A29E] leading-relaxed">
                      Dropbox returned a 400 error because your App token lacks <b>write permissions</b>. Follow these quick steps to fix it:
                    </p>
                    <ol className="list-decimal list-inside text-[11px] text-[#FBFAF7] space-y-1 font-mono">
                      <li>Go to Dropbox App Console: <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" className="text-[#60A5FA] underline">dropbox.com/developers/apps</a></li>
                      <li>Click your App &gt; Select the <b>Permissions</b> tab</li>
                      <li>Check <b>files.content.write</b>, <b>files.metadata.write</b>, and <b>sharing.write</b></li>
                      <li>Click the blue <b>Submit</b> button at the bottom</li>
                      <li>Go to <b>Settings</b> tab &gt; click <b>Generate</b> under "Generated access token"</li>
                      <li>Paste the fresh token in Settings ⚙ and save</li>
                    </ol>
                    <div className="flex items-center gap-2 pt-1">
                      {onOpenSettings && (
                        <button
                          type="button"
                          onClick={onOpenSettings}
                          className="px-3 py-1.5 rounded-lg bg-[#E8A317] hover:bg-[#D49315] text-[#141110] text-xs font-bold cursor-pointer transition-all"
                        >
                          Open Settings ⚙
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => window.open('https://www.dropbox.com/developers/apps', '_blank')}
                        className="px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs text-[#60A5FA] font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <ExternalLink className="w-3.5 h-3.5" /> Open Dropbox App Console
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Success Share Link Card */}
            {dropboxStatus.state === 'completed' && dropboxStatus.shareUrl && (
              <div className="p-4 rounded-xl bg-[#2A9D8F]/10 border border-[#2A9D8F]/40 flex flex-col gap-3">
                <div className="flex items-center gap-2 text-xs font-bold text-[#2A9D8F]">
                  <CheckCircle2 className="w-4 h-4 text-[#2A9D8F]" />
                  <span>Transcoded Raw Clips Uploaded Successfully!</span>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={dropboxStatus.shareUrl}
                    className="flex-1 bg-[#090807] border border-[#24201C] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
                  />
                  <button
                    onClick={() => handleCopyLink(dropboxStatus.shareUrl!)}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#2A9D8F] hover:bg-[#248277] text-white text-xs font-semibold cursor-pointer transition-all"
                  >
                    {copiedLink ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copiedLink ? 'Copied!' : 'Copy'}
                  </button>
                  <button
                    onClick={() => window.open(dropboxStatus.shareUrl, '_blank')}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#FBFAF7] cursor-pointer"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Open
                  </button>
                </div>

                {dropboxStatus.whatsappSent && (
                  <p className="text-[11px] text-[#2A9D8F] flex items-center gap-1 font-mono">
                    ✓ WhatsApp link delivered directly to {dropboxClientPhone}.
                  </p>
                )}
              </div>
            )}

            {/* Modal Actions */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-[#2D2824]">
              {dropboxStatus.state === 'uploading' || dropboxStatus.state === 'paused' ? (
                <>
                  <div className="flex items-center gap-2">
                    {dropboxStatus.state === 'paused' ? (
                      <button
                        onClick={handleResumeDropboxUpload}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#2A9D8F]/20 hover:bg-[#2A9D8F]/30 border border-[#2A9D8F]/50 text-[#2A9D8F] text-xs font-semibold cursor-pointer transition-all"
                        title="Resume Dropbox upload"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Resume
                      </button>
                    ) : (
                      <button
                        onClick={handlePauseDropboxUpload}
                        className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#E8A317]/20 hover:bg-[#E8A317]/30 border border-[#E8A317]/50 text-[#E8A317] text-xs font-semibold cursor-pointer transition-all"
                        title="Pause Dropbox upload"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    )}
                    <button
                      onClick={handleCancelDropboxUpload}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#9B2226]/20 hover:bg-[#9B2226]/30 border border-[#9B2226]/50 text-[#FBFAF7] text-xs font-semibold cursor-pointer transition-all"
                      title="Cancel upload"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      Cancel
                    </button>
                  </div>

                  <button
                    onClick={() => setShowDropboxModal(false)}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#60A5FA] cursor-pointer transition-all shadow-sm"
                    title="Close this popup. Upload will continue safely in background."
                  >
                    <Layers className="w-3.5 h-3.5" />
                    Run in Background ↗
                  </button>
                </>
              ) : dropboxStatus.state === 'completed' ? (
                <div className="flex justify-end w-full">
                  <button
                    onClick={() => setShowDropboxModal(false)}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2A9D8F] hover:bg-[#248277] text-white text-xs font-semibold shadow-md transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    Done
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between w-full">
                  <button
                    onClick={() => setShowDropboxModal(false)}
                    className="px-4 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] text-xs font-medium text-[#8C857B] cursor-pointer"
                  >
                    Close
                  </button>
                  <div className="flex items-center gap-2">
                    {dropboxStatus.state === 'error' && (
                      <button
                        onClick={() => handleStartDropboxUpload()}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#60A5FA] cursor-pointer transition-all"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                        Retry Upload
                      </button>
                    )}
                    <button
                      onClick={() => handleStartDropboxUpload()}
                      disabled={!dropboxUploadFolder || !dropboxConnected}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#0061FE] hover:bg-[#0052D4] text-white text-xs font-semibold shadow-lg disabled:opacity-40 cursor-pointer transition-all"
                      title={!dropboxConnected ? 'Please connect Dropbox with a valid refresh token first' : undefined}
                    >
                      <Cloud className="w-4 h-4 fill-current" />
                      {!dropboxConnected ? 'Connect Dropbox to Upload' : 'Start Dropbox Upload'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
