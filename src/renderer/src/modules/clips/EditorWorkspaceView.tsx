import React, { useState, useEffect } from 'react';
import {
  CheckSquare,
  FolderOpen,
  Calendar,
  AlertCircle,
  ExternalLink,
  Clock,
  Film,
  Sparkles,
  CheckCircle2,
  ListTodo
} from 'lucide-react';
import type { EditorDeliverable, EditorTask } from '../types/contracts';

const EDITORS = [
  { id: 0, name: 'All Assigned Editors' },
  { id: 101, name: 'Sahil (Senior Video Editor)' },
  { id: 102, name: 'Aarav (Reels & Social Editor)' }
];

export const EditorWorkspaceView: React.FC = () => {
  const [selectedEditorId, setSelectedEditorId] = useState<number>(0);
  const [deliverables, setDeliverables] = useState<EditorDeliverable[]>([]);
  const [tasks, setTasks] = useState<EditorTask[]>([]);
  const [activeTab, setActiveTab] = useState<'deliverables' | 'tasks'>('deliverables');

  useEffect(() => {
    loadData();
  }, [selectedEditorId]);

  const loadData = async () => {
    const delivs = await window.clipsApi.getEditorDeliverables(
      selectedEditorId === 0 ? undefined : selectedEditorId
    );
    if (delivs) setDeliverables(delivs);

    const t = await window.clipsApi.getEditorTasks(
      selectedEditorId === 0 ? undefined : selectedEditorId
    );
    if (t) setTasks(t);
  };

  const handleToggleTask = async (taskId: string) => {
    const updated = await window.clipsApi.toggleEditorTask(taskId);
    if (updated) {
      setTasks(tasks.map(t => (t.id === taskId ? updated : t)));
    }
  };

  const handleUpdateStatus = async (id: string, status: EditorDeliverable['status']) => {
    const updated = await window.clipsApi.updateDeliverableStatus(id, status);
    if (updated) {
      setDeliverables(deliverables.map(d => (d.id === id ? updated : d)));
    }
  };

  const handleRevealPath = async (p?: string) => {
    if (p) await window.clipsApi.revealFolder(p);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto p-6 gap-6 bg-[#0D0C0A]">
      {/* Title & Editor Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#2D2824] gap-4">
        <div>
          <h1 className="text-xl font-bold font-serif flex items-center gap-2.5 text-[#FBFAF7]">
            <CheckSquare className="w-5 h-5 text-[#E8A317]" />
            Editor Workspace — Assigned Tasks &amp; Deliverables
          </h1>
          <p className="text-xs text-[#8C857B] mt-1">
            Personal workbench for video editors to track cuts, deadlines, client revision notes, and raw footage.
          </p>
        </div>

        {/* Editor Switcher & Tab Selector */}
        <div className="flex items-center gap-3">
          <select
            value={selectedEditorId}
            onChange={e => setSelectedEditorId(Number(e.target.value))}
            className="bg-[#1F1B18] border border-[#3D3630] rounded-lg px-3 py-2 text-xs font-semibold text-[#FBFAF7] focus:outline-none"
          >
            {EDITORS.map(ed => (
              <option key={ed.id} value={ed.id}>
                {ed.name}
              </option>
            ))}
          </select>

          <div className="flex rounded-lg bg-[#141110] p-1 border border-[#2D2824]">
            <button
              onClick={() => setActiveTab('deliverables')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                activeTab === 'deliverables' ? 'bg-[#9B2226] text-[#FBFAF7]' : 'text-[#8C857B] hover:text-[#FBFAF7]'
              }`}
            >
              Deliverables ({deliverables.length})
            </button>
            <button
              onClick={() => setActiveTab('tasks')}
              className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                activeTab === 'tasks' ? 'bg-[#9B2226] text-[#FBFAF7]' : 'text-[#8C857B] hover:text-[#FBFAF7]'
              }`}
            >
              Tasks ({tasks.filter(t => !t.done).length})
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === 'deliverables' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {deliverables.map(deliv => (
            <div
              key={deliv.id}
              className="panel-card p-5 flex flex-col justify-between gap-4 border border-[#2D2824] hover:border-[#3D3630] transition-colors"
            >
              <div className="flex flex-col gap-3">
                {/* Header Line */}
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E8A317]">
                      {deliv.clientName}
                    </span>
                    <h3 className="text-sm font-bold text-[#FBFAF7] font-serif mt-0.5">
                      {deliv.title}
                    </h3>
                  </div>

                  {/* Status Badge */}
                  <select
                    value={deliv.status}
                    onChange={e => handleUpdateStatus(deliv.id, e.target.value as any)}
                    className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border focus:outline-none ${
                      deliv.status === 'completed'
                        ? 'bg-[#2A9D8F]/15 border-[#2A9D8F]/40 text-[#2A9D8F]'
                        : deliv.status === 'changes_requested'
                          ? 'bg-[#9B2226]/15 border-[#9B2226]/40 text-[#F87171]'
                          : deliv.status === 'in_progress'
                            ? 'bg-[#E8A317]/15 border-[#E8A317]/40 text-[#E8A317]'
                            : 'bg-[#1F1B18] border-[#3D3630] text-[#8C857B]'
                    }`}
                  >
                    <option value="todo">To Do</option>
                    <option value="in_progress">In Editing</option>
                    <option value="changes_requested">Changes Requested</option>
                    <option value="review">In Review</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                {/* Due Date & Assignee */}
                <div className="flex items-center gap-4 text-[11px] text-[#8C857B] font-mono">
                  <span className="flex items-center gap-1.5 text-[#FBFAF7]">
                    <Calendar className="w-3.5 h-3.5 text-[#E8A317]" />
                    Due: {deliv.dueDate || 'No deadline'}
                  </span>
                  <span>Editor: {deliv.assignedMemberName}</span>
                </div>

                {/* Active Revision Alert if changes requested */}
                {deliv.status === 'changes_requested' && deliv.revisionPoints && (
                  <div className="p-3 rounded-lg bg-[#9B2226]/10 border border-[#9B2226]/30 flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs font-bold text-[#F87171]">
                      <span className="flex items-center gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Client Change Request (Hotline: +91 88945 62004)
                      </span>
                      {deliv.revisionTimecodes && (
                        <span className="text-[10px] font-mono text-[#E8A317]">
                          TC: {deliv.revisionTimecodes}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#D6D0C6] font-mono whitespace-pre-line leading-relaxed">
                      {deliv.revisionPoints}
                    </p>
                  </div>
                )}

                {/* Notes */}
                {deliv.notes && (
                  <p className="text-xs text-[#8C857B] italic">
                    "{deliv.notes}"
                  </p>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex items-center gap-2 pt-3 border-t border-[#24201C] text-xs">
                {deliv.rawFootagePath && (
                  <button
                    onClick={() => handleRevealPath(deliv.rawFootagePath)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-[#FBFAF7] font-medium transition-all"
                  >
                    <FolderOpen className="w-3.5 h-3.5 text-[#E8A317]" />
                    Raw Footage
                  </button>
                )}

                {deliv.renderPath && (
                  <button
                    onClick={() => handleRevealPath(deliv.renderPath)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F1B18] hover:bg-[#2D2824] border border-[#3D3630] text-[#FBFAF7] font-medium transition-all"
                  >
                    <Film className="w-3.5 h-3.5 text-[#2A9D8F]" />
                    Render Cut
                  </button>
                )}

                {deliv.dropboxReviewUrl && (
                  <a
                    href={deliv.dropboxReviewUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="ml-auto flex items-center gap-1 text-[#60A5FA] hover:underline text-[11px] font-mono"
                  >
                    <ExternalLink className="w-3 h-3" /> Dropbox Review
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        /* Tasks List View */
        <div className="panel-card p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-3 border-b border-[#2D2824]">
            <span className="text-xs font-bold text-[#FBFAF7] uppercase tracking-wider font-mono">
              Action Items &amp; Post Tasks
            </span>
            <span className="text-xs text-[#8C857B]">
              {tasks.filter(t => t.done).length}/{tasks.length} Completed
            </span>
          </div>

          <div className="flex flex-col gap-2">
            {tasks.map(t => (
              <div
                key={t.id}
                onClick={() => handleToggleTask(t.id)}
                className={`p-3.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                  t.done
                    ? 'bg-[#141110]/50 border-[#24201C] opacity-60'
                    : 'bg-[#141110] border-[#2D2824] hover:border-[#3D3630]'
                }`}
              >
                <div className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => {}}
                    className="w-4 h-4 accent-[#9B2226] cursor-pointer"
                  />
                  <div className="flex flex-col">
                    <span
                      className={`text-xs font-medium ${
                        t.done ? 'line-through text-[#8C857B]' : 'text-[#FBFAF7]'
                      }`}
                    >
                      {t.text}
                    </span>
                    <div className="flex items-center gap-3 text-[10px] text-[#8C857B] font-mono mt-0.5">
                      {t.clientName && <span>Client: {t.clientName}</span>}
                      {t.category && <span>Category: {t.category}</span>}
                      {t.assigneeName && <span>Assigned: {t.assigneeName}</span>}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  {/* Priority Tag */}
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded font-mono font-bold uppercase ${
                      t.priority === 'urgent'
                        ? 'bg-[#9B2226]/20 text-[#F87171] border border-[#9B2226]/40'
                        : t.priority === 'high'
                          ? 'bg-[#E8A317]/20 text-[#E8A317] border border-[#E8A317]/40'
                          : 'bg-[#1F1B18] text-[#8C857B]'
                    }`}
                  >
                    {t.priority}
                  </span>

                  {t.dueDate && (
                    <span className="text-[11px] font-mono text-[#8C857B]">
                      {t.dueDate}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
