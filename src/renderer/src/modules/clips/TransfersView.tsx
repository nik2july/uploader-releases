import React, { useState, useEffect } from 'react';
import {
  Layers,
  Play,
  Pause,
  Square,
  RotateCcw,
  Trash2,
  Terminal,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Film,
  HardDrive,
  CloudSync,
  ChevronDown,
  ChevronUp,
  Activity,
  Zap,
  FolderOpen
} from 'lucide-react';
import type { TransferTask, TaskStatus, TaskType } from '../types/contracts';
import type { TabId } from './Sidebar';

interface TransfersViewProps {
  onNavigateTab?: (tab: TabId) => void;
}

export const TransfersView: React.FC<TransfersViewProps> = ({ onNavigateTab }) => {
  const [tasks, setTasks] = useState<TransferTask[]>([]);
  const [activeFilter, setActiveFilter] = useState<'all' | 'running' | 'paused' | 'completed' | 'error'>('all');
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    // Initial fetch
    window.clipsApi.getTransfers().then(t => setTasks(t || []));

    // Live update listener
    const unsubscribe = window.clipsApi.onTransfersUpdated(updated => {
      setTasks(updated || []);
    });

    return () => {
      unsubscribe();
    };
  }, []);

  const toggleLogs = (id: string) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handlePause = async (id: string) => {
    await window.clipsApi.pauseTransfer(id);
  };

  const handleResume = async (id: string) => {
    await window.clipsApi.resumeTransfer(id);
  };

  const handleCancel = async (id: string) => {
    if (confirm('Are you sure you want to stop/cancel this process?')) {
      await window.clipsApi.cancelTransfer(id);
    }
  };

  const handleRetry = async (id: string) => {
    await window.clipsApi.retryTransfer(id);
  };

  const handleClearCompleted = async () => {
    await window.clipsApi.clearCompletedTransfers();
  };

  const handleRemove = async (id: string) => {
    await window.clipsApi.removeTransfer(id);
  };

  const handlePauseAll = async () => {
    const running = tasks.filter(t => t.status === 'running');
    for (const t of running) {
      await window.clipsApi.pauseTransfer(t.id);
    }
  };

  const handleResumeAll = async () => {
    const paused = tasks.filter(t => t.status === 'paused');
    for (const t of paused) {
      await window.clipsApi.resumeTransfer(t.id);
    }
  };

  const runningCount = tasks.filter(t => t.status === 'running').length;
  const pausedCount = tasks.filter(t => t.status === 'paused').length;
  const completedCount = tasks.filter(t => t.status === 'completed').length;
  const errorCount = tasks.filter(t => t.status === 'error').length;

  const filteredTasks = tasks.filter(t => {
    if (activeFilter === 'running') return t.status === 'running';
    if (activeFilter === 'paused') return t.status === 'paused';
    if (activeFilter === 'completed') return t.status === 'completed';
    if (activeFilter === 'error') return t.status === 'error';
    return true;
  });

  const getTaskIcon = (type: TaskType) => {
    switch (type) {
      case 'transcode':
        return <Film className="w-4 h-4 text-[#E8A317]" />;
      case 'dropbox_upload':
        return <HardDrive className="w-4 h-4 text-[#60A5FA]" />;
      case 'gdrive_sync':
        return <CloudSync className="w-4 h-4 text-[#34A853]" />;
    }
  };

  const getStatusBadge = (status: TaskStatus) => {
    switch (status) {
      case 'running':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#2A9D8F]/20 border border-[#2A9D8F]/40 text-[#2A9D8F]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2A9D8F] animate-pulse" />
            Running
          </span>
        );
      case 'paused':
        return (
          <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E8A317]/20 border border-[#E8A317]/40 text-[#E8A317]">
            <Pause className="w-3 h-3" />
            Paused
          </span>
        );
      case 'completed':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#2A9D8F]/15 border border-[#2A9D8F]/30 text-[#2A9D8F]">
            <CheckCircle2 className="w-3 h-3" />
            Completed
          </span>
        );
      case 'error':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#E63946]/20 border border-[#E63946]/40 text-[#E63946]">
            <AlertTriangle className="w-3 h-3" />
            Failed
          </span>
        );
      case 'cancelled':
        return (
          <span className="flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-[#8C857B]/20 border border-[#8C857B]/40 text-[#8C857B]">
            Cancelled
          </span>
        );
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[11px] bg-[#1F1B18] text-[#8C857B]">
            {status}
          </span>
        );
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0D0C0A] text-[#FBFAF7] overflow-hidden">
      {/* Top Header Banner */}
      <div className="p-5 border-b border-[#2D2824] bg-[#141110] flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-[#9B2226]/20 border border-[#9B2226]/40 text-[#E8A317]">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-base font-bold text-[#FBFAF7] font-serif flex items-center gap-2">
                Transfers &amp; Background Processing Queue
              </h1>
              <p className="text-xs text-[#8C857B]">
                Independent background manager for Log-to-Rec.709 transcoding and Dropbox cloud transfers with full pause, resume, and stop control.
              </p>
            </div>
          </div>
        </div>

        {/* Global Bulk Controls */}
        <div className="flex items-center gap-2">
          {runningCount > 0 && (
            <button
              onClick={handlePauseAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs font-semibold text-[#E8A317] cursor-pointer"
            >
              <Pause className="w-3.5 h-3.5" />
              Pause All
            </button>
          )}

          {pausedCount > 0 && (
            <button
              onClick={handleResumeAll}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#2A9D8F]/15 hover:bg-[#2A9D8F]/25 border border-[#2A9D8F]/40 text-xs font-semibold text-[#2A9D8F] cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              Resume All
            </button>
          )}

          {completedCount > 0 && (
            <button
              onClick={handleClearCompleted}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-xs text-[#8C857B] hover:text-[#FBFAF7] cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Finished
            </button>
          )}
        </div>
      </div>

      {/* Filter Tabs & Stats Bar */}
      <div className="px-5 py-3 border-b border-[#2D2824] bg-[#110E0D] flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeFilter === 'all'
                ? 'bg-[#9B2226] text-[#FBFAF7]'
                : 'text-[#8C857B] hover:text-[#FBFAF7] hover:bg-[#1A1814]'
            }`}
          >
            All Tasks ({tasks.length})
          </button>
          <button
            onClick={() => setActiveFilter('running')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeFilter === 'running'
                ? 'bg-[#2A9D8F]/20 border border-[#2A9D8F]/50 text-[#2A9D8F]'
                : 'text-[#8C857B] hover:text-[#FBFAF7] hover:bg-[#1A1814]'
            }`}
          >
            Active ({runningCount})
          </button>
          <button
            onClick={() => setActiveFilter('paused')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeFilter === 'paused'
                ? 'bg-[#E8A317]/20 border border-[#E8A317]/50 text-[#E8A317]'
                : 'text-[#8C857B] hover:text-[#FBFAF7] hover:bg-[#1A1814]'
            }`}
          >
            Paused ({pausedCount})
          </button>
          <button
            onClick={() => setActiveFilter('completed')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
              activeFilter === 'completed'
                ? 'bg-[#1F1B18] text-[#FBFAF7] border border-[#3D3630]'
                : 'text-[#8C857B] hover:text-[#FBFAF7] hover:bg-[#1A1814]'
            }`}
          >
            Completed ({completedCount})
          </button>
          {errorCount > 0 && (
            <button
              onClick={() => setActiveFilter('error')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                activeFilter === 'error'
                  ? 'bg-[#E63946]/20 border border-[#E63946]/50 text-[#E63946]'
                  : 'text-[#E63946] hover:bg-[#E63946]/10'
              }`}
            >
              Failed ({errorCount})
            </button>
          )}
        </div>

        <div className="flex items-center gap-3 text-xs text-[#8C857B] font-mono">
          <span className="flex items-center gap-1">
            <Activity className="w-3.5 h-3.5 text-[#E8A317]" />
            {runningCount} active background process{runningCount === 1 ? '' : 'es'}
          </span>
        </div>
      </div>

      {/* Main Task List */}
      <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        {filteredTasks.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <div className="w-14 h-14 rounded-2xl bg-[#141110] border border-[#2D2824] flex items-center justify-center text-[#8C857B] mb-3">
              <Layers className="w-7 h-7" />
            </div>
            <h3 className="text-sm font-semibold text-[#FBFAF7] mb-1">
              No {activeFilter === 'all' ? '' : activeFilter} tasks in the queue
            </h3>
            <p className="text-xs text-[#8C857B] max-w-sm mb-5">
              Whenever you start a Client Clips Delivery transcode or Dropbox upload, it runs safely in the background here with Pause, Resume, and Stop controls so you can do other work.
            </p>
            {onNavigateTab && (
              <button
                onClick={() => onNavigateTab('delivery')}
                className="sindoor-gradient-btn px-4 py-2 rounded-lg text-xs font-semibold shadow-md flex items-center gap-2 cursor-pointer"
              >
                <Film className="w-4 h-4" /> Go to Client Clips Delivery
              </button>
            )}
          </div>
        ) : (
          filteredTasks.map(task => {
            const isExpanded = !!expandedLogs[task.id];
            return (
              <div
                key={task.id}
                className="bg-[#141110] border border-[#2D2824] hover:border-[#3D3630] rounded-xl p-4 flex flex-col gap-3 shadow-md transition-all"
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2.5 rounded-lg bg-[#1F1B18] border border-[#2D2824] shrink-0 mt-0.5">
                      {getTaskIcon(task.type)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-[#FBFAF7]">
                          {task.title}
                        </span>
                        {getStatusBadge(task.status)}
                      </div>
                      {task.subtitle && (
                        <p className="text-xs text-[#8C857B] mt-0.5 font-mono">
                          {task.subtitle}
                        </p>
                      )}
                      {task.currentFile && task.status === 'running' && (
                        <p className="text-[11px] text-[#E8A317] font-mono mt-1 flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#E8A317] animate-ping" />
                          Processing: {task.currentFile}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions Buttons */}
                  <div className="flex items-center gap-1.5 shrink-0">
                    {task.status === 'running' && (
                      <button
                        onClick={() => handlePause(task.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#E8A317]/15 hover:bg-[#E8A317]/25 border border-[#E8A317]/40 text-xs font-semibold text-[#E8A317] cursor-pointer transition-all"
                        title="Pause this process (frees CPU/GPU/Bandwidth)"
                      >
                        <Pause className="w-3.5 h-3.5" />
                        Pause
                      </button>
                    )}

                    {task.status === 'paused' && (
                      <button
                        onClick={() => handleResume(task.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2A9D8F]/15 hover:bg-[#2A9D8F]/25 border border-[#2A9D8F]/40 text-xs font-semibold text-[#2A9D8F] cursor-pointer transition-all"
                        title="Resume this process"
                      >
                        <Play className="w-3.5 h-3.5" />
                        Resume
                      </button>
                    )}

                    {(task.status === 'running' || task.status === 'paused') && (
                      <button
                        onClick={() => handleCancel(task.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#E63946]/20 border border-[#2D2824] hover:border-[#E63946]/40 text-xs font-semibold text-[#8C857B] hover:text-[#E63946] cursor-pointer transition-all"
                        title="Stop/Cancel process"
                      >
                        <Square className="w-3.5 h-3.5" />
                        Stop
                      </button>
                    )}

                    {(task.status === 'error' || task.status === 'cancelled') && task.payload && (
                      <button
                        onClick={() => handleRetry(task.id)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#60A5FA]/15 hover:bg-[#60A5FA]/25 border border-[#60A5FA]/40 text-xs font-semibold text-[#60A5FA] cursor-pointer transition-all"
                        title="Retry this task"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Retry
                      </button>
                    )}

                    {task.shareUrl && (
                      <a
                        href={task.shareUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#2A9D8F]/15 hover:bg-[#2A9D8F]/25 border border-[#2A9D8F]/40 text-xs font-semibold text-[#2A9D8F] cursor-pointer transition-all"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Open Link
                      </a>
                    )}

                    <button
                      onClick={() => toggleLogs(task.id)}
                      className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-all ${
                        isExpanded
                          ? 'bg-[#2D2824] border-[#3D3630] text-[#FBFAF7]'
                          : 'bg-[#1F1B18] border-[#2D2824] text-[#8C857B] hover:text-[#FBFAF7]'
                      }`}
                      title={isExpanded ? 'Hide Console Logs' : 'View Console Logs'}
                    >
                      <Terminal className="w-4 h-4" />
                    </button>

                    {(task.status === 'completed' || task.status === 'cancelled' || task.status === 'error') && (
                      <button
                        onClick={() => handleRemove(task.id)}
                        className="p-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#2D2824] text-[#8C857B] hover:text-[#E63946] cursor-pointer transition-all"
                        title="Remove from list"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar & Stats */}
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <span className="text-[#FBFAF7] font-bold">
                      {task.progress}%
                    </span>
                    <div className="flex items-center gap-3 text-[11px] text-[#8C857B]">
                      {task.speed && <span>⚡ {task.speed}</span>}
                      {task.totalFiles ? (
                        <span>
                          [{task.currentFileIndex || 0} / {task.totalFiles} clips]
                        </span>
                      ) : null}
                      {task.totalBytes ? (
                        <span>
                          {((task.bytesDone || 0) / (1024 ** 3)).toFixed(1)} / {((task.totalBytes || 0) / (1024 ** 3)).toFixed(1)} GB
                        </span>
                      ) : null}
                    </div>
                  </div>

                  <div className="w-full bg-[#1F1B18] border border-[#2D2824] h-2.5 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 rounded-full ${
                        task.status === 'running'
                          ? 'bg-gradient-to-r from-[#9B2226] via-[#E8A317] to-[#2A9D8F]'
                          : task.status === 'paused'
                          ? 'bg-[#E8A317]'
                          : task.status === 'completed'
                          ? 'bg-[#2A9D8F]'
                          : task.status === 'error'
                          ? 'bg-[#E63946]'
                          : 'bg-[#8C857B]'
                      }`}
                      style={{ width: `${Math.min(task.progress, 100)}%` }}
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {task.error && (
                  <div className="p-3 rounded-lg bg-[#E63946]/10 border border-[#E63946]/40 text-xs text-[#E63946] flex flex-col gap-1 font-mono">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertTriangle className="w-4 h-4 shrink-0" />
                      <span>{task.error}</span>
                    </div>
                    {task.error.includes('files.content.write') && (
                      <p className="text-[11px] text-[#8C857B] mt-1 pl-6">
                        💡 Fix: Open Dropbox App Console &gt; Permissions tab, check <b>files.content.write</b> &amp; <b>files.metadata.write</b>, click Submit, then generate a new token in Settings ⚙.
                      </p>
                    )}
                  </div>
                )}

                {/* Expandable Terminal Logs */}
                {isExpanded && (
                  <div className="bg-[#0D0C0A] border border-[#2D2824] rounded-lg p-3 text-[11px] font-mono text-[#8C857B] max-h-48 overflow-y-auto flex flex-col gap-1">
                    <div className="flex items-center justify-between pb-1 border-b border-[#1F1B18] text-[#FBFAF7] font-bold">
                      <span>Task Execution Logs</span>
                      <span>{task.logs.length} lines</span>
                    </div>
                    {task.logs.length === 0 ? (
                      <span className="text-[#555] italic">No logs yet...</span>
                    ) : (
                      task.logs.map((line, idx) => (
                        <div
                          key={idx}
                          className={`${
                            line.includes('✓') || line.includes('🎉')
                              ? 'text-[#2A9D8F]'
                              : line.includes('⚠') || line.includes('Error')
                              ? 'text-[#E63946]'
                              : line.includes('⏸')
                              ? 'text-[#E8A317]'
                              : 'text-[#8C857B]'
                          }`}
                        >
                          {line}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
