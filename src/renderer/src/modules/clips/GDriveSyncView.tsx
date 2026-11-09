import React, { useState, useEffect } from 'react';
import {
  CloudSync,
  FolderOpen,
  Play,
  ShieldCheck,
  Clock,
  CheckCircle2,
  AlertTriangle,
  HardDrive
} from 'lucide-react';
import type { GDriveSyncConfig, GDriveSyncStatus } from '../types/contracts';

export const GDriveSyncView: React.FC = () => {
  const [config, setConfig] = useState<GDriveSyncConfig>({
    sourceDirectory: '/Volumes/40',
    targetFolderName: 'Baawaray Studio Raw & Clips Backup',
    syncHour: 2,
    autoSyncDaily: true,
    isConnected: true,
    lastSyncAt: new Date(Date.now() - 3600_000 * 8).toISOString()
  });

  const [status, setStatus] = useState<GDriveSyncStatus>({
    state: 'idle',
    filesUploaded: 124,
    totalFiles: 124,
    bytesUploaded: 48_500_000_000,
    totalBytes: 48_500_000_000,
    currentFile: 'Up to date',
    percent: 100,
    lastSyncAt: new Date(Date.now() - 3600_000 * 8).toISOString()
  });

  useEffect(() => {
    window.clipsApi.getGDriveConfig().then(cfg => {
      if (cfg) setConfig(cfg);
    });
    window.clipsApi.getGDriveStatus().then(st => {
      if (st) setStatus(st);
    });

    const unsub = window.clipsApi.onGDriveStatus(s => setStatus(s));
    return () => unsub();
  }, []);

  const handleSelectSource = async () => {
    const dir = await window.clipsApi.openDirectory(config.sourceDirectory);
    if (dir) {
      const updated = await window.clipsApi.updateGDriveConfig({ sourceDirectory: dir });
      setConfig(updated);
    }
  };

  const handleToggleAutoSync = async (enabled: boolean) => {
    const updated = await window.clipsApi.updateGDriveConfig({ autoSyncDaily: enabled });
    setConfig(updated);
  };

  const handleChangeSyncHour = async (hour: number) => {
    const updated = await window.clipsApi.updateGDriveConfig({ syncHour: hour });
    setConfig(updated);
  };

  const handleStartSyncNow = async () => {
    await window.clipsApi.startGDriveSync();
  };

  const isSyncing = status.state === 'syncing' || status.state === 'checking';

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0D0C0A]">
      {/* Title */}
      <div className="flex items-center justify-between pb-4 border-b border-[#2D2824]">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#FBFAF7]">
            <CloudSync className="w-5 h-5 text-[#E8A317]" />
            Daily One-Way Google Drive Cloud Backup
          </h1>
          <p className="text-xs text-[#8C857B] mt-1">
            Automated one-way backup once per day at 02:00 AM. Local originals are permanently preserved and never modified.
          </p>
        </div>

        <button
          onClick={handleStartSyncNow}
          disabled={isSyncing || !config.sourceDirectory}
          className="sindoor-gradient-btn flex items-center gap-2 px-5 py-2.5 rounded-lg text-xs font-semibold shadow-lg disabled:opacity-40 cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current text-[#E8A317]" />
          {isSyncing ? 'Syncing to Drive…' : 'Sync to Google Drive Now'}
        </button>
      </div>

      {/* Safety Notice */}
      <div className="p-4 rounded-xl bg-[#2A9D8F]/10 border border-[#2A9D8F]/30 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-[#2A9D8F] shrink-0 mt-0.5" />
        <div className="flex flex-col gap-0.5 text-xs">
          <span className="font-bold text-[#FBFAF7]">One-Way Backup Safety Policy</span>
          <p className="text-[#8C857B] leading-relaxed">
            Data is strictly pushed <strong className="text-[#2A9D8F]">one-way</strong> from your Mac / external storage to Google Drive. The cloud will never delete, rename, or overwrite your local camera originals.
          </p>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Setup */}
        <div className="lg:col-span-2 flex flex-col gap-5">
          {/* Source Directory */}
          <div className="panel-card p-4 flex flex-col gap-2">
            <label className="text-xs font-semibold text-[#FBFAF7]">
              Local Footage Folder to Backup
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={config.sourceDirectory}
                className="flex-1 bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] font-mono focus:outline-none"
              />
              <button
                onClick={handleSelectSource}
                disabled={isSyncing}
                className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-medium text-[#FBFAF7]"
              >
                <FolderOpen className="w-4 h-4 text-[#E8A317]" />
                Browse…
              </button>
            </div>
          </div>

          {/* Schedule & Daily Frequency */}
          <div className="panel-card p-5 flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
              Schedule &amp; Frequency
            </h3>

            <div className="flex items-center justify-between p-3 rounded-lg bg-[#141110] border border-[#2D2824]">
              <div>
                <span className="text-xs font-semibold text-[#FBFAF7]">Run Daily Auto-Sync</span>
                <p className="text-[11px] text-[#8C857B]">
                  Triggers once every 24 hours in the background
                </p>
              </div>
              <input
                type="checkbox"
                checked={config.autoSyncDaily}
                onChange={e => handleToggleAutoSync(e.target.checked)}
                className="w-4 h-4 accent-[#9B2226]"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8C857B]">Daily Sync Time</label>
              <select
                value={config.syncHour}
                onChange={e => handleChangeSyncHour(Number(e.target.value))}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
              >
                <option value={1}>01:00 AM (Nightly)</option>
                <option value={2}>02:00 AM (Recommended - Low Bandwidth)</option>
                <option value={3}>03:00 AM (Nightly)</option>
                <option value={4}>04:00 AM (Early Morning)</option>
                <option value={12}>12:00 PM (Noon)</option>
                <option value={22}>10:00 PM (End of Day)</option>
              </select>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-[#8C857B]">Target Google Drive Folder</label>
              <input
                type="text"
                value={config.targetFolderName}
                onChange={e => window.clipsApi.updateGDriveConfig({ targetFolderName: e.target.value })}
                className="bg-[#141110] border border-[#2D2824] rounded-lg px-3 py-2 text-xs text-[#FBFAF7] focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Right Col: Sync Status & Summary */}
        <div className="panel-card p-5 flex flex-col justify-between gap-5">
          <div className="flex flex-col gap-4">
            <h3 className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
              Backup Telemetry
            </h3>

            <div className="p-3 rounded-lg bg-[#141110] border border-[#2D2824] flex items-center justify-between">
              <span className="text-xs text-[#8C857B]">Cloud Status</span>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-bold font-mono text-[#2A9D8F] bg-[#2A9D8F]/15 border border-[#2A9D8F]/30">
                <CheckCircle2 className="w-3.5 h-3.5" /> Connected
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#141110] border border-[#2D2824] flex flex-col gap-1">
              <span className="text-[11px] text-[#8C857B]">Last Completed Sync</span>
              <span className="font-mono text-xs text-[#FBFAF7]">
                {config.lastSyncAt ? new Date(config.lastSyncAt).toLocaleString() : 'Not yet run'}
              </span>
            </div>

            <div className="p-3 rounded-lg bg-[#141110] border border-[#2D2824] flex flex-col gap-1">
              <span className="text-[11px] text-[#8C857B]">Next Scheduled Sync</span>
              <span className="font-mono text-xs text-[#E8A317] flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5" /> Today at {config.syncHour.toString().padStart(2, '0')}:00
              </span>
            </div>
          </div>

          {/* Sync Progress if Active */}
          <div className="flex flex-col gap-2 pt-4 border-t border-[#2D2824]">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#8C857B] font-mono truncate max-w-[200px]">
                {status.currentFile}
              </span>
              <span className="font-mono font-bold text-[#E8A317]">{status.percent}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-[#141110] overflow-hidden border border-[#2D2824]">
              <div
                className="h-full bg-gradient-to-r from-[#9B2226] to-[#E8A317] transition-all duration-300"
                style={{ width: `${status.percent}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
