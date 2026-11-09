import React, { useState, useEffect } from 'react';
import {
  Play,
  Pause,
  Square,
  Layers,
  ChevronRight,
  Film,
  HardDrive,
  CloudSync,
  X,
  ChevronUp,
  ChevronDown
} from 'lucide-react';
import type { TransferTask } from '../types/contracts';

interface TransfersFloatingBarProps {
  onOpenTransfers: () => void;
  activeTab: string;
}

export const TransfersFloatingBar: React.FC<TransfersFloatingBarProps> = ({
  onOpenTransfers,
  activeTab
}) => {
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [minimized, setMinimized] = useState(false);

  useEffect(() => {
    window.clipsApi.getTransfers().then(t => setTasks(t || []));

    const unsubscribe = window.clipsApi.onTransfersUpdated(updated => {
      setTasks(updated || []);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  // Filter for currently running or paused tasks
  const activeTasks = tasks.filter(t => t.status === 'running' || t.status === 'paused');

  // If user is already on the transfers tab or no active tasks, do not render floating bar
  if (activeTasks.length === 0 || activeTab === 'transfers') {
    return null;
  }

  const primaryTask = activeTasks[0];

  const handlePause = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await window.clipsApi.pauseTransfer(id);
  };

  const handleResume = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    await window.clipsApi.resumeTransfer(id);
  };

  const handleCancel = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Stop/cancel this process?')) {
      await window.clipsApi.cancelTransfer(id);
    }
  };

  const getTaskIcon = () => {
    if (primaryTask.type === 'transcode') return <Film className="w-3.5 h-3.5 text-[#E8A317]" />;
    if (primaryTask.type === 'dropbox_upload') return <HardDrive className="w-3.5 h-3.5 text-[#60A5FA]" />;
    return <CloudSync className="w-3.5 h-3.5 text-[#34A853]" />;
  };

  if (minimized) {
    return (
      <div
        onClick={() => setMinimized(false)}
        className="fixed bottom-3 right-6 z-40 bg-[#141110]/95 backdrop-blur border border-[#E8A317]/50 rounded-full px-3 py-1.5 shadow-2xl flex items-center gap-2 cursor-pointer hover:bg-[#1F1B18] transition-all"
      >
        <span className="w-2 h-2 rounded-full bg-[#E8A317] animate-pulse" />
        <span className="text-xs font-mono font-bold text-[#FBFAF7]">
          {activeTasks.length} Task{activeTasks.length > 1 ? 's' : ''} ({primaryTask.progress}%)
        </span>
        <ChevronUp className="w-3.5 h-3.5 text-[#8C857B]" />
      </div>
    );
  }

  return (
    <aside
      aria-label="Active background transfers"
      className="fixed bottom-3 left-68 right-6 z-40 bg-[#141110]/95 backdrop-blur-md border border-[#2D2824] hover:border-[#3D3630] rounded-xl px-4 py-2.5 shadow-2xl flex items-center justify-between gap-4 transition-all"
    >
      {/* Left side: Task info & progress */}
      <div
        onClick={onOpenTransfers}
        className="flex items-center gap-3 cursor-pointer flex-1 min-w-0"
        title="Click to open Transfers Queue"
      >
        <div className="p-2 rounded-lg bg-[#1F1B18] border border-[#2D2824] shrink-0">
          {getTaskIcon()}
        </div>

        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-[#FBFAF7] truncate">
              {primaryTask.title}
            </span>
            {primaryTask.status === 'paused' ? (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E8A317]/20 border border-[#E8A317]/40 text-[#E8A317] font-semibold">
                Paused
              </span>
            ) : (
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#2A9D8F]/20 border border-[#2A9D8F]/40 text-[#2A9D8F] font-semibold flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-pulse" />
                Active
              </span>
            )}
            {activeTasks.length > 1 && (
              <span className="text-[10px] font-mono text-[#8C857B]">
                (+{activeTasks.length - 1} more)
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-[11px] font-mono text-[#8C857B]">
            {primaryTask.currentFile && (
              <span className="truncate max-w-[200px]">
                {primaryTask.currentFile}
              </span>
            )}
            {primaryTask.totalFiles ? (
              <span>
                [{primaryTask.currentFileIndex || 0}/{primaryTask.totalFiles}]
              </span>
            ) : null}
            {primaryTask.speed && (
              <span className="text-[#E8A317]">
                ⚡ {primaryTask.speed}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Center: Progress Bar */}
      <div className="w-48 shrink-0 flex flex-col gap-1">
        <div className="flex items-center justify-between text-[11px] font-mono">
          <span className="text-[#FBFAF7] font-bold">
            {primaryTask.progress}%
          </span>
          <span className="text-[#8C857B]">
            {primaryTask.bytesDone && primaryTask.totalBytes
              ? `${((primaryTask.bytesDone) / (1024 ** 3)).toFixed(1)} / ${((primaryTask.totalBytes) / (1024 ** 3)).toFixed(1)} GB`
              : ''}
          </span>
        </div>
        <div className="w-full bg-[#1F1B18] border border-[#2D2824] h-2 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-300 rounded-full ${
              primaryTask.status === 'paused'
                ? 'bg-[#E8A317]'
                : 'bg-gradient-to-r from-[#9B2226] via-[#E8A317] to-[#2A9D8F]'
            }`}
            style={{ width: `${Math.min(primaryTask.progress, 100)}%` }}
          />
        </div>
      </div>

      {/* Right side: Inline Controls + View Queue Button */}
      <div className="flex items-center gap-2 shrink-0">
        {primaryTask.status === 'running' ? (
          <button
            onClick={e => handlePause(e, primaryTask.id)}
            className="p-1.5 rounded-lg bg-[#E8A317]/15 hover:bg-[#E8A317]/25 border border-[#E8A317]/40 text-[#E8A317] text-xs font-semibold cursor-pointer"
            title="Pause process"
          >
            <Pause className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={e => handleResume(e, primaryTask.id)}
            className="p-1.5 rounded-lg bg-[#2A9D8F]/15 hover:bg-[#2A9D8F]/25 border border-[#2A9D8F]/40 text-[#2A9D8F] text-xs font-semibold cursor-pointer"
            title="Resume process"
          >
            <Play className="w-3.5 h-3.5" />
          </button>
        )}

        <button
          onClick={e => handleCancel(e, primaryTask.id)}
          className="p-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#E63946]/20 border border-[#2D2824] text-[#8C857B] hover:text-[#E63946] text-xs font-semibold cursor-pointer"
          title="Stop process"
        >
          <Square className="w-3.5 h-3.5" />
        </button>

        <button
          onClick={onOpenTransfers}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg sindoor-gradient-btn text-xs font-semibold cursor-pointer shadow-sm"
        >
          <Layers className="w-3.5 h-3.5" />
          <span>Queue ↗</span>
        </button>

        <button
          onClick={() => setMinimized(true)}
          className="p-1 rounded-md text-[#8C857B] hover:text-[#FBFAF7] cursor-pointer"
          title="Minimize floating bar"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
};
