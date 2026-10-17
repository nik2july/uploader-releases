import React, { useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceClientsPanel } from '../freelance/FreelanceClientsPanel';
import { formatINR } from '../../utils/formatters';
import { Building2, TrendingUp, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function PostProductionClientsScreen(): React.JSX.Element {
  const { freelanceClients, freelanceJobs, freelanceAccounts, freelanceJobEditorCost } = useApp();

  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    let totalCost = 0;

    for (const job of freelanceJobs) {
      totalBilled += Number(job.clientCharge) || 0;
      totalCollected += Number(job.clientPaidAmount) || 0;
      totalCost += freelanceJobEditorCost(job);
    }

    for (const [, account] of freelanceAccounts) {
      totalOutstanding += account.outstanding || 0;
    }

    const activeJobs = freelanceJobs.filter(j => j.stage !== 'completed').length;

    return {
      studiosCount: freelanceClients.length,
      totalBilled,
      totalCollected,
      totalOutstanding,
      activeJobs,
      profit: totalBilled - totalCost,
    };
  }, [freelanceClients, freelanceJobs, freelanceAccounts, freelanceJobEditorCost]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold font-serif text-[#111417]">Partner Studios & Clients</h2>
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded-full bg-[#d4c1a3]/40 text-[#7a2e33] border border-[#d4c1a3]">
              {metrics.studiosCount} Studios
            </span>
          </div>
          <p className="text-xs text-[#6b6660] mt-0.5">
            Commercial relationships, project volume, outstanding dues, and custom rate cards per studio.
          </p>
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Total Revenue Billed
            </span>
            <TrendingUp className="w-4 h-4 text-[#7a2e33]" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {formatINR(metrics.totalBilled)}
          </div>
          <div className="text-[11px] text-emerald-700 font-semibold mt-0.5">
            Collected: {formatINR(metrics.totalCollected)}
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Outstanding Receivables
            </span>
            <AlertTriangle className="w-4 h-4 text-amber-700" />
          </div>
          <div className="text-2xl font-extrabold text-amber-800 mt-1">
            {formatINR(metrics.totalOutstanding)}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Across active and delivered projects
          </div>
        </div>

        <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
              Active Workload
            </span>
            <Building2 className="w-4 h-4 text-blue-700" />
          </div>
          <div className="text-2xl font-extrabold text-[#111417] mt-1">
            {metrics.activeJobs}
          </div>
          <div className="text-[11px] text-[#6b6660] mt-0.5">
            Active deliverables across all studios
          </div>
        </div>
      </div>

      {/* Main Partner Studios Table */}
      <FreelanceClientsPanel />
    </div>
  );
}
