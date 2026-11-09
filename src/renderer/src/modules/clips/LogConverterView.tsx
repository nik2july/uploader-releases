import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  FolderOpen,
  Play,
  XCircle,
  FileVideo,
  CheckCircle2,
  Clock,
  Gauge,
  Zap,
  RefreshCw,
  HardDrive
} from 'lucide-react';
import type {
  ActiveStudioProject,
  ConversionProgress,
  FootageFolderStats,
  FpsCapChoice,
  LutConversionOptions,
  LutPreset,
  VideoCodecChoice,
  VideoQualityPreset
} from '../types/contracts';
import {
  getActiveStudioProject,
  saveActiveStudioProject,
  resolveSmartProjectContext,
  subscribeActiveStudioProject
} from '@shared/smartPathResolver';

export const LogConverterView: React.FC = () => {
  const [sourcePath, setSourcePath] = useState('');
  const [destinationPath, setDestinationPath] = useState('');
  const [presets, setPresets] = useState<LutPreset[]>([]);
  const [selectedLutPath, setSelectedLutPath] = useState('');
  const [customLutPath, setCustomLutPath] = useState('');
  const [quality, setQuality] = useState<VideoQualityPreset>('balanced');
  const [codec, setCodec] = useState<VideoCodecChoice>('h264_videotoolbox');
  const [fullHD, setFullHD] = useState(false);
  const [skipExisting, setSkipExisting] = useState(true);
  const [fpsCap, setFpsCap] = useState<FpsCapChoice>('original');

  const [activeProject, setActiveProject] = useState<ActiveStudioProject | null>(() => getActiveStudioProject());
  const [autoLinkedNote, setAutoLinkedNote] = useState<string>('');
  const [footageStats, setFootageStats] = useState<FootageFolderStats | null>(null);
  const [isScanningFootage, setIsScanningFootage] = useState(false);

  const [progress, setProgress] = useState<ConversionProgress>({
    state: 'idle',
    totalClips: 0,
    currentClipIndex: 0,
    currentClipName: '',
    percent: 0,
    fps: 0,
    speed: '0x',
    elapsedSeconds: 0,
    remainingSeconds: 0,
    logs: []
  });

  useEffect(() => {
    // 1. Initial check for active project created by Smart Folders
    const initialActive = getActiveStudioProject();
    if (initialActive) {
      setActiveProject(initialActive);
      setSourcePath(initialActive.rawSourcePath);
      setDestinationPath(initialActive.rec709DestinationPath);
      setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${initialActive.projectName}`);
    } else if (window.clipsApi?.getActiveProject) {
      window.clipsApi.getActiveProject().then(p => {
        if (p) {
          setActiveProject(p);
          saveActiveStudioProject(p);
          setSourcePath(p.rawSourcePath);
          setDestinationPath(p.rec709DestinationPath);
          setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${p.projectName}`);
        }
      }).catch(() => {});
    }

    const unsubProject = subscribeActiveStudioProject(p => {
      setActiveProject(p);
      if (p) {
        setSourcePath(p.rawSourcePath);
        setDestinationPath(p.rec709DestinationPath);
        setAutoLinkedNote(`⚡ Auto-linked from Smart Folder: ${p.projectName}`);
      }
    });

    // Load available LUTs
    window.clipsApi.getLutPresets().then(list => {
      setPresets(list);
      if (list.length > 0) {
        setSelectedLutPath(list[0].path);
      }
    });

    const unsubscribe = window.clipsApi.onLutProgress(p => {
      setProgress(p);
    });

    return () => {
      unsubProject();
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!sourcePath) {
      setFootageStats(null);
      return;
    }
    if (window.clipsApi?.getFootageStats) {
      setIsScanningFootage(true);
      window.clipsApi
        .getFootageStats(sourcePath)
        .then(st => {
          if (st) setFootageStats(st);
          setIsScanningFootage(false);
        })
        .catch(() => setIsScanningFootage(false));
    }
  }, [sourcePath]);

  const applySourceFolder = async (dir: string) => {
    setSourcePath(dir);

    let ctx = window.clipsApi?.resolveProjectContext
      ? await window.clipsApi.resolveProjectContext(dir)
      : resolveSmartProjectContext(dir);

    if (ctx && ctx.isSmartProject) {
      setDestinationPath(ctx.rec709DestinationPath);

      const updatedProject: ActiveStudioProject = {
        projectName: ctx.projectName,
        clientName: ctx.clientName,
        eventName: ctx.eventSubfolder || 'Wedding',
        rootPath: ctx.rootPath,
        rawSourcePath: dir,
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
      setAutoLinkedNote(`✓ Auto-selected destination: 02_REC709_CONVERTED_CLIPS${sub}`);
    } else {
      if (!destinationPath) {
        setDestinationPath(`${dir}_Rec709_LUT`);
      }
    }
  };

  const handleSelectSource = async () => {
    const defaultSearch = sourcePath || activeProject?.rootPath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) {
      await applySourceFolder(dir);
    }
  };

  const handleSelectDestination = async () => {
    const defaultSearch = destinationPath || activeProject?.rec709DestinationPath || sourcePath || '/Volumes/40';
    const dir = await window.clipsApi.openDirectory(defaultSearch);
    if (dir) {
      setDestinationPath(dir);
    }
  };

  const handleSelectCustomLut = async () => {
    const file = await window.clipsApi.openFile({ extensions: ['cube', 'CUBE'] });
    if (file) {
      setCustomLutPath(file);
      setSelectedLutPath(file);
    }
  };

  const handleStart = async () => {
    if (!sourcePath || !destinationPath || !selectedLutPath) return;

    const lutName =
      presets.find(p => p.path === selectedLutPath)?.name ||
      selectedLutPath.split('/').pop() ||
      'Rec709';

    const opts: LutConversionOptions = {
      sourcePath,
      destinationPath,
      lutPath: selectedLutPath,
      lutName,
      quality,
      codec,
      fullHD,
      fpsCap,
      skipExisting
    };

    await window.clipsApi.startLutConversion(opts);
  };

  const handleCancel = async () => {
    await window.clipsApi.cancelLutConversion();
  };

  const isConverting = progress.state === 'converting' || progress.state === 'scanning';

  // Live estimated file size calculation
  const baseBitrateUhd =
    quality === 'archive' ? 90 : quality === 'balanced' ? 65 : quality === 'compact' ? 35 : 18;
  const effectiveBitrateMbps = fullHD ? Math.round(baseBitrateUhd * 0.28) : baseBitrateUhd;
  const fpsFactor =
    fpsCap === 24 || fpsCap === 25 ? 0.82 : fpsCap === 30 ? 0.85 : fpsCap === 50 || fpsCap === 60 ? 0.92 : 1.0;
  const gbPerHour = (effectiveBitrateMbps * 3600 * fpsFactor) / (8 * 1024);

  const durationSec = footageStats?.durationSeconds || 0;
  const totalEstimatedGB =
    durationSec > 0 ? ((effectiveBitrateMbps * durationSec * fpsFactor) / (8 * 1024)).toFixed(1) : null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0D0C0A]">
      {/* Title Card */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2D2824]">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#FBFAF7]">
            <Sparkles className="w-5 h-5 text-[#E8A317]" />
            Convert Log Footage to Rec.709 Using LUT
          </h1>
          <p className="text-xs text-[#8C857B] mt-1">
            Batch grade Sony S-Gamut3.Cine / S-Log3 flat camera footage into vibrant Rec.709 with BaseLUTs - Sony S-Log3.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {activeProject && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 text-xs">
              <span className="w-2 h-2 rounded-full bg-[#2A9D8F] inline-block animate-pulse"></span>
              <span className="text-[#8C857B]">Active:</span>
              <span className="font-bold text-[#2A9D8F] font-mono">{activeProject.projectName}</span>
              <button
                onClick={() => {
                  setSourcePath(activeProject.rawSourcePath);
                  setDestinationPath(activeProject.rec709DestinationPath);
                  setAutoLinkedNote(`⚡ Re-synced paths to active project: ${activeProject.projectName}`);
                }}
                className="ml-1 text-[11px] underline text-[#E8A317] hover:text-[#FBFAF7] cursor-pointer"
                title="Click to re-populate source and destination folders from active project"
              >
                Sync
              </button>
            </div>
          )}

          {isConverting ? (
            <button
              onClick={handleCancel}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#9B2226] hover:bg-[#B82B30] text-[#FBFAF7] text-xs font-semibold shadow-md transition-all"
            >
              <XCircle className="w-4 h-4" />
              Cancel Conversion
            </button>
          ) : (
            <button
              onClick={handleStart}
              disabled={!sourcePath || !destinationPath || !selectedLutPath}
              className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-lg disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current text-[#E8A317]" />
              Start Batch Conversion
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

      {/* Main Configuration Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Input & Output Folders */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Source Folder Picker */}
          <div className="panel-card p-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#FBFAF7] flex items-center justify-between">
              <span>Source Footage Folder (Raw Camera Clips)</span>
              <span className="text-[11px] text-[#8C857B] font-mono">MP4, MOV, MXF</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={sourcePath}
                placeholder="Click 'Browse...' to select camera media or raw footage folder"
                className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
              <button
                onClick={handleSelectSource}
                disabled={isConverting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
              >
                <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                Browse…
              </button>
            </div>
          </div>

          {/* Destination Folder Picker */}
          <div className="panel-card p-4 flex flex-col gap-2 border-l-4 border-l-[#2A9D8F]">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#FBFAF7]">
                Destination Folder (Rec.709 Graded Clips Output)
              </label>
              {destinationPath && destinationPath.includes('02_REC709_CONVERTED_CLIPS') && (
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
                placeholder="Destination folder for converted Rec.709 clips"
                className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
              <button
                onClick={handleSelectDestination}
                disabled={isConverting}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
              >
                <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                Browse…
              </button>
            </div>
          </div>

          {/* LUT Preset Selection */}
          <div className="panel-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-[#FBFAF7] flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E8A317]" />
                Studio Rec.709 3D LUT Presets
              </label>
              <button
                onClick={handleSelectCustomLut}
                disabled={isConverting}
                className="text-[11px] text-[#E8A317] hover:underline flex items-center gap-1"
              >
                + Choose Custom .cube file…
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {presets.map(p => {
                const selected = selectedLutPath === p.path;
                return (
                  <div
                    key={p.id}
                    onClick={() => !isConverting && setSelectedLutPath(p.path)}
                    className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                      selected
                        ? 'bg-[#9B2226]/15 border-[#E8A317] ring-1 ring-[#E8A317]/50'
                        : 'bg-[#141110] border-[#2D2824] hover:border-[#3D3630]'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-[#FBFAF7]">{p.name}</span>
                      {selected && <CheckCircle2 className="w-4 h-4 text-[#E8A317]" />}
                    </div>
                    <p className="text-[11px] text-[#8C857B] mt-1">{p.description}</p>
                  </div>
                );
              })}

              {customLutPath && (
                <div
                  onClick={() => !isConverting && setSelectedLutPath(customLutPath)}
                  className={`p-3 rounded-lg border text-left cursor-pointer transition-all ${
                    selectedLutPath === customLutPath
                      ? 'bg-[#9B2226]/15 border-[#E8A317] ring-1 ring-[#E8A317]/50'
                      : 'bg-[#141110] border-[#2D2824]'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-[#FBFAF7]">Custom LUT</span>
                    {selectedLutPath === customLutPath && <CheckCircle2 className="w-4 h-4 text-[#E8A317]" />}
                  </div>
                  <p className="text-[10px] text-[#8C857B] truncate mt-1">{customLutPath}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Encoding & Quality Settings */}
        <div className="flex flex-col gap-5">
          <div className="panel-card p-4 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
              Encoding Settings
            </h3>

            {/* Quality Preset */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8C857B]">Bitrate Preset</label>
              <select
                value={quality}
                onChange={e => setQuality(e.target.value as VideoQualityPreset)}
                disabled={isConverting}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
              >
                <option value="archive">Archive Master (90 Mbps UHD / 28 Mbps HD)</option>
                <option value="balanced">Balanced Studio Quality (65 Mbps UHD / 18 Mbps HD)</option>
                <option value="compact">Compact Client Delivery (35 Mbps UHD / 10 Mbps HD)</option>
                <option value="proxy">Fast Proxy Cut (18 Mbps UHD / 6 Mbps HD)</option>
              </select>
            </div>

            {/* Codec */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8C857B]">Hardware Acceleration</label>
              <select
                value={codec}
                onChange={e => setCodec(e.target.value as VideoCodecChoice)}
                disabled={isConverting}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
              >
                <option value="h264_videotoolbox">H.264 Apple VideoToolbox (Fast Hardware)</option>
                <option value="hevc_videotoolbox">HEVC / H.265 Apple VideoToolbox</option>
                <option value="prores_videotoolbox">Apple ProRes 422 VideoToolbox</option>
                <option value="libx264">Software CPU libx264 (Highest Compatibility)</option>
              </select>
            </div>

            {/* Downscale Full HD Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-[#2D2824]">
              <div>
                <span className="text-xs font-medium text-[#FBFAF7]">Force Full HD (1080p)</span>
                <p className="text-[10px] text-[#8C857B]">Downscale 4K UHD clips for lighter delivery</p>
              </div>
              <input
                type="checkbox"
                checked={fullHD}
                onChange={e => setFullHD(e.target.checked)}
                disabled={isConverting}
                className="w-4 h-4 accent-[#9B2226]"
              />
            </div>

            {/* Skip Already Converted Toggle */}
            <div className="flex items-center justify-between py-2 border-t border-[#2D2824]">
              <div>
                <span className="text-xs font-medium text-[#FBFAF7]">Skip Already Converted Clips</span>
                <p className="text-[10px] text-[#8C857B]">Fast resume: checks destination folder and skips existing files</p>
              </div>
              <input
                type="checkbox"
                checked={skipExisting}
                onChange={e => setSkipExisting(e.target.checked)}
                disabled={isConverting}
                className="w-4 h-4 accent-[#9B2226]"
              />
            </div>

            {/* FPS Capping */}
            <div className="flex flex-col gap-1.5 pt-2 border-t border-[#2D2824]">
              <label className="text-xs text-[#8C857B]">Frame Rate Capping</label>
              <select
                value={fpsCap}
                onChange={e =>
                  setFpsCap(e.target.value === 'original' ? 'original' : (Number(e.target.value) as FpsCapChoice))
                }
                disabled={isConverting}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none focus:border-[#E8A317] cursor-pointer"
              >
                <option value="original">Original FPS (Keep 100/120fps high-speed)</option>
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
                    {Math.floor((footageStats.durationSeconds % 3600) / 60)}m ({ (footageStats.totalBytes / (1024 ** 3)).toFixed(1) } GB Raw)
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-2 text-[10px] font-mono pt-1.5 border-t border-[#24201C]">
                <div>
                  <span className="block text-[#6B655C]">Bitrate Rate:</span>
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
                  <span>🎯 25 FPS concentrates maximum bitrate into each frame for crisp detail &amp; smooth playback.</span>
                )}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Completed Dropbox Upload Banner */}
      {progress.state === 'completed' && (
        <div className="p-4 rounded-xl bg-gradient-to-r from-[#0061FE]/15 via-[#1A1814] to-[#2A9D8F]/15 border border-[#0061FE]/40 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-lg">
          <div className="flex items-start gap-3">
            <div className="p-2.5 rounded-xl bg-[#0061FE]/20 text-[#60A5FA] shrink-0">
              <HardDrive className="w-6 h-6 text-[#60A5FA]" />
            </div>
            <div>
              <h4 className="text-sm font-bold text-[#FBFAF7] flex items-center gap-2">
                Batch Log Conversion Complete!
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#2A9D8F]/20 text-[#2A9D8F] font-mono">
                  Rec.709 Ready
                </span>
              </h4>
              <p className="text-xs text-[#8C857B] mt-0.5">
                Converted clips are saved in <code className="text-[#FBFAF7] font-mono">{destinationPath}</code>. Upload directly to Dropbox to share with client.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={async () => {
                await window.clipsApi.uploadDropboxRawClips({
                  clientName: activeProject?.clientName || 'Wedding Client',
                  folderPath: destinationPath,
                  deliverableTitle: 'Rec.709 Converted Clips'
                });
              }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#0061FE] hover:bg-[#0052D4] text-[#FBFAF7] text-xs font-semibold shadow-md transition-all cursor-pointer"
            >
              Upload to Dropbox
            </button>
          </div>
        </div>
      )}

      {/* Progress & Live Terminal Card */}
      {(progress.state !== 'idle' || progress.logs.length > 0) && (
        <div className="panel-card p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileVideo className="w-4 h-4 text-[#E8A317]" />
              <span className="text-xs font-bold text-[#FBFAF7]">
                {progress.state === 'converting' ? 'Converting Batch…' : 'Batch Status'}
              </span>
              {progress.currentClipName && (
                <span className="text-xs font-mono text-[#8C857B] truncate max-w-sm">
                  ({progress.currentClipIndex}/{progress.totalClips}: {progress.currentClipName})
                </span>
              )}
            </div>

            {/* Performance Stats */}
            <div className="flex items-center gap-4 text-xs font-mono text-[#8C857B]">
              {progress.fps > 0 && (
                <span className="flex items-center gap-1">
                  <Gauge className="w-3.5 h-3.5 text-[#E8A317]" />
                  {progress.fps} fps ({progress.speed})
                </span>
              )}
              {progress.remainingSeconds > 0 && (
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-[#2A9D8F]" />
                  ETA: {Math.floor(progress.remainingSeconds / 60)}m {progress.remainingSeconds % 60}s
                </span>
              )}
              <span className="font-bold text-[#E8A317]">{progress.percent}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full h-2 rounded-full bg-[#141110] overflow-hidden border border-[#2D2824]">
            <div
              className="h-full bg-gradient-to-r from-[#9B2226] to-[#E8A317] transition-all duration-300"
              style={{ width: `${progress.percent}%` }}
            />
          </div>

          {/* Live Terminal Log */}
          <div className="mt-2 bg-[#090807] border border-[#24201C] rounded-lg p-2.5 h-32 overflow-y-auto font-mono text-[11px] text-[#A8A29E] flex flex-col gap-0.5">
            {progress.logs.map((log, idx) => (
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
    </div>
  );
};
