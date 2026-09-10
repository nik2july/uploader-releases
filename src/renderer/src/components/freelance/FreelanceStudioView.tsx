import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob } from '../../types';
import {
  formatDate,
  formatINR,
  getDueDateStatus,
  getFreelanceStageMeta,
} from '../../utils/formatters';
import { FREELANCE_SERVICES, unitNoun } from '../../utils/freelancePricing';
import { freelanceDueDate } from '../../utils/freelance';
import { buildStudioAccount, buildStatementText } from '../../utils/freelanceAccount';
import { formatInternational, whatsAppLink } from '../../utils/phone';
import { FreelanceClientForm } from './FreelanceClientForm';
import { NewFreelanceJobModal } from '../modals/NewFreelanceJobModal';
import { FreelanceJobDetailModal } from '../modals/FreelanceJobDetailModal';
import {
  ArrowLeft,
  Building2,
  MessageCircle,
  Pencil,
  Plus,
  AlertTriangle,
  ChevronRight,
  Receipt,
  Copy,
  X,
  Trash2,
  Briefcase,
  ArrowUpRight,
  ArrowDownLeft,
  Layers,
  TrendingUp,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';

/**
 * Everything one partner studio amounts to, on its own page.
 *
 * The roster answers "which studio is worth the work"; this answers everything you
 * would ask about one of them — what they are holding, what is late, what they owe,
 * what they have ever paid, what they habitually buy and at what rate. Money and work
 * sit together on purpose: a balance means something different when the film is still
 * with the editor than when it was delivered a month ago, and only the second kind
 * needs chasing.
 */

const UNLINKED = 'unlinked';

type WorkFilter = 'active' | 'completed' | 'all';

/** Delivered or finished — the work is off the studio's plate, so only money is left. */
function isFinished(job: FreelanceJob): boolean {
  return job.stage === 'completed' || job.stage === 'final_delivered';
}

function balanceOf(job: FreelanceJob): number {
  return Math.max(0, (Number(job.clientCharge) || 0) - (Number(job.clientPaidAmount) || 0));
}

function daysBetween(from?: string, to?: string): number | undefined {
  if (!from || !to) return undefined;
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return undefined;
  return Math.max(0, Math.round((b - a) / 86400000));
}

export const FreelanceStudioView: React.FC = () => {
  const {
    freelanceClients,
    freelanceJobs,
    selectedFreelanceClientId,
    setSelectedFreelanceClientId,
    setActiveView,
    freelanceAccounts,
    addFreelanceAccountPayment,
    deleteFreelanceAccountPayment,
    freelanceJobEditorCost,
    updateFreelanceClient,
    studioSettings,
  } = useApp();

  const [workFilter, setWorkFilter] = useState<WorkFilter>('active');
  const [isEditing, setIsEditing] = useState(false);
  const [isNewJobOpen, setIsNewJobOpen] = useState(false);
  const [editingJob, setEditingJob] = useState<FreelanceJob | null>(null);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [isLoggingPayment, setIsLoggingPayment] = useState(false);
  const [confirmDeletePaymentId, setConfirmDeletePaymentId] = useState<string | null>(null);
  const [statementCopied, setStatementCopied] = useState(false);
  const [previewingBill, setPreviewingBill] = useState(false);
  const [rateDraft, setRateDraft] = useState<Record<string, number | ''>>({});

  const client = freelanceClients.find(c => c.id === selectedFreelanceClientId);
  const isUnlinked = selectedFreelanceClientId === UNLINKED;
  const label = client?.name || (isUnlinked ? 'One-off / not linked to a studio' : 'Studio');

  const jobs = useMemo(
    () =>
      isUnlinked
        ? freelanceJobs.filter(j => !j.freelanceClientId)
        : freelanceJobs.filter(j => j.freelanceClientId === selectedFreelanceClientId),
    [freelanceJobs, selectedFreelanceClientId, isUnlinked]
  );

  /**
   * The card as it is being edited. Seeded from the studio and re-seeded whenever a
   * different studio is opened, so the boxes never show the last one's rates.
   */
  useEffect(() => {
    const stored = client?.rateCard || {};
    setRateDraft(
      Object.fromEntries(
        FREELANCE_SERVICES.map(s => [s.name, typeof stored[s.name] === 'number' ? stored[s.name] : ''])
      )
    );
  }, [client?.id, client?.rateCard]);

  const rateCardDirty = FREELANCE_SERVICES.some(s => {
    const stored = client?.rateCard?.[s.name];
    const draft = rateDraft[s.name];
    return (typeof stored === 'number' ? stored : '') !== (draft === '' ? '' : Number(draft));
  });

  const saveRateCard = () => {
    if (!client) return;
    const next: Record<string, number> = {};
    FREELANCE_SERVICES.forEach(s => {
      const value = Number(rateDraft[s.name]);
      if (value > 0) next[s.name] = value;
    });
    updateFreelanceClient(client.id, { rateCard: next });
  };

  const goBack = () => {
    setSelectedFreelanceClientId(null);
    setActiveView('freelance');
  };

  /**
   * What this studio owes and what their money has already covered.
   *
   * One-off work has no account behind it, so it is totalled from the payments
   * recorded on the jobs themselves — the only place that money was ever entered.
   */
  const account = useMemo(
    () =>
      (client ? freelanceAccounts.get(client.id) : undefined) ?? buildStudioAccount(jobs, []),
    [client, freelanceAccounts, jobs]
  );

  const balanceOfJob = (job: FreelanceJob) =>
    account.allocations.get(job.id)?.balance ?? balanceOf(job);
  const paidOnJob = (job: FreelanceJob) =>
    account.allocations.get(job.id)?.paid ?? (Number(job.clientPaidAmount) || 0);

  const totals = useMemo(() => {
    const editorCost = jobs.reduce((a, j) => a + freelanceJobEditorCost(j), 0);
    // What an editor cost is what they were paid — there is no agreed figure ahead of
    // the payout, so the two are the same number.
    const editorPaid = editorCost;
    return {
      charged: account.billed,
      received: account.received,
      outstanding: account.outstanding,
      credit: account.credit,
      editorCost,
      editorPaid,
      profit: account.billed - editorCost,
      margin: account.billed > 0 ? Math.round(((account.billed - editorCost) / account.billed) * 100) : 0,
      active: jobs.filter(j => j.stage !== 'completed').length,
      unpaidJobs: [...account.allocations.values()].filter(a => a.balance > 0).length,
    };
  }, [jobs, account]);

  /**
   * How this studio behaves as a customer, rather than what they are worth today.
   *
   * Turnaround is measured only on work actually delivered, and lateness against the
   * date that was promised — an average over jobs still in progress would flatter or
   * damn the studio for work nobody has finished.
   */
  const relationship = useMemo(() => {
    const delivered = jobs.filter(j => isFinished(j));
    const turnarounds = delivered
      .map(j => daysBetween(j.dataReceivedDate, j.finalDeliveredDate || j.completedDate))
      .filter((d): d is number => typeof d === 'number');
    const onTime = delivered.filter(
      j => (j.finalDeliveredDate || j.completedDate || '') <= (j.dueDate || '')
    ).length;
    const paymentDates = [
      ...(client?.payments || []).map(p => p.date),
      ...jobs.flatMap(j => (j.clientPayments || []).map(p => p.date)),
    ]
      .filter(Boolean)
      .sort();
    return {
      avgJobValue: jobs.length > 0 ? Math.round(totals.charged / jobs.length) : 0,
      avgTurnaround:
        turnarounds.length > 0
          ? Math.round(turnarounds.reduce((a, b) => a + b, 0) / turnarounds.length)
          : undefined,
      deliveredCount: delivered.length,
      onTime,
      lastPayment: paymentDates[paymentDates.length - 1],
    };
  }, [jobs, client, totals.charged]);

  const overdueJobs = useMemo(
    () => jobs.filter(j => !isFinished(j) && getDueDateStatus(freelanceDueDate(j)).isOverdue),
    [jobs]
  );
  const owedOnDelivered = useMemo(
    () => jobs.filter(j => isFinished(j) && balanceOfJob(j) > 0),
    [jobs, account]
  );
  const owedOnDeliveredTotal = owedOnDelivered.reduce((a, j) => a + balanceOfJob(j), 0);

  /**
   * Every rupee this studio has paid, newest first — the account ledger plus anything
   * recorded on a job before payments moved to the account, so the history stays whole.
   */
  const ledger = useMemo(() => {
    const onAccount = (client?.payments || []).map(p => ({
      id: p.id,
      date: p.date,
      amount: Number(p.amount) || 0,
      mode: p.mode,
      reference: p.reference,
      note: p.notes,
      onAccount: true,
      jobLabel: undefined as string | undefined,
    }));
    const onJobs = jobs.flatMap(j =>
      (j.clientPayments || []).map(p => ({
        id: p.id,
        date: p.date,
        amount: Number(p.amount) || 0,
        mode: p.mode,
        reference: p.reference,
        note: p.notes,
        onAccount: false,
        jobLabel: `${j.jobCode} — ${j.title}`,
      }))
    );
    return [...onAccount, ...onJobs].sort((a, b) =>
      String(b.date || '').localeCompare(String(a.date || ''))
    );
  }, [client, jobs]);

  /**
   * The cost side of the same work, so the profit figure can be checked: what each of
   * their jobs has cost in editor pay, from the payouts split onto it.
   */
  const payouts = useMemo(
    () =>
      jobs
        .map(job => ({ job, amount: freelanceJobEditorCost(job) }))
        .filter(row => row.amount > 0)
        .sort((a, b) => b.amount - a.amount),
    [jobs, freelanceJobEditorCost]
  );

  /**
   * What this studio actually buys, and what they have been charged for it.
   *
   * The rate range is the useful part: it is what you look at before quoting them the
   * next job, and it is the only place the studio's own price history exists.
   */
  const serviceMix = useMemo(() => {
    const byService = new Map<
      string,
      { jobs: number; charged: number; rates: number[]; basis?: string }
    >();
    jobs.forEach(j => {
      const key = String(j.serviceType || '—');
      const row = byService.get(key) || { jobs: 0, charged: 0, rates: [] as number[] };
      row.jobs += 1;
      row.charged += Number(j.clientCharge) || 0;
      if (j.pricing?.rate) {
        row.rates.push(j.pricing.rate);
        row.basis = j.pricing.basis;
      }
      byService.set(key, row);
    });
    return [...byService.entries()]
      .map(([name, row]) => ({ name, ...row }))
      .sort((a, b) => b.charged - a.charged);
  }, [jobs]);

  /** Billed against received, month by month — the shape of the relationship. */
  const monthly = useMemo(() => {
    const months = new Map<string, { billed: number; received: number }>();
    const bump = (iso: string | undefined, key: 'billed' | 'received', amount: number) => {
      if (!iso) return;
      const month = iso.slice(0, 7);
      const row = months.get(month) || { billed: 0, received: 0 };
      row[key] += amount;
      months.set(month, row);
    };
    jobs.forEach(j => {
      bump(j.dataReceivedDate || j.createdAt, 'billed', Number(j.clientCharge) || 0);
      (j.clientPayments || []).forEach(p => bump(p.date, 'received', Number(p.amount) || 0));
    });
    (client?.payments || []).forEach(p => bump(p.date, 'received', Number(p.amount) || 0));
    const rows = [...months.entries()]
      .map(([month, row]) => ({ month, ...row }))
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-6);
    const peak = Math.max(1, ...rows.map(r => Math.max(r.billed, r.received)));
    return { rows, peak };
  }, [jobs, client]);

  const visibleJobs = useMemo(() => {
    const list =
      workFilter === 'active'
        ? jobs.filter(j => j.stage !== 'completed')
        : workFilter === 'completed'
        ? jobs.filter(j => j.stage === 'completed')
        : jobs;
    return [...list].sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')));
  }, [jobs, workFilter]);

  /**
   * The bill, as a studio would want to read it: every job with what it cost and what
   * is still owed on it, then the payments that have come in, then the one number they
   * asked for. Written out in full rather than "you owe ₹38,308", because a partner
   * studio pays against jobs they can recognise, and a total on its own invites a
   * question rather than a transfer.
   */
  const buildStatement = (): string => buildStatementText(studioSettings?.studioName || 'Baawaray Films', client, jobs, ledger, account);

  const statementLink = whatsAppLink(client?.phone, client?.dialCode, buildStatement());

  /**
   * Copy, with the bill on screen either way.
   *
   * The clipboard can refuse — an unfocused window, a browser that only allows it on a
   * real gesture — and a button that silently does nothing is worse than one that does
   * not exist. The statement is shown in full and selectable, so there is always a way
   * to get it out, and it doubles as a chance to read the bill before it goes.
   */
  const handleCopyStatement = async () => {
    try {
      await navigator.clipboard.writeText(buildStatement());
      setStatementCopied(true);
      window.setTimeout(() => setStatementCopied(false), 2500);
    } catch {
      setStatementCopied(false);
    }
  };

  if (!client && !isUnlinked) {
    return (
      <div className="bg-white rounded-xl p-8 border border-[#d4c1a3] text-center">
        <Building2 className="w-8 h-8 text-[#d4c1a3] mx-auto mb-2" />
        <p className="text-xs font-semibold text-[#111417]">This studio is no longer on your roster</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-3 px-4 py-2 rounded-xl bg-[#7a2e33] text-white text-xs font-bold cursor-pointer"
        >
          Back to Partner Studios
        </button>
      </div>
    );
  }

  const tile = (caption: string, value: string, tone: string, footnote?: React.ReactNode) => (
    <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
      <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">{caption}</span>
      <div className={`text-xl font-extrabold mt-0.5 ${tone}`}>{value}</div>
      {footnote && <div className="text-[11px] font-medium text-[#6b6660] mt-1">{footnote}</div>}
    </div>
  );

  const stat = (caption: string, value: string, hint?: string) => (
    <div className="px-4 py-3">
      <div className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">{caption}</div>
      <div className="text-sm font-bold text-[#111417] mt-0.5">{value}</div>
      {hint && <div className="text-[10px] text-[#6b6660]">{hint}</div>}
    </div>
  );

  return (
    <div className="space-y-6">
      <button
        type="button"
        onClick={goBack}
        className="flex items-center gap-1.5 text-xs font-semibold text-[#6b6660] hover:text-[#7a2e33] cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        All Partner Studios
      </button>

      {/* Identity & actions */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-[#7a2e33] flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-[#f9f8f6]" />
            </div>
            <div className="min-w-0">
              <h2 className="text-xl font-bold font-serif text-[#111417]">{label}</h2>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b6660] mt-1">
                {client?.contactPerson && <span className="font-semibold">{client.contactPerson}</span>}
                {client?.phone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3" />
                    {formatInternational(client.phone, client.dialCode)}
                  </span>
                )}
                {client?.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3" />
                    {client.email}
                  </span>
                )}
                {client?.city && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {client.city}
                  </span>
                )}
                {client?.gstin && <span className="font-mono">GSTIN {client.gstin}</span>}
                <span>
                  Working together since{' '}
                  {formatDate(client?.createdAt || jobs[jobs.length - 1]?.createdAt, 'medium')}
                </span>
              </div>
              {isUnlinked && (
                <p className="text-[11px] text-[#6b6660] mt-1.5 max-w-xl leading-snug">
                  Work billed to someone who was never added to the roster. Linking these jobs to a
                  studio keeps their billing and balance together.
                </p>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {client && (
              <button
                type="button"
                onClick={() => {
                  setEditingJob(null);
                  setIsNewJobOpen(true);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7a2e33] text-[#f9f8f6] text-xs font-bold hover:bg-[#5a2226] cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                New Job for {client.name.split(' ')[0]}
              </button>
            )}
              {/* The bill, ready to send. Always here rather than only when something is
                overdue: studios ask for a statement so they can pay, which is usually
                before anyone is chasing them. */}
            {client && (
              <>
                {statementLink ? (
                  <a
                    href={statementLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                    title={`Send to ${formatInternational(client.phone, client.dialCode)}`}
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send Bill on WhatsApp
                  </a>
                ) : (
                  <span
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-dashed border-[#d4c1a3] text-xs font-bold text-[#6b6660]"
                    title="Add their WhatsApp number under Edit Studio to send it directly"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    No WhatsApp number saved
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setPreviewingBill(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-bold text-[#111417] hover:border-[#7a2e33] cursor-pointer"
                  title="Read the bill, and copy it to send anywhere"
                >
                  <Copy className="w-3.5 h-3.5" />
                  View Bill
                </button>
              </>
            )}
            {client && (
              <button
                type="button"
                onClick={() => setIsEditing(v => !v)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-bold text-[#111417] hover:border-[#7a2e33] cursor-pointer"
              >
                <Pencil className="w-3.5 h-3.5" />
                Edit Studio
              </button>
            )}
          </div>
        </div>

        {isEditing && client && (
          <div className="mt-4">
            <FreelanceClientForm client={client} onClose={() => setIsEditing(false)} />
          </div>
        )}
      </div>

      {/*
        The agreed rates, directly under the studio they belong to.
        This began life at the foot of the page beside the charts, which is where you
        put something to be read and not where you look for something to set — and a
        rate card is looked for.
      */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#d4c1a3]/60">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">Rate Card</h3>
            <span className="text-[11px] text-[#6b6660] italic hidden sm:inline">
              filled in automatically on their next job
            </span>
          </div>
          {client && rateCardDirty && (
            <button
              type="button"
              onClick={saveRateCard}
              className="px-3 py-1.5 rounded-lg bg-[#7a2e33] text-white text-[11px] font-bold hover:bg-[#5a2226] cursor-pointer"
            >
              Save Rates
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 divide-x divide-y lg:divide-y-0 divide-[#d4c1a3]/50">
          {FREELANCE_SERVICES.map(service => {
            const bought = serviceMix.find(m => m.name === service.name);
            const lo = bought?.rates.length ? Math.min(...bought.rates) : undefined;
            const hi = bought?.rates.length ? Math.max(...bought.rates) : undefined;
            return (
              <div key={service.name} className="px-5 py-3">
                <div className="text-xs font-bold text-[#111417]">{service.name}</div>
                <div className="flex items-center gap-1.5 mt-1.5">
                  <span className="text-xs font-bold text-[#6b6660]">₹</span>
                  <input
                    type="number"
                    min="0"
                    disabled={!client}
                    value={rateDraft[service.name] ?? ''}
                    onChange={e =>
                      setRateDraft(d => ({
                        ...d,
                        [service.name]: e.target.value === '' ? '' : Number(e.target.value),
                      }))
                    }
                    placeholder="—"
                    className="w-24 px-2.5 py-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg text-xs font-bold text-[#111417] text-right focus:outline-none focus:border-[#7a2e33] disabled:opacity-50"
                  />
                </div>
                <div className="text-[10px] text-[#6b6660] mt-1 leading-snug">
                  {service.rateSuffix}
                  {lo !== undefined && (
                    <>
                      <br />
                      billed{' '}
                      {lo === hi
                        ? `₹${lo.toLocaleString('en-IN')}`
                        : `₹${lo.toLocaleString('en-IN')}–₹${hi!.toLocaleString('en-IN')}`}{' '}
                      over {bought!.jobs} {bought!.jobs === 1 ? 'job' : 'jobs'}
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {serviceMix.filter(row => !FREELANCE_SERVICES.some(x => x.name === row.name)).length > 0 && (
          <div className="px-5 py-2.5 border-t border-[#d4c1a3]/40 text-[10px] text-[#6b6660]">
            Also bought under older categories with no rate:{' '}
            {serviceMix
              .filter(row => !FREELANCE_SERVICES.some(x => x.name === row.name))
              .map(row => `${row.name} (${row.jobs})`)
              .join(', ')}
          </div>
        )}

        {!client && (
          <p className="px-5 py-2.5 text-[10px] text-[#6b6660] border-t border-[#d4c1a3]/40">
            One-off work has no studio to hold rates against.
          </p>
        )}
      </div>

      {/* Money at a glance */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tile(
          'Total Billed',
          formatINR(totals.charged),
          'text-[#111417]',
          `${jobs.length} ${jobs.length === 1 ? 'job' : 'jobs'} · ${totals.active} active`
        )}
        {tile(
          'Received',
          formatINR(totals.received),
          'text-emerald-700',
          `${ledger.length} ${ledger.length === 1 ? 'payment' : 'payments'}`
        )}
        {tile(
          'Outstanding',
          formatINR(totals.outstanding),
          totals.outstanding > 0 ? 'text-amber-800' : 'text-[#6b6660]',
          totals.credit > 0
            ? `${formatINR(totals.credit)} paid ahead, waiting on work`
            : totals.unpaidJobs > 0
            ? `across ${totals.unpaidJobs} unpaid ${totals.unpaidJobs === 1 ? 'job' : 'jobs'}`
            : 'All settled'
        )}
        {tile(
          'Studio Profit',
          formatINR(totals.profit),
          totals.profit >= 0 ? 'text-emerald-700' : 'text-rose-700',
          `${totals.margin}% margin · editor cost ${formatINR(totals.editorCost)}`
        )}
      </div>

      {/* How they behave as a customer */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs grid grid-cols-2 md:grid-cols-4 divide-x divide-y md:divide-y-0 divide-[#d4c1a3]/50">
        {stat('Average Job', formatINR(relationship.avgJobValue), `${jobs.length} logged`)}
        {stat(
          'Average Turnaround',
          relationship.avgTurnaround !== undefined ? `${relationship.avgTurnaround} days` : '—',
          relationship.deliveredCount > 0
            ? `over ${relationship.deliveredCount} delivered`
            : 'nothing delivered yet'
        )}
        {stat(
          'Delivered On Time',
          relationship.deliveredCount > 0
            ? `${relationship.onTime} of ${relationship.deliveredCount}`
            : '—',
          'against the promised date'
        )}
        {stat(
          'Last Payment',
          relationship.lastPayment ? formatDate(relationship.lastPayment, 'medium') : '—',
          ledger.length > 0 ? `${formatINR(ledger[0].amount)} received` : 'nothing yet'
        )}
      </div>

      {/* What needs doing about this studio, if anything */}
      {(overdueJobs.length > 0 || owedOnDelivered.length > 0) && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-700" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-amber-900">Needs Attention</h3>
          </div>
          <ul className="space-y-1 text-[11px] text-amber-900 leading-snug">
            {overdueJobs.length > 0 && (
              <li>
                <strong>{overdueJobs.length}</strong> {overdueJobs.length === 1 ? 'job is' : 'jobs are'}{' '}
                past the date promised — {overdueJobs.map(j => j.jobCode).join(', ')}.
              </li>
            )}
            {owedOnDelivered.length > 0 && (
              <li>
                <strong>{formatINR(owedOnDeliveredTotal)}</strong> unpaid on work already delivered (
                {owedOnDelivered.map(j => j.jobCode).join(', ')}).
              </li>
            )}
          </ul>
          {statementLink && totals.outstanding > 0 && (
            <a
              href={statementLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              Send statement on WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Their work */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#d4c1a3]/60">
          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">Their Work</h3>
          </div>
          <div className="flex items-center bg-[#f9f8f6] p-1 rounded-xl border border-[#d4c1a3]">
            {([
              { id: 'active', label: `Active (${jobs.filter(j => j.stage !== 'completed').length})` },
              { id: 'completed', label: `Completed (${jobs.filter(j => j.stage === 'completed').length})` },
              { id: 'all', label: `All (${jobs.length})` },
            ] as const).map(f => (
              <button
                key={f.id}
                type="button"
                onClick={() => setWorkFilter(f.id)}
                className={`px-3 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer ${
                  workFilter === f.id ? 'bg-[#7a2e33] text-white shadow-xs' : 'text-[#6b6660] hover:text-[#111417]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {visibleJobs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">Nothing here yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
              <thead className="bg-[#f9f8f6] border-b border-[#d4c1a3]">
                <tr className="text-[10px] uppercase tracking-wider text-[#6b6660]">
                  <th className="py-2.5 px-4 font-bold">Job</th>
                  <th className="py-2.5 px-4 font-bold">Priced</th>
                  <th className="py-2.5 px-4 font-bold">Stage</th>
                  <th className="py-2.5 px-4 font-bold">Due</th>
                  <th className="py-2.5 px-4 font-bold text-right">Charged</th>
                  <th className="py-2.5 px-4 font-bold text-right">Received</th>
                  <th className="py-2.5 px-4 font-bold text-right">Balance</th>
                  <th className="py-2.5 px-4 font-bold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {visibleJobs.map(job => {
                  const stage = getFreelanceStageMeta(job.stage);
                  const due = getDueDateStatus(freelanceDueDate(job));
                  const balance = balanceOfJob(job);
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setDetailJobId(job.id)}
                      className="text-xs hover:bg-[#f9f8f6]/60 cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="font-mono text-[10px] font-bold text-[#7a2e33]">{job.jobCode}</div>
                        <div className="font-bold text-[#111417] line-clamp-1">{job.title}</div>
                        <div className="text-[10px] text-[#6b6660]">
                          {job.serviceType} · {job.editorName}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-[10px] text-[#6b6660]">
                        {job.pricing
                          ? `${job.pricing.billableUnits} ${unitNoun(
                              job.pricing.basis,
                              job.pricing.billableUnits
                            )} × ₹${job.pricing.rate.toLocaleString('en-IN')}`
                          : '—'}
                      </td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${stage.badgeClass}`}>
                          {stage.label}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-[#111417]">
                          {formatDate(freelanceDueDate(job), 'short')}
                        </div>
                        {!isFinished(job) && (
                          <div className={`text-[10px] font-semibold ${due.color}`}>{due.text}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#111417]">
                        {formatINR(job.clientCharge || 0)}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-emerald-700">
                        {formatINR(paidOnJob(job))}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          balance > 0 ? 'text-amber-800' : 'text-[#6b6660]'
                        }`}
                      >
                        {formatINR(balance)}
                      </td>
                      <td className="py-3 px-4">
                        {/* Editing is reached from the row itself as well as from
                            inside the job: a job changes after it is logged — more
                            photos arrive, a rate is renegotiated — and hunting for it
                            two clicks deep made that feel impossible. */}
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setEditingJob(job);
                              setIsNewJobOpen(true);
                            }}
                            className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#7a2e33] hover:bg-[#f9f8f6] cursor-pointer"
                            aria-label={`Edit ${job.jobCode}`}
                            title="Edit this job — title, service, rate, quantity, dates"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <ChevronRight className="w-3.5 h-3.5 text-[#6b6660]" />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* The money, both directions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-[#d4c1a3]/60">
            <div className="flex items-center gap-2">
              <ArrowDownLeft className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                Studio Account
              </h3>
            </div>
            {client && (
              <button
                type="button"
                onClick={() => setIsLoggingPayment(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Log Payment
              </button>
            )}
          </div>

          {/* The account in one line: billed, in, and where that leaves them. */}
          <div className="grid grid-cols-3 divide-x divide-[#d4c1a3]/50 border-b border-[#d4c1a3]/60">
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">Billed</div>
              <div className="text-sm font-bold text-[#111417]">{formatINR(account.billed)}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">Received</div>
              <div className="text-sm font-bold text-emerald-700">{formatINR(account.received)}</div>
            </div>
            <div className="px-4 py-3">
              <div className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">
                {account.credit > 0 ? 'In Credit' : 'Balance Due'}
              </div>
              <div
                className={`text-sm font-bold ${
                  account.credit > 0
                    ? 'text-sky-700'
                    : account.outstanding > 0
                    ? 'text-amber-800'
                    : 'text-[#6b6660]'
                }`}
              >
                {formatINR(account.credit > 0 ? account.credit : account.outstanding)}
              </div>
            </div>
          </div>

          {isLoggingPayment && client && (
            <form
              onSubmit={e => {
                e.preventDefault();
                const data = new FormData(e.currentTarget as HTMLFormElement);
                const amount = Number(data.get('amount')) || 0;
                if (amount <= 0) return;
                addFreelanceAccountPayment(client.id, {
                  amount,
                  date: String(data.get('date') || new Date().toISOString().split('T')[0]),
                  mode: String(data.get('mode') || 'UPI'),
                  reference: String(data.get('reference') || '').trim(),
                  notes: String(data.get('notes') || '').trim(),
                });
                setIsLoggingPayment(false);
              }}
              className="p-4 border-b border-[#d4c1a3]/60 bg-[#f9f8f6] space-y-3"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                    Amount Received ₹
                  </label>
                  <input
                    name="amount"
                    type="number"
                    min="1"
                    required
                    autoFocus
                    placeholder="e.g. 25000"
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-sm font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                    Date
                  </label>
                  <input
                    name="date"
                    type="date"
                    defaultValue={new Date().toISOString().split('T')[0]}
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                    Mode
                  </label>
                  <select
                    name="mode"
                    defaultValue="UPI"
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  >
                    {['UPI', 'Bank Transfer', 'GPay', 'PhonePe', 'Cheque', 'Cash', 'Card'].map(m => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                    Reference (Optional)
                  </label>
                  <input
                    name="reference"
                    placeholder="UTR / cheque no."
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                    Note (Optional)
                  </label>
                  <input
                    name="notes"
                    placeholder="e.g. advance for next two trailers"
                    className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                  />
                </div>
              </div>
              <p className="text-[10px] text-[#6b6660] leading-snug">
                Log the transfer as it arrived — one amount, whatever it covers. It clears their
                oldest unpaid job first, and anything left over sits as credit against their next one.
              </p>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsLoggingPayment(false)}
                  className="px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-semibold text-[#111417] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  Record Payment
                </button>
              </div>
            </form>
          )}

          {ledger.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">
              Nothing received from this studio yet.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {ledger.map(entry => (
                <div
                  key={entry.id}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs group"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#111417]">
                      {formatDate(entry.date, 'medium')}
                      <span className="text-[10px] font-semibold text-[#6b6660] ml-2">
                        {entry.mode}
                        {entry.reference ? ` · ${entry.reference}` : ''}
                      </span>
                    </div>
                    <div className="text-[10px] text-[#6b6660] truncate">
                      {entry.note || (entry.jobLabel ? `Recorded on ${entry.jobLabel}` : 'On account')}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-extrabold text-emerald-700">+{formatINR(entry.amount)}</span>
                    {entry.onAccount && client && (
                      <button
                        type="button"
                        onClick={() => setConfirmDeletePaymentId(entry.id)}
                        className="p-1 rounded-lg text-[#6b6660] hover:text-rose-700 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        aria-label="Remove this payment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="px-4 py-2.5 text-[10px] text-[#6b6660] border-t border-[#d4c1a3]/40 leading-snug">
            Every job is billed the day its data arrives, so it is owed from the moment it is logged.
            Payments are recorded here, against the studio — not against one project.
          </p>
        </div>

        <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#d4c1a3]/60">
            <div className="flex items-center gap-2">
              <ArrowUpRight className="w-4 h-4 text-[#7a2e33]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
                Editor Payouts on Their Work
              </h3>
            </div>
            <span className="text-[11px] font-bold text-[#111417]">{formatINR(totals.editorPaid)}</span>
          </div>
          {payouts.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">
              Nothing paid out on their jobs yet — editors are paid once the work is delivered.
            </p>
          ) : (
            <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto">
              {payouts.map(({ job, amount }) => (
                <div
                  key={job.id}
                  onClick={() => setDetailJobId(job.id)}
                  className="flex items-center justify-between gap-3 px-4 py-2.5 text-xs hover:bg-[#f9f8f6]/60 cursor-pointer"
                >
                  <div className="min-w-0">
                    <div className="font-bold text-[#111417] truncate">
                      {job.jobCode} — {job.title}
                    </div>
                    <div className="text-[10px] text-[#6b6660]">{job.editorName}</div>
                  </div>
                  <span className="font-extrabold text-[#7a2e33] shrink-0">−{formatINR(amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Billed against received, month by month */}
      <div className="grid grid-cols-1 gap-6">
        <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d4c1a3]/60">
            <TrendingUp className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
              Billed vs Received by Month
            </h3>
          </div>
          {monthly.rows.length === 0 ? (
            <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">Nothing to chart yet.</p>
          ) : (
            <div className="p-4 space-y-3">
              {monthly.rows.map(row => (
                <div key={row.month} className="space-y-1">
                  <div className="flex items-center justify-between text-[10px] font-semibold text-[#6b6660]">
                    <span>{formatDate(`${row.month}-01`, 'medium').replace(/^\d+\s/, '')}</span>
                    <span>
                      {formatINR(row.billed)} billed · {formatINR(row.received)} in
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-[#f9f8f6] overflow-hidden">
                    <div
                      className="h-full bg-[#7a2e33]"
                      style={{ width: `${(row.billed / monthly.peak) * 100}%` }}
                    />
                  </div>
                  <div className="h-2 rounded-full bg-[#f9f8f6] overflow-hidden">
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${(row.received / monthly.peak) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {client?.notes && (
        <div className="bg-white rounded-xl p-5 border border-[#d4c1a3] shadow-2xs">
          <div className="flex items-center gap-2 mb-2">
            <Receipt className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">Notes</h3>
          </div>
          <p className="text-xs text-[#111417] leading-relaxed whitespace-pre-wrap">{client.notes}</p>
        </div>
      )}

      {/* See the note on remounting in FreelanceDepartmentView — the form seeds itself
          from initialJob once, on mount. */}
      <NewFreelanceJobModal
        key={`${editingJob?.id ?? 'new'}:${isNewJobOpen}`}
        isOpen={isNewJobOpen}
        onClose={() => setIsNewJobOpen(false)}
        initialJob={editingJob}
        presetClientId={editingJob ? undefined : client?.id}
      />

      <FreelanceJobDetailModal
        isOpen={Boolean(detailJobId)}
        onClose={() => setDetailJobId(null)}
        jobId={detailJobId}
        onEditJob={job => {
          setDetailJobId(null);
          setEditingJob(job);
          setIsNewJobOpen(true);
        }}
      />


      {previewingBill && client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-[#f9f8f6] rounded-2xl border border-[#d4c1a3] w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#7a2e33] text-white">
              <h4 className="text-sm font-bold font-serif">Statement for {client.name}</h4>
              <button
                type="button"
                onClick={() => setPreviewingBill(false)}
                className="p-1.5 rounded-lg hover:bg-white/10 cursor-pointer"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <textarea
              readOnly
              value={buildStatement()}
              onFocus={e => e.currentTarget.select()}
              className="flex-1 m-4 p-3 bg-white border border-[#d4c1a3] rounded-xl text-xs font-mono text-[#111417] leading-relaxed resize-none focus:outline-none focus:border-[#7a2e33]"
              rows={16}
            />
            <div className="flex items-center justify-between gap-2 px-4 pb-4">
              <span className="text-[10px] text-[#6b6660]">
                Tap the text to select it all, if copying is blocked.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleCopyStatement}
                  className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-bold text-[#111417] hover:border-[#7a2e33] cursor-pointer"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {statementCopied ? 'Copied' : 'Copy'}
                </button>
                {statementLink && (
                  <a
                    href={statementLink}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    Send on WhatsApp
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmDeletePaymentId && client && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-[#d4c1a3] p-5 max-w-sm w-full space-y-3">
            <h4 className="text-sm font-bold text-[#111417]">Remove this payment?</h4>
            <p className="text-xs text-[#6b6660] leading-relaxed">
              It comes off the account, and the jobs it was covering go back to unpaid. Do this only
              if the payment was entered by mistake.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletePaymentId(null)}
                className="px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-semibold text-[#111417] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteFreelanceAccountPayment(client.id, confirmDeletePaymentId);
                  setConfirmDeletePaymentId(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 cursor-pointer"
              >
                Remove Payment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
