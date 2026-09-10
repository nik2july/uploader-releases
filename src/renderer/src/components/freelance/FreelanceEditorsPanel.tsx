import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { formatINR } from '../../utils/formatters';
import { isSalariedMember } from '../../utils/freelance';
import { calculateEditorWorkloads } from '../../utils/editorCapacity';
import { UserCircle2, ChevronRight, AlertTriangle } from 'lucide-react';

/**
 * Who is editing your freelance work, and what each of them has been paid.
 *
 * The counterpart to the studio roster. Editors are settled the same way studios pay —
 * an advance, or one transfer after several jobs — so what is owed to them is a fact
 * about the person, not about any single project.
 */

export const FreelanceEditorsPanel: React.FC = () => {
  const {
    team,
    freelanceJobs,
    freelanceEditorAccounts,
    setSelectedFreelanceEditorId,
    setActiveView,
  } = useApp();

  const rows = useMemo(() => {
    return team
      .map(member => {
        const jobs = freelanceJobs.filter(j => j.editorMemberId === member.id);
        const account = freelanceEditorAccounts.get(member.id);
        const delivered = jobs.filter(
          j => j.stage === 'completed' || j.stage === 'final_delivered'
        );
        return {
          member,
          jobs: jobs.length,
          active: jobs.filter(j => j.stage !== 'completed').length,
          delivered: delivered.length,
          // Work handed over that no payout has been split onto yet.
          unpaidDelivered: delivered.filter(j => !(account?.costByJob.get(j.id) || 0)).length,
          paid: account?.paid || 0,
          advance: account?.advance || 0,
        };
      })
      .filter(row => row.jobs > 0 || row.paid > 0)
      .sort((a, b) => b.jobs - a.jobs);
  }, [team, freelanceJobs, freelanceEditorAccounts]);

  const workloads = useMemo(() => calculateEditorWorkloads(freelanceJobs, team), [freelanceJobs, team]);
  const workloadMap = useMemo(() => new Map(workloads.map(w => [w.memberId, w])), [workloads]);

  const open = (id: number) => {
    setSelectedFreelanceEditorId(id);
    setActiveView('freelanceEditor');
  };

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-bold text-[#111417]">Editor Payouts</h3>
        <p className="text-[11px] text-[#6b6660]">
          What each editor has been paid for freelance work. Open one to log a payment and split it
          across the jobs it covers.
        </p>
      </div>

      {rows.length === 0 ? (
        <div className="bg-white rounded-xl p-8 border border-[#d4c1a3] text-center">
          <UserCircle2 className="w-8 h-8 text-[#d4c1a3] mx-auto mb-2" />
          <p className="text-xs font-semibold text-[#111417]">No freelance work assigned yet</p>
          <p className="text-[11px] text-[#6b6660] mt-1">
            Once a job is given to an editor, their payout account appears here.
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs overflow-x-auto">
          <table className="w-full text-left min-w-[720px]">
            <thead className="bg-[#f9f8f6] border-b border-[#d4c1a3]">
              <tr className="text-[10px] uppercase tracking-wider text-[#6b6660]">
                <th className="py-2.5 px-4 font-bold">Editor</th>
                <th className="py-2.5 px-4 font-bold">Capacity & Availability</th>
                <th className="py-2.5 px-4 font-bold">Jobs</th>
                <th className="py-2.5 px-4 font-bold">Delivered</th>
                <th className="py-2.5 px-4 font-bold text-right">Paid to Date</th>
                <th className="py-2.5 px-4 font-bold text-right">Advance Held</th>
                <th className="py-2.5 px-4 font-bold text-right">Unpaid Work</th>
                <th className="py-2.5 px-4 font-bold text-right"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map(row => (
                <tr
                  key={row.member.id}
                  onClick={() => open(row.member.id)}
                  className="text-xs hover:bg-[#f9f8f6]/60 cursor-pointer"
                >
                  <td className="py-3 px-4">
                    <div className="font-bold text-[#111417] hover:text-[#7a2e33]">{row.member.name}</div>
                    <div className="text-[10px] text-[#6b6660]">
                      {isSalariedMember(row.member) ? 'In-house (salaried)' : 'Freelancer (per event)'}
                    </div>
                  </td>
                  <td className="py-3 px-4">
                    {(() => {
                      const w = workloadMap.get(row.member.id);
                      if (!w) return <span className="text-[#6b6660]">—</span>;
                      return (
                        <div>
                          <div className="font-semibold text-[#111417] text-xs">{w.statusLabel}</div>
                          {w.tone !== 'available' && (
                            <div className="text-[10px] text-[#6b6660]">Next free: {w.nextAvailableDate}</div>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="py-3 px-4">
                    <span className="font-bold text-[#111417]">{row.jobs}</span>
                    {row.active > 0 && (
                      <span className="text-[10px] text-amber-800 font-semibold ml-1">
                        ({row.active} active)
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 font-semibold text-[#111417]">{row.delivered}</td>
                  <td className="py-3 px-4 text-right font-semibold text-[#111417]">
                    {formatINR(row.paid)}
                  </td>
                  <td
                    className={`py-3 px-4 text-right font-semibold ${
                      row.advance > 0 ? 'text-sky-700' : 'text-[#6b6660]'
                    }`}
                  >
                    {formatINR(row.advance)}
                  </td>
                  <td className="py-3 px-4 text-right">
                    {row.unpaidDelivered > 0 && !isSalariedMember(row.member) ? (
                      <span className="inline-flex items-center gap-1 text-amber-800 font-bold">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        {row.unpaidDelivered}
                      </span>
                    ) : (
                      <span className="text-[#6b6660]">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-right">
                    <ChevronRight className="w-3.5 h-3.5 text-[#6b6660] inline" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
