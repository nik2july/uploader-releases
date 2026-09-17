import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { isDeliverablesTeamMember, isSalariedMember } from '../../utils/freelance';
import { formatINR, getInitials } from '../../utils/formatters';
import { whatsAppLink } from '../../utils/phone';
import { calculateEditorWorkloads } from '../../utils/editorCapacity';
import {
  Users,
  Search,
  MessageCircle,
  Phone,
  Mail,
  ChevronRight,
  Briefcase,
  Layers,
  Clock,
  CheckCircle2,
  AlertCircle,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { AddTeamMemberModal } from '../modals/AddTeamMemberModal';

interface PostProductionTeamScreenProps {
  onOpenEditor?: (id: number) => void;
}

export function PostProductionTeamScreen({ onOpenEditor }: PostProductionTeamScreenProps): React.JSX.Element {
  const studio = useApp();
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'video' | 'photo' | 'album'>('all');
  const [isAddMemberOpen, setIsAddMemberOpen] = useState(false);

  const allDeliverablesMembers = useMemo(() => {
    return studio.team
      .filter(m => m.active !== false && isDeliverablesTeamMember(m))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [studio.team]);

  const workloads = useMemo(
    () => calculateEditorWorkloads(studio.freelanceJobs, studio.team),
    [studio.freelanceJobs, studio.team]
  );
  const workloadMap = useMemo(
    () => new Map(workloads.map(w => [w.memberId, w])),
    [workloads]
  );

  const filteredMembers = useMemo(() => {
    return allDeliverablesMembers.filter(member => {
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = member.name.toLowerCase().includes(q);
        const matchRole = (member.role || '').toLowerCase().includes(q);
        const matchPhone = (member.phone || '').toLowerCase().includes(q);
        const matchEmail = (member.email || '').toLowerCase().includes(q);
        if (!matchName && !matchRole && !matchPhone && !matchEmail) return false;
      }

      // Role Filter
      if (roleFilter === 'video') {
        const r = (member.role || '').toLowerCase();
        return r.includes('video') || r.includes('cinemat') || r.includes('editor') || r.includes('teaser');
      }
      if (roleFilter === 'photo') {
        const r = (member.role || '').toLowerCase();
        return r.includes('photo') || r.includes('color') || r.includes('retouch') || r.includes('cull');
      }
      if (roleFilter === 'album') {
        const r = (member.role || '').toLowerCase();
        return r.includes('album') || r.includes('design');
      }

      return true;
    });
  }, [allDeliverablesMembers, searchQuery, roleFilter]);

  const activeJobsCount = useMemo(() => {
    return studio.freelanceJobs.filter(j => j.stage !== 'completed' && j.editorMemberId !== undefined).length;
  }, [studio.freelanceJobs]);

  const salariedCount = useMemo(() => {
    return allDeliverablesMembers.filter(m => isSalariedMember(m)).length;
  }, [allDeliverablesMembers]);

  const handleOpenEditor = (id: number) => {
    if (onOpenEditor) {
      onOpenEditor(id);
    } else {
      studio.setSelectedFreelanceEditorId(id);
      studio.setActiveView('freelanceEditor');
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-serif text-[#111417]">Post-Production Team</h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[#d4c1a3]/40 text-[#7a2e33] border border-[#d4c1a3]">
              {allDeliverablesMembers.length} Editors
            </span>
          </div>
          <p className="text-xs text-[#6b6660] mt-0.5">
            Deliverables crew, editors, colorists, and album designers with live capacity & assignments.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddMemberOpen(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7a2e33] text-white text-xs font-bold shadow-xs hover:bg-[#632529] transition-all cursor-pointer shrink-0 self-start sm:self-auto"
        >
          <UserPlus className="w-4 h-4" />
          <span>Add Team Member</span>
        </button>
      </div>

      {/* Summary KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Deliverables Crew
            </span>
            <Users className="w-4 h-4 text-[#7a2e33]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {allDeliverablesMembers.length}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            In-house editors & active freelancers
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Assigned Active Works
            </span>
            <Briefcase className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {activeJobsCount}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Projects currently in post-production queue
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              In-House Monthly Payroll
            </span>
            <UserCheck className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {salariedCount}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Salaried crew covered by monthly payroll
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white rounded-xl p-3 border border-[#d4c1a3] shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-[#6b6660]" />
          <input
            type="text"
            placeholder="Search editor name, role, phone, or email..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] placeholder:text-[#6b6660]/70 focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-2.5 text-xs text-[#6b6660] hover:text-[#111417]"
            >
              ✕
            </button>
          )}
        </div>

        {/* Category Filters */}
        <div className="flex items-center gap-1.5 flex-wrap">
          {[
            { id: 'all', label: 'All Roles' },
            { id: 'video', label: 'Video Editors' },
            { id: 'photo', label: 'Photo / Color' },
            { id: 'album', label: 'Album Designers' },
          ].map(f => (
            <button
              key={f.id}
              type="button"
              onClick={() => setRoleFilter(f.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                roleFilter === f.id
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'bg-[#f9f8f6] text-[#6b6660] hover:text-[#111417] border border-[#d4c1a3]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Team Cards Grid */}
      {filteredMembers.length === 0 ? (
        <div className="bg-white rounded-xl p-12 border border-[#d4c1a3] text-center">
          <Users className="w-10 h-10 text-[#d4c1a3] mx-auto mb-3" />
          <h3 className="text-sm font-bold text-[#111417]">No team members found</h3>
          <p className="text-xs text-[#6b6660] mt-1 max-w-sm mx-auto">
            {searchQuery ? 'Try clearing your search query or filters.' : 'Add video editors, photo retouchers, and album designers to your studio team roster.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMembers.map(member => {
            const workload = workloadMap.get(member.id);
            const activeJobs = studio.freelanceJobs.filter(
              j => j.editorMemberId === member.id && j.stage !== 'completed'
            );
            const account = studio.freelanceEditorAccounts.get(member.id);
            const isSalaried = isSalariedMember(member);
            const phoneClean = member.phone?.replace(/[^0-9+]/g, '');

            return (
              <div
                key={member.id}
                className="bg-white rounded-2xl border border-[#d4c1a3] shadow-2xs hover:shadow-md transition-all p-4.5 flex flex-col justify-between space-y-4"
              >
                <div>
                  {/* Card Header: Avatar, Name & Role */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-xl bg-[#7a2e33] text-[#f9f8f6] font-bold text-sm flex items-center justify-center shadow-xs shrink-0">
                        {getInitials(member.name)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-sm font-bold text-[#111417] truncate leading-snug">
                          {member.name}
                        </h4>
                        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                          <span className="text-[10px] font-semibold text-[#6b6660] truncate">
                            {member.role || 'Deliverables Team'}
                          </span>
                          {isSalaried ? (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                              Salaried
                            </span>
                          ) : (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                              Per Job
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Quick WhatsApp Link */}
                    {phoneClean && whatsAppLink(member.phone, '91') && (
                      <a
                        href={whatsAppLink(member.phone, '91')!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-2 text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-xl transition-colors cursor-pointer shrink-0"
                        title={`Chat with ${member.name} on WhatsApp`}
                      >
                        <MessageCircle className="w-4 h-4" />
                      </a>
                    )}
                  </div>

                  {/* Contact Info */}
                  <div className="mt-3.5 pt-3 border-t border-[#d4c1a3]/40 space-y-1.5 text-xs text-[#6b6660]">
                    {member.phone && (
                      <div className="flex items-center gap-2">
                        <Phone className="w-3.5 h-3.5 text-[#6b6660]/70 shrink-0" />
                        <span className="font-mono text-[11px] text-[#111417]">{member.phone}</span>
                      </div>
                    )}
                    {member.email && (
                      <div className="flex items-center gap-2">
                        <Mail className="w-3.5 h-3.5 text-[#6b6660]/70 shrink-0" />
                        <span className="text-[11px] truncate">{member.email}</span>
                      </div>
                    )}
                  </div>

                  {/* Workload / Live Availability */}
                  <div className="mt-3 p-2.5 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#7a2e33]" />
                      <span className="text-[11px] font-bold text-[#111417]">
                        {activeJobs.length} Active Work{activeJobs.length === 1 ? '' : 's'}
                      </span>
                    </div>

                    {workload?.tone === 'heavy' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                        {workload.statusLabel || 'Over capacity'}
                      </span>
                    ) : workload?.tone === 'busy' || activeJobs.length > 0 ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                        {workload?.statusLabel || 'Queue busy'}
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                        Available now
                      </span>
                    )}
                  </div>

                  {/* Active Jobs Tags */}
                  {activeJobs.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      <span className="text-[10px] uppercase font-bold text-[#6b6660] tracking-wider block">
                        Assigned Queue:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {activeJobs.slice(0, 3).map(job => (
                          <span
                            key={job.id}
                            className="inline-flex items-center text-[10px] font-medium bg-white px-2 py-0.5 rounded-md border border-[#d4c1a3] text-[#111417]"
                          >
                            <span className="font-bold text-[#7a2e33] mr-1">{job.jobCode}</span>
                            <span className="truncate max-w-[110px]">{job.title}</span>
                          </span>
                        ))}
                        {activeJobs.length > 3 && (
                          <span className="text-[10px] text-[#6b6660] font-bold self-center">
                            +{activeJobs.length - 3} more
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Card Footer: Financials & Action */}
                <div className="pt-3 border-t border-[#d4c1a3]/40 flex items-center justify-between gap-2">
                  <div>
                    {!isSalaried && account ? (
                      <div className="text-[11px]">
                        <span className="text-[#6b6660]">Paid: </span>
                        <strong className="text-emerald-700">{formatINR(account.paid || 0)}</strong>
                      </div>
                    ) : (
                      <span className="text-[10px] font-medium text-[#6b6660]">In-House Salary</span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => handleOpenEditor(member.id)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#f9f8f6] hover:bg-[#7a2e33] hover:text-white border border-[#d4c1a3] text-xs font-bold text-[#111417] transition-all cursor-pointer"
                  >
                    <span>View History</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isAddMemberOpen && (
        <AddTeamMemberModal
          onClose={() => setIsAddMemberOpen(false)}
          defaultRole="Video Editor"
          defaultCategory="post-production"
        />
      )}
    </div>
  );
}
