import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { calculateEditorWorkloads, EditorWorkload } from '../../utils/editorCapacity';
import {
  Users,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Clock,
  Search,
  Zap,
  Phone,
  Plus
} from 'lucide-react';
import { NewFreelanceJobModal } from '../modals/NewFreelanceJobModal';

export const CapacityRadarPanel: React.FC = () => {
  const { team, freelanceJobs } = useApp();
  const [filterTone, setFilterTone] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedEditorId, setSelectedEditorId] = useState<number | null>(null);
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);

  const workloads = calculateEditorWorkloads(freelanceJobs, team);

  const availableCount = workloads.filter(w => w.tone === 'available').length;
  const lightCount = workloads.filter(w => w.tone === 'light').length;
  const busyCount = workloads.filter(w => w.tone === 'busy' || w.tone === 'heavy').length;
  const leaveCount = workloads.filter(w => w.tone === 'on_leave').length;

  const filteredWorkloads = workloads.filter(w => {
    if (filterTone !== 'all') {
      if (filterTone === 'available' && w.tone !== 'available') return false;
      if (filterTone === 'light' && w.tone !== 'light') return false;
      if (filterTone === 'busy' && (w.tone !== 'busy' && w.tone !== 'heavy')) return false;
      if (filterTone === 'on_leave' && w.tone !== 'on_leave') return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return w.name.toLowerCase().includes(q) || (w.role || '').toLowerCase().includes(q);
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Overview & Quick Stats */}
      <div>
        <h3 className="text-sm font-bold text-[#111417]">Editor Capacity Radar</h3>
        <p className="text-[11px] text-[#6b6660]">
          Real-time workload intelligence, active cut queues, and next available dates across all studio editors.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div
          onClick={() => setFilterTone(filterTone === 'available' ? 'all' : 'available')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterTone === 'available'
              ? 'bg-emerald-50 border-emerald-500 shadow-xs'
              : 'bg-white border-[#d4c1a3] hover:border-emerald-500'
          }`}
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-emerald-800">
            🟢 Available Now
          </div>
          <div className="text-2xl font-extrabold text-emerald-700 mt-1">{availableCount}</div>
          <div className="text-[11px] text-[#6b6660] mt-1">0 active cuts · Ready for assignment</div>
        </div>

        <div
          onClick={() => setFilterTone(filterTone === 'light' ? 'all' : 'light')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterTone === 'light'
              ? 'bg-amber-50 border-amber-500 shadow-xs'
              : 'bg-white border-[#d4c1a3] hover:border-amber-500'
          }`}
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-amber-800">
            🟡 Light Load
          </div>
          <div className="text-2xl font-extrabold text-amber-700 mt-1">{lightCount}</div>
          <div className="text-[11px] text-[#6b6660] mt-1">1 cut in queue</div>
        </div>

        <div
          onClick={() => setFilterTone(filterTone === 'busy' ? 'all' : 'busy')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterTone === 'busy'
              ? 'bg-rose-50 border-rose-500 shadow-xs'
              : 'bg-white border-[#d4c1a3] hover:border-rose-500'
          }`}
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-rose-800">
            🔴 Busy / High Load
          </div>
          <div className="text-2xl font-extrabold text-rose-700 mt-1">{busyCount}</div>
          <div className="text-[11px] text-[#6b6660] mt-1">2+ cuts queued</div>
        </div>

        <div
          onClick={() => setFilterTone(filterTone === 'on_leave' ? 'all' : 'on_leave')}
          className={`p-4 rounded-xl border transition-all cursor-pointer ${
            filterTone === 'on_leave'
              ? 'bg-sky-50 border-sky-500 shadow-xs'
              : 'bg-white border-[#d4c1a3] hover:border-sky-500'
          }`}
        >
          <div className="text-[10px] uppercase font-bold tracking-wider text-sky-800">
            🏖️ On Leave Today
          </div>
          <div className="text-2xl font-extrabold text-sky-700 mt-1">{leaveCount}</div>
          <div className="text-[11px] text-[#6b6660] mt-1">Unavailable for editing</div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-[#6b6660]" />
          <input
            type="search"
            placeholder="Search editor name or role..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
          />
        </div>
        {filterTone !== 'all' && (
          <button
            onClick={() => setFilterTone('all')}
            className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-[#111417] rounded-xl transition-all"
          >
            Clear Filter ({filterTone})
          </button>
        )}
      </div>

      {/* Editor Workload Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredWorkloads.map(item => {
          let badgeClass = 'bg-emerald-50 text-emerald-800 border-emerald-200';
          if (item.tone === 'light') badgeClass = 'bg-amber-50 text-amber-800 border-amber-200';
          if (item.tone === 'busy' || item.tone === 'heavy') badgeClass = 'bg-rose-50 text-rose-800 border-rose-200';
          if (item.tone === 'on_leave') badgeClass = 'bg-sky-50 text-sky-800 border-sky-200';

          return (
            <div
              key={item.memberId}
              className="bg-white rounded-xl border border-[#d4c1a3] p-5 shadow-2xs flex flex-col justify-between gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-sm text-[#111417]">{item.name}</h4>
                      <span className="text-[11px] text-[#6b6660]">({item.role || 'Video Editor'})</span>
                    </div>
                    {item.phone && (
                      <div className="flex items-center gap-1.5 text-[11px] text-[#6b6660] mt-1">
                        <Phone className="w-3 h-3" />
                        <span>{item.phone}</span>
                      </div>
                    )}
                  </div>
                  <span
                    className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${badgeClass} shrink-0`}
                  >
                    {item.statusLabel}
                  </span>
                </div>

                <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                  <span className="text-[#6b6660]">Next Available Date:</span>
                  <span className="font-bold text-[#111417]">{item.nextAvailableDate}</span>
                </div>

                {/* Active Jobs Queue */}
                <div className="mt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1.5">
                    Active Queue ({item.activeJobsCount} cut{item.activeJobsCount !== 1 ? 's' : ''} · {item.totalAllocatedDays} days allocated):
                  </div>
                  {item.activeJobs.length === 0 ? (
                    <div className="text-xs text-emerald-700 flex items-center gap-1.5 bg-emerald-50/60 p-2 rounded-lg border border-emerald-100">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>Ready for immediate start. No active cuts in queue.</span>
                    </div>
                  ) : (
                    <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                      {item.activeJobs.map((job, idx) => (
                        <div
                          key={idx}
                          className="flex items-center justify-between text-xs p-2 rounded-lg bg-[#f9f8f6] border border-[#e5dcd3]"
                        >
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Briefcase className="w-3.5 h-3.5 text-[#6b6660] shrink-0" />
                            <span className="font-medium text-[#111417] truncate">{job.title}</span>
                          </div>
                          <span className="text-[10px] text-[#6b6660] shrink-0 ml-2">
                            {job.requiredDays}d · Due {job.dueDate ? job.dueDate.slice(0, 10) : 'TBD'}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="pt-3 border-t border-gray-100 flex justify-end">
                <button
                  onClick={() => {
                    setSelectedEditorId(item.memberId);
                    setIsAssignModalOpen(true);
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-bold rounded-lg transition-all"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Assign New Work</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {isAssignModalOpen && (
        <NewFreelanceJobModal
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setSelectedEditorId(null);
          }}
          initialJob={
            selectedEditorId
              ? ({
                  editorMemberId: selectedEditorId,
                  editorName: team.find(m => m.id === selectedEditorId)?.name,
                  editorPhone: team.find(m => m.id === selectedEditorId)?.phone
                } as any)
              : null
          }
        />
      )}
    </div>
  );
};
