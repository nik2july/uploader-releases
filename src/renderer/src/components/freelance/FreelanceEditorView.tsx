import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob } from '../../types';
import { formatDate, formatINR, getFreelanceStageMeta } from '../../utils/formatters';
import { toWhatsAppNumber } from '../../utils/phone';
import { getWhatsAppUrl } from '../../utils/whatsappShare';
import { isSalariedMember } from '../../utils/freelance';
import { EMPTY_EDITOR_ACCOUNT } from '../../utils/freelanceAccount';
import { FreelanceJobDetailModal } from '../modals/FreelanceJobDetailModal';
import { NewFreelanceJobModal } from '../modals/NewFreelanceJobModal';
import { EditTeamMemberModal } from '../modals/EditTeamMemberModal';
import {
  ArrowLeft,
  UserCircle2,
  MessageCircle,
  Plus,
  Pencil,
  Trash2,
  AlertTriangle,
  ChevronRight,
  Wallet,
  Briefcase,
  Phone,
} from 'lucide-react';

/**
 * What one editor has been paid for freelance work, and what each job cost.
 *
 * Editors settle the way partner studios pay — an advance up front, or one transfer
 * after two or three jobs are finished — so a payout does not belong to a project any
 * more than a studio's cheque does. It is recorded here, against the person, and split
 * across the jobs it was for. That split is the only statement of what a job cost,
 * because the fee is agreed at the moment of paying and not before.
 */

export const FreelanceEditorView: React.FC = () => {
  const {
    team,
    freelanceJobs,
    selectedFreelanceEditorId,
    setSelectedFreelanceEditorId,
    setActiveView,
    freelanceEditorAccounts,
    addFreelanceEditorPayoutRecord,
    deleteFreelanceEditorPayoutRecord,
    updateTeamMember,
  } = useApp();

  const [isLogging, setIsLogging] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [detailJobId, setDetailJobId] = useState<string | null>(null);
  const [editingJob, setEditingJob] = useState<FreelanceJob | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // The payout being written: one transfer, divided across the work it covers.
  const [amount, setAmount] = useState<number | ''>('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [mode, setMode] = useState('Bank Transfer');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [splits, setSplits] = useState<Record<string, number | ''>>({});

  const member = team.find(m => m.id === selectedFreelanceEditorId);
  const account = (member && freelanceEditorAccounts.get(member.id)) || EMPTY_EDITOR_ACCOUNT;

  const jobs = useMemo(
    () =>
      freelanceJobs
        .filter(j => j.editorMemberId === selectedFreelanceEditorId)
        .sort((a, b) =>
          String(b.dataReceivedDate || b.createdAt || '').localeCompare(
            String(a.dataReceivedDate || a.createdAt || '')
          )
        ),
    [freelanceJobs, selectedFreelanceEditorId]
  );

  const goBack = () => {
    setSelectedFreelanceEditorId(null);
  };

  const costOf = (job: FreelanceJob) => account.costByJob.get(job.id) || 0;

  /** Work finished that nobody has been paid for — the reason to open this page. */
  const unpaidDelivered = useMemo(
    () =>
      jobs.filter(
        j => (j.stage === 'completed' || j.stage === 'final_delivered') && costOf(j) === 0
      ),
    [jobs, account]
  );

  const allocatedNow = Object.values(splits).reduce<number>(
    (a, v) => a + (Number(v) || 0),
    0
  );
  const leftToAllocate = (Number(amount) || 0) - allocatedNow;

  const resetForm = () => {
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setMode('Bank Transfer');
    setReference('');
    setNotes('');
    setSplits({});
    setIsLogging(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!member) return;
    const total = Number(amount) || 0;
    if (total <= 0 || leftToAllocate < 0) return;
    addFreelanceEditorPayoutRecord(member.id, {
      amount: total,
      date: date || new Date().toISOString().split('T')[0],
      mode,
      reference: reference.trim(),
      notes: notes.trim(),
      allocations: Object.entries(splits)
        .map(([jobId, value]) => ({ jobId, amount: Number(value) || 0 }))
        .filter(a => a.amount > 0),
    });
    resetForm();
  };

  if (!member) {
    return (
      <div className="bg-white rounded-xl p-8 border border-[#d4c1a3] text-center">
        <UserCircle2 className="w-8 h-8 text-[#d4c1a3] mx-auto mb-2" />
        <p className="text-xs font-semibold text-[#111417]">This editor is no longer on your team</p>
        <button
          type="button"
          onClick={goBack}
          className="mt-3 px-4 py-2 rounded-xl bg-[#7a2e33] text-white text-xs font-bold cursor-pointer"
        >
          Back to Active Jobs
        </button>
      </div>
    );
  }

  const salaried = isSalariedMember(member);

  const tile = (caption: string, value: string, tone: string, footnote?: React.ReactNode) => (
    <div className="bg-white p-4 rounded-xl border border-[#d4c1a3] shadow-2xs">
      <span className="text-[10px] uppercase font-bold tracking-wider text-[#6b6660]">{caption}</span>
      <div className={`text-xl font-extrabold mt-0.5 ${tone}`}>{value}</div>
      {footnote && <div className="text-[11px] font-medium text-[#6b6660] mt-1">{footnote}</div>}
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
        Back to Team / Roster
      </button>

      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs p-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-[#7a2e33] flex items-center justify-center shrink-0">
            <UserCircle2 className="w-6 h-6 text-[#f9f8f6]" />
          </div>
          <div>
            <h2 className="text-xl font-bold font-serif text-[#111417]">{member.name}</h2>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-[#6b6660] mt-1">
              <span className="font-semibold">{member.role}</span>
              {member.phone && (
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3" />
                  {member.phone}
                </span>
              )}
              <span>
                {salaried ? 'On monthly salary' : 'Paid per event / deliverable'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {member.phone && (
            <a
              href={getWhatsAppUrl(member.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-bold text-emerald-700 hover:border-emerald-600"
            >
              <MessageCircle className="w-3.5 h-3.5" />
              WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => setIsEditingMember(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[#d4c1a3] bg-white text-xs font-bold text-[#111417] hover:bg-[#f9f8f6] hover:text-[#7a2e33] transition-colors cursor-pointer"
            title={`Edit ${member.name}'s profile and rates`}
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
          <button
            type="button"
            onClick={() => setIsLogging(v => !v)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7a2e33] text-[#f9f8f6] text-xs font-bold hover:bg-[#5a2226] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            Log Payout
          </button>
        </div>
      </div>

      {salaried && (
        <p className="text-[11px] text-[#6b6660] bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl px-4 py-2.5 leading-snug">
          {member.name} is on monthly salary, so freelance jobs they edit cost the studio nothing
          extra. Anything logged here is over and above that salary.
        </p>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {tile('Freelance Jobs', String(jobs.length), 'text-[#111417]', `${unpaidDelivered.length} delivered, unpaid`)}
        {tile('Paid to Date', formatINR(account.paid), 'text-[#111417]', `${(member.freelancePayouts || []).length} payouts`)}
        {tile(
          'Split Across Jobs',
          formatINR(account.allocated),
          'text-emerald-700',
          'counted as the cost of that work'
        )}
        {tile(
          'Unallocated Advance',
          formatINR(account.advance),
          account.advance > 0 ? 'text-sky-700' : 'text-[#6b6660]',
          account.advance > 0 ? 'paid ahead, not yet against a job' : 'nothing outstanding'
        )}
      </div>

      {unpaidDelivered.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
          <p className="text-[11px] text-amber-900 leading-snug">
            <strong>{unpaidDelivered.length}</strong>{' '}
            {unpaidDelivered.length === 1 ? 'job is' : 'jobs are'} delivered with nothing paid against{' '}
            {unpaidDelivered.length === 1 ? 'it' : 'them'} — {unpaidDelivered.map(j => j.jobCode).join(', ')}.
            Until a payout is split onto {unpaidDelivered.length === 1 ? 'it' : 'them'}, that work
            shows as costing the studio nothing.
          </p>
        </div>
      )}

      {isLogging && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
          <div className="px-4 py-3 border-b border-[#d4c1a3]/60 flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
              Log a Payout to {member.name}
            </h3>
          </div>

          <div className="p-4 grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                Amount Paid ₹
              </label>
              <input
                type="number"
                min="1"
                required
                autoFocus
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="e.g. 15000"
                className="w-full px-3 py-2 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-sm font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                Date
              </label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                Mode
              </label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value)}
                className="w-full px-3 py-2 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              >
                {['Bank Transfer', 'UPI', 'GPay', 'PhonePe', 'Cheque', 'Cash', 'Card'].map(m => (
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
                value={reference}
                onChange={e => setReference(e.target.value)}
                placeholder="UTR / cheque no."
                className="w-full px-3 py-2 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
          </div>

          {/* Which jobs this transfer was for, and how much of it each one cost. */}
          <div className="px-4 pb-2">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#d4c1a3]/60">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#6b6660]">
                What this payment covers
              </span>
              <span
                className={`text-[11px] font-bold ${
                  leftToAllocate < 0
                    ? 'text-rose-700'
                    : leftToAllocate > 0
                    ? 'text-sky-700'
                    : 'text-emerald-700'
                }`}
              >
                {leftToAllocate < 0
                  ? `${formatINR(-leftToAllocate)} over the amount paid`
                  : leftToAllocate > 0
                  ? `${formatINR(leftToAllocate)} left — kept as an advance`
                  : 'Fully split across jobs'}
              </span>
            </div>

            {jobs.length === 0 ? (
              <p className="py-6 text-center text-[11px] text-[#6b6660]">
                No freelance jobs assigned to {member.name} yet.
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto divide-y divide-gray-100">
                {jobs.map(job => {
                  const already = costOf(job);
                  return (
                    <div key={job.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-[#111417] truncate flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] text-[#7a2e33]">{job.jobCode}</span>
                          {job.serviceType && (
                            <span className="inline-block text-[9.5px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-[#f5ebe6] text-[#7a2e33] border border-[#d4c1a3]/60">
                              {job.serviceType}
                            </span>
                          )}
                          <span>{job.title}</span>
                        </div>
                        <div className="text-[10px] text-[#6b6660]">
                          {job.clientName} · {getFreelanceStageMeta(job.stage).label}
                          {already > 0 && ` · ${formatINR(already)} already paid on this job`}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className="text-xs font-bold text-[#6b6660]">₹</span>
                        <input
                          type="number"
                          min="0"
                          value={splits[job.id] ?? ''}
                          onChange={e =>
                            setSplits(s => ({
                              ...s,
                              [job.id]: e.target.value === '' ? '' : Number(e.target.value),
                            }))
                          }
                          placeholder="0"
                          className="w-28 px-2.5 py-1.5 bg-[#f9f8f6] border border-[#d4c1a3] rounded-lg text-xs font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
                        />
                        {leftToAllocate > 0 && (
                          <button
                            type="button"
                            onClick={() =>
                              setSplits(s => ({
                                ...s,
                                [job.id]: (Number(s[job.id]) || 0) + leftToAllocate,
                              }))
                            }
                            className="px-2 py-1.5 rounded-lg border border-[#d4c1a3] text-[10px] font-bold text-[#7a2e33] hover:border-[#7a2e33] cursor-pointer"
                            title="Put the rest of this payment on this job"
                          >
                            Rest
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="px-4 pb-4 space-y-3">
            <div>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-[#6b6660] mb-1">
                Note (Optional)
              </label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. settled for the two September trailers"
                className="w-full px-3 py-2 bg-[#f9f8f6] border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
            <p className="text-[10px] text-[#6b6660] leading-snug">
              What you put against a job is what that job cost — it is the only figure the margin
              has. Leave money unsplit and it stays an advance until the work it was for is done.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-semibold text-[#111417] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!amount || leftToAllocate < 0}
                className="px-4 py-2 rounded-xl bg-[#7a2e33] hover:bg-[#5a2226] text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                Record Payout
              </button>
            </div>
          </div>
        </form>
      )}

      {/* Their freelance work, and what each job has cost */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d4c1a3]/60">
          <Briefcase className="w-4 h-4 text-[#7a2e33]" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
            Their Freelance Work
          </h3>
        </div>
        {jobs.length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">
            Nothing assigned to {member.name} yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[760px]">
              <thead className="bg-[#f9f8f6] border-b border-[#d4c1a3]">
                <tr className="text-[10px] uppercase tracking-wider text-[#6b6660]">
                  <th className="py-2.5 px-4 font-bold">Job</th>
                  <th className="py-2.5 px-4 font-bold">Stage</th>
                  <th className="py-2.5 px-4 font-bold text-right">Client Charge</th>
                  <th className="py-2.5 px-4 font-bold text-right">Paid to Editor</th>
                  <th className="py-2.5 px-4 font-bold text-right">Studio Margin</th>
                  <th className="py-2.5 px-4 font-bold text-right"> </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {jobs.map(job => {
                  const cost = costOf(job);
                  const margin = (Number(job.clientCharge) || 0) - cost;
                  return (
                    <tr
                      key={job.id}
                      onClick={() => setDetailJobId(job.id)}
                      className="text-xs hover:bg-[#f9f8f6]/60 cursor-pointer"
                    >
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono text-[10px] font-bold text-[#7a2e33]">{job.jobCode}</span>
                          {job.serviceType && (
                            <span className="inline-block text-[9.5px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded bg-[#f5ebe6] text-[#7a2e33] border border-[#d4c1a3]/60">
                              {job.serviceType}
                            </span>
                          )}
                        </div>
                        <div className="font-bold text-[#111417] line-clamp-1 mt-0.5">{job.title}</div>
                        <div className="text-[10px] text-[#6b6660] flex items-center gap-1.5">
                          <span>{job.clientName}</span>
                          {job.projectCategory && (
                            <>
                              <span>·</span>
                              <span>{job.projectCategory}</span>
                            </>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            getFreelanceStageMeta(job.stage).badgeClass
                          }`}
                        >
                          {getFreelanceStageMeta(job.stage).label}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-[#111417]">
                        {formatINR(job.clientCharge || 0)}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-bold ${
                          cost > 0 ? 'text-[#111417]' : 'text-[#6b6660]'
                        }`}
                      >
                        {cost > 0 ? formatINR(cost) : salaried ? 'Salaried' : 'Not paid yet'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-extrabold ${
                          margin >= 0 ? 'text-emerald-700' : 'text-rose-700'
                        }`}
                      >
                        {formatINR(margin)}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            setEditingJob(job);
                          }}
                          className="p-1.5 rounded-lg text-[#6b6660] hover:text-[#7a2e33] hover:bg-[#f9f8f6] cursor-pointer"
                          aria-label={`Edit ${job.jobCode}`}
                          title="Edit this job"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <ChevronRight className="w-3.5 h-3.5 text-[#6b6660] inline" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Every payout, and what it was for */}
      <div className="bg-white rounded-xl border border-[#d4c1a3] shadow-2xs">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#d4c1a3]/60">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#7a2e33]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#7a2e33]">
              Payout History
            </h3>
          </div>
          <span className="text-[11px] font-bold text-[#111417]">{formatINR(account.paid)} paid</span>
        </div>

        {(member.freelancePayouts || []).length === 0 ? (
          <p className="px-4 py-8 text-center text-[11px] text-[#6b6660]">
            Nothing paid to {member.name} for freelance work yet.
          </p>
        ) : (
          <div className="divide-y divide-gray-100">
            {[...(member.freelancePayouts || [])]
              .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
              .map(payout => {
                const split = (payout.allocations || []).reduce((a, x) => a + (Number(x.amount) || 0), 0);
                const advance = Math.max(0, (Number(payout.amount) || 0) - split);
                return (
                  <div key={payout.id} className="px-4 py-3 text-xs group">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <span className="font-bold text-[#111417]">{formatDate(payout.date, 'medium')}</span>
                        <span className="text-[10px] font-semibold text-[#6b6660] ml-2">
                          {payout.mode}
                          {payout.reference ? ` · ${payout.reference}` : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-[#7a2e33]">−{formatINR(payout.amount)}</span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(payout.id)}
                          className="p-1 rounded-lg text-[#6b6660] hover:text-rose-700 hover:bg-rose-50 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label="Remove this payout"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    <div className="mt-1 space-y-0.5">
                      {(payout.allocations || []).map(split => {
                        const job = freelanceJobs.find(j => j.id === split.jobId);
                        return (
                          <div key={split.jobId} className="text-[10px] text-[#6b6660] flex justify-between">
                            <span className="truncate">
                              {job ? `${job.jobCode} — ${job.title}${job.serviceType ? ` (${job.serviceType})` : ''}` : 'A job that no longer exists'}
                            </span>
                            <span className="font-semibold shrink-0 ml-2">{formatINR(split.amount)}</span>
                          </div>
                        );
                      })}
                      {advance > 0 && (
                        <div className="text-[10px] text-sky-700 font-semibold flex justify-between">
                          <span>Advance — not against a job yet</span>
                          <span>{formatINR(advance)}</span>
                        </div>
                      )}
                      {payout.notes && (
                        <div className="text-[10px] text-[#6b6660] italic">{payout.notes}</div>
                      )}
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </div>

      <FreelanceJobDetailModal
        isOpen={Boolean(detailJobId)}
        onClose={() => setDetailJobId(null)}
        jobId={detailJobId}
        onEditJob={job => {
          setDetailJobId(null);
          setEditingJob(job);
        }}
      />

      {/* Remounted per job — the form seeds its fields once, on mount. */}
      <NewFreelanceJobModal
        key={editingJob?.id ?? 'none'}
        isOpen={Boolean(editingJob)}
        onClose={() => setEditingJob(null)}
        initialJob={editingJob}
      />

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl border border-[#d4c1a3] p-5 max-w-sm w-full space-y-3">
            <h4 className="text-sm font-bold text-[#111417]">Remove this payout?</h4>
            <p className="text-xs text-[#6b6660] leading-relaxed">
              The jobs it was split across go back to costing nothing, and the studio margin on them
              rises to match. Do this only if the payout was entered by mistake.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteId(null)}
                className="px-3.5 py-2 rounded-xl border border-[#d4c1a3] text-xs font-semibold text-[#111417] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteFreelanceEditorPayoutRecord(member.id, confirmDeleteId);
                  setConfirmDeleteId(null);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-700 text-white text-xs font-bold hover:bg-rose-800 cursor-pointer"
              >
                Remove Payout
              </button>
            </div>
          </div>
        </div>
      )}
      {isEditingMember && member && (
        <EditTeamMemberModal
          member={member}
          onClose={() => setIsEditingMember(false)}
          onSave={async updated => {
            try {
              await updateTeamMember(member.id, updated);
            } catch (err) {
              console.error('Failed to update team member:', err);
            }
            setIsEditingMember(false);
          }}
        />
      )}
    </div>
  );
};
