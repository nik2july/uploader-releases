import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { inrDigits } from '../../utils/formatters';
import {
  BarChart3,
  TrendingUp,
  IndianRupee,
  Briefcase,
  Users,
  Building2,
} from 'lucide-react';
import { BAAWARAY_FILMS_STUDIO_ID } from '../../lib/studioRepository';

export const FreelanceStatsScreen: React.FC = () => {
  const {
    freelanceJobs,
    freelanceClients,
    freelanceJobPayment,
    freelanceJobEditorCost,
  } = useApp();

  const [dateFilter, setDateFilter] = useState<'all' | 'year' | 'month'>('all');

  const currentYear = new Date().getFullYear();
  const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM

  const filteredJobs = useMemo(() => {
    return freelanceJobs.filter(job => {
      if (dateFilter === 'year') {
        return (job.createdAt || '').startsWith(String(currentYear));
      }
      if (dateFilter === 'month') {
        return (job.createdAt || '').startsWith(currentMonth);
      }
      return true;
    });
  }, [freelanceJobs, dateFilter, currentYear, currentMonth]);

  // Overall Financial Metrics
  const metrics = useMemo(() => {
    let totalBilled = 0;
    let totalCollected = 0;
    let totalEditorCost = 0;
    let totalEditorPaid = 0;
    let completedCount = 0;
    let inProgressCount = 0;
    let inReviewCount = 0;

    filteredJobs.forEach(job => {
      const charge = Number(job.clientCharge) || 0;
      const paymentInfo = freelanceJobPayment(job);
      const editorCost = freelanceJobEditorCost(job);
      const editorPaid = Number(job.editorPaidAmount) || 0;

      totalBilled += charge;
      totalCollected += paymentInfo.paid;
      totalEditorCost += editorCost;
      totalEditorPaid += editorPaid;

      if (job.stage === 'completed' || job.stage === 'final_delivered') {
        completedCount++;
      } else if (job.stage === 'sent_to_client' || job.stage === 'changes_received') {
        inReviewCount++;
      } else {
        inProgressCount++;
      }
    });

    const clientOutstanding = Math.max(0, totalBilled - totalCollected);
    const editorPending = Math.max(0, totalEditorCost - totalEditorPaid);
    const grossProfit = totalBilled - totalEditorCost;
    const profitMargin = totalBilled > 0 ? Math.round((grossProfit / totalBilled) * 100) : 0;

    return {
      totalBilled,
      totalCollected,
      clientOutstanding,
      totalEditorCost,
      totalEditorPaid,
      editorPending,
      grossProfit,
      profitMargin,
      totalJobs: filteredJobs.length,
      completedCount,
      inProgressCount,
      inReviewCount,
    };
  }, [filteredJobs, freelanceJobPayment, freelanceJobEditorCost]);

  // Studio breakdown
  const studioBreakdown = useMemo(() => {
    const map = new Map<string, {
      id: string;
      name: string;
      isInternal: boolean;
      jobCount: number;
      billed: number;
      collected: number;
      due: number;
    }>();

    // Ensure Baawaray Films studio row
    map.set(BAAWARAY_FILMS_STUDIO_ID, {
      id: BAAWARAY_FILMS_STUDIO_ID,
      name: 'BAAWARAY FILMS (Internal Studio)',
      isInternal: true,
      jobCount: 0,
      billed: 0,
      collected: 0,
      due: 0,
    });

    freelanceClients.forEach(c => {
      if (c.id !== BAAWARAY_FILMS_STUDIO_ID) {
        map.set(c.id, {
          id: c.id,
          name: c.name,
          isInternal: false,
          jobCount: 0,
          billed: 0,
          collected: 0,
          due: 0,
        });
      }
    });

    filteredJobs.forEach(job => {
      const isInternal = job.freelanceClientId === BAAWARAY_FILMS_STUDIO_ID || job.sourceCompany === 'baawaray-films';
      const studioId = isInternal ? BAAWARAY_FILMS_STUDIO_ID : (job.freelanceClientId || 'other');
      
      let row = map.get(studioId);
      if (!row) {
        row = {
          id: studioId,
          name: job.clientName || 'Other Studio',
          isInternal,
          jobCount: 0,
          billed: 0,
          collected: 0,
          due: 0,
        };
        map.set(studioId, row);
      }

      const charge = Number(job.clientCharge) || 0;
      const paymentInfo = freelanceJobPayment(job);

      row.jobCount += 1;
      row.billed += charge;
      row.collected += paymentInfo.paid;
      row.due += Math.max(0, charge - paymentInfo.paid);
    });

    return Array.from(map.values()).filter(s => s.jobCount > 0 || s.isInternal);
  }, [filteredJobs, freelanceClients, freelanceJobPayment]);

  // Service category breakdown
  const serviceBreakdown = useMemo(() => {
    const map = new Map<string, { name: string; count: number; billed: number; editorCost: number }>();

    filteredJobs.forEach(job => {
      const svc = job.serviceType || 'Unspecified';
      const entry = map.get(svc) || { name: svc, count: 0, billed: 0, editorCost: 0 };
      entry.count += 1;
      entry.billed += Number(job.clientCharge) || 0;
      entry.editorCost += freelanceJobEditorCost(job);
      map.set(svc, entry);
    });

    return Array.from(map.values()).sort((a, b) => b.billed - a.billed);
  }, [filteredJobs, freelanceJobEditorCost]);

  return (
    <div className="space-y-6 pb-16 p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-2xl bg-[#7a2e33] text-[#f9f8f6] flex items-center justify-center shadow-xs">
            <BarChart3 className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold font-serif text-[#111417]">
              Post-Production & Freelance Stats
            </h1>
            <p className="text-xs text-[#6b6660]">
              Complete studio revenue, editor payouts, profit margins, and performance metrics
            </p>
          </div>
        </div>

        {/* Date Filter Pills */}
        <div className="flex items-center bg-[#f9f8f6] p-1 rounded-xl border border-[#d4c1a3] w-fit">
          {([
            { id: 'all', label: 'All Time' },
            { id: 'year', label: `Year ${currentYear}` },
            { id: 'month', label: 'This Month' },
          ] as const).map(f => (
            <button
              key={f.id}
              onClick={() => setDateFilter(f.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                dateFilter === f.id
                  ? 'bg-[#7a2e33] text-white shadow-xs'
                  : 'text-[#6b6660] hover:text-[#111417]'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Top Financial KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Billed */}
        <div className="bg-white p-4 rounded-2xl border border-[#d4c1a3] shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[#6b6660]">
            <span className="text-xs font-bold uppercase tracking-wider">Client Revenue</span>
            <div className="p-2 rounded-xl bg-emerald-50 text-emerald-700">
              <IndianRupee className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#111417]">
            ₹{inrDigits(metrics.totalBilled)}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#d4c1a3]/40">
            <span className="text-emerald-700 font-semibold">
              Recv: ₹{inrDigits(metrics.totalCollected)}
            </span>
            <span className="text-amber-800 font-medium">
              Due: ₹{inrDigits(metrics.clientOutstanding)}
            </span>
          </div>
        </div>

        {/* Editor Payouts */}
        <div className="bg-white p-4 rounded-2xl border border-[#d4c1a3] shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[#6b6660]">
            <span className="text-xs font-bold uppercase tracking-wider">Editor Payouts</span>
            <div className="p-2 rounded-xl bg-amber-50 text-amber-700">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#111417]">
            ₹{inrDigits(metrics.totalEditorCost)}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#d4c1a3]/40">
            <span className="text-emerald-700 font-semibold">
              Paid: ₹{inrDigits(metrics.totalEditorPaid)}
            </span>
            <span className="text-amber-800 font-medium">
              Owed: ₹{inrDigits(metrics.editorPending)}
            </span>
          </div>
        </div>

        {/* Gross Profit & Margin */}
        <div className="bg-white p-4 rounded-2xl border border-[#d4c1a3] shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[#6b6660]">
            <span className="text-xs font-bold uppercase tracking-wider">Gross Profit</span>
            <div className="p-2 rounded-xl bg-blue-50 text-blue-700">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#111417]">
            ₹{inrDigits(metrics.grossProfit)}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#d4c1a3]/40">
            <span className="text-[#6b6660] font-medium">Profit Margin</span>
            <span className="font-bold text-blue-800 bg-blue-50 px-2 py-0.5 rounded-md">
              {metrics.profitMargin}%
            </span>
          </div>
        </div>

        {/* Work Volume */}
        <div className="bg-white p-4 rounded-2xl border border-[#d4c1a3] shadow-2xs space-y-2">
          <div className="flex items-center justify-between text-[#6b6660]">
            <span className="text-xs font-bold uppercase tracking-wider">Total Projects</span>
            <div className="p-2 rounded-xl bg-purple-50 text-purple-700">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-extrabold text-[#111417]">
            {metrics.totalJobs}
          </div>
          <div className="flex items-center justify-between text-xs pt-1 border-t border-[#d4c1a3]/40">
            <span className="text-emerald-700 font-semibold">
              {metrics.completedCount} Delivered
            </span>
            <span className="text-sky-700 font-medium">
              {metrics.inProgressCount + metrics.inReviewCount} Active
            </span>
          </div>
        </div>
      </div>

      {/* Grid: Partner Studios & Service Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Partner Studios Breakdown */}
        <div className="lg:col-span-2 bg-white rounded-2xl border border-[#d4c1a3] p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-sm font-bold text-[#111417]">Partner Studios Financials</h3>
            </div>
            <span className="text-xs text-[#6b6660]">
              {studioBreakdown.length} Studio{studioBreakdown.length === 1 ? '' : 's'}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead>
                <tr className="border-b border-[#d4c1a3] text-[#6b6660] uppercase text-[10px] tracking-wider">
                  <th className="py-2.5 px-3">Studio Name</th>
                  <th className="py-2.5 px-3 text-center">Projects</th>
                  <th className="py-2.5 px-3 text-right">Billed</th>
                  <th className="py-2.5 px-3 text-right">Collected</th>
                  <th className="py-2.5 px-3 text-right">Outstanding</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#d4c1a3]/30">
                {studioBreakdown.map(s => (
                  <tr key={s.id} className="hover:bg-[#f9f8f6]/50 transition-colors">
                    <td className="py-3 px-3">
                      <div className="font-bold text-[#111417] flex items-center gap-1.5">
                        <span>{s.name}</span>
                        {s.isInternal && (
                          <span className="text-[9px] px-1.5 py-0.2 rounded bg-stone-100 text-stone-700 font-mono">
                            INTERNAL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 text-center font-semibold text-[#6b6660]">
                      {s.jobCount}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-[#111417]">
                      ₹{inrDigits(s.billed)}
                    </td>
                    <td className="py-3 px-3 text-right font-semibold text-emerald-700">
                      ₹{inrDigits(s.collected)}
                    </td>
                    <td className="py-3 px-3 text-right font-bold text-amber-800">
                      {s.due > 0 ? `₹${inrDigits(s.due)}` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Deliverables / Service Category Breakdown */}
        <div className="bg-white rounded-2xl border border-[#d4c1a3] p-5 shadow-2xs space-y-4">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-sm font-bold text-[#111417]">Services & Deliverables</h3>
          </div>

          <div className="space-y-3">
            {serviceBreakdown.length === 0 ? (
              <p className="text-xs text-[#6b6660] italic">No service data recorded yet.</p>
            ) : (
              serviceBreakdown.map(svc => {
                const margin = svc.billed - svc.editorCost;
                return (
                  <div
                    key={svc.name}
                    className="p-3 bg-[#f9f8f6] rounded-xl border border-[#d4c1a3]/60 space-y-1.5"
                  >
                    <div className="flex items-center justify-between text-xs font-bold text-[#111417]">
                      <span>{svc.name}</span>
                      <span className="text-[#6b6660] font-normal">{svc.count} work(s)</span>
                    </div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-[#6b6660]">Billed: ₹{inrDigits(svc.billed)}</span>
                      <span className="text-emerald-700 font-semibold">
                        Margin: ₹{inrDigits(margin)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
