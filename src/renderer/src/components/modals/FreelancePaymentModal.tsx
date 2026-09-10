import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceJob, FreelancePaymentRecord } from '../../types';
import { IndianRupee, X, CheckCircle2, ArrowDownLeft, ArrowUpRight } from 'lucide-react';

interface FreelancePaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  job: FreelanceJob;
  type: 'client' | 'editor';
}

export const FreelancePaymentModal: React.FC<FreelancePaymentModalProps> = ({
  isOpen,
  onClose,
  job,
  type,
}) => {
  const { addFreelanceClientPayment, addFreelanceEditorPayout } = useApp();

  const todayStr = new Date().toISOString().split('T')[0];

  const defaultBalance =
    type === 'client'
      ? Math.max(0, job.clientCharge - job.clientPaidAmount)
      : Math.max(0, job.editorPay - job.editorPaidAmount);

  const [amount, setAmount] = useState<number | ''>(defaultBalance > 0 ? defaultBalance : '');
  const [date, setDate] = useState<string>(todayStr);
  const [mode, setMode] = useState<FreelancePaymentRecord['mode']>('UPI');
  const [reference, setReference] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  if (!isOpen) return null;

  const isClient = type === 'client';
  const targetTotal = isClient ? job.clientCharge : job.editorPay;
  const currentPaid = isClient ? job.clientPaidAmount : job.editorPaidAmount;
  const remainingBefore = Math.max(0, targetTotal - currentPaid);

  const numAmount = Number(amount) || 0;
  const remainingAfter = Math.max(0, remainingBefore - numAmount);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numAmount || numAmount <= 0) return;

    if (isClient) {
      addFreelanceClientPayment(job.id, {
        amount: numAmount,
        date: date || todayStr,
        mode,
        reference: reference.trim(),
        notes: notes.trim(),
      });
    } else {
      addFreelanceEditorPayout(job.id, {
        amount: numAmount,
        date: date || todayStr,
        mode,
        reference: reference.trim(),
        notes: notes.trim(),
      });
    }

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
      <div className="relative w-full max-w-md bg-[#f9f8f6] border border-[#d4c1a3] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div
          className={`flex items-center justify-between px-5 py-4 text-white ${
            isClient ? 'bg-[#7a2e33]' : 'bg-[#1b4332]'
          }`}
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              {isClient ? (
                <ArrowDownLeft className="w-4 h-4 text-emerald-300" />
              ) : (
                <ArrowUpRight className="w-4 h-4 text-amber-300" />
              )}
            </div>
            <div>
              <h3 className="text-sm font-bold tracking-wide">
                {isClient ? 'Record Client Payment' : 'Record Editor Payout'}
              </h3>
              <p className="text-[11px] text-white/80">
                {job.jobCode} • {job.title}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-white/70 hover:text-white rounded-lg hover:bg-white/10"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Summary Box */}
          <div className="bg-white p-3.5 rounded-xl border border-[#d4c1a3] flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold text-[#6b6660]">
                {isClient ? 'Client Total Charge' : 'Editor Total Fee'}
              </span>
              <div className="text-sm font-bold text-[#111417]">
                ₹{targetTotal.toLocaleString('en-IN')}
              </div>
            </div>
            <div className="text-right">
              <span className="text-[10px] uppercase font-bold text-[#6b6660]">
                Current Balance Due
              </span>
              <div className="text-sm font-bold text-[#7a2e33]">
                ₹{remainingBefore.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-semibold text-[#111417] mb-1">
              {isClient ? 'Payment Amount Received (₹) *' : 'Payout Amount Remitted (₹) *'}
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-2.5 text-sm font-bold text-[#6b6660]">₹</span>
              <input
                type="number"
                required
                min="1"
                placeholder="e.g. 5000"
                value={amount}
                onChange={e => setAmount(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full pl-8 pr-3.5 py-2.5 bg-white border border-[#d4c1a3] rounded-xl text-base font-bold text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
            {numAmount > 0 && (
              <div className="flex items-center justify-between text-[11px] mt-1.5 px-1 text-[#6b6660]">
                <span>Remaining After Entry:</span>
                <span className="font-semibold text-[#111417]">
                  ₹{remainingAfter.toLocaleString('en-IN')}
                  {remainingAfter === 0 ? ' (Fully Settled)' : ''}
                </span>
              </div>
            )}
          </div>

          {/* Date & Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-[#111417] mb-1">Date</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-[#111417] mb-1">Payment Mode</label>
              <select
                value={mode}
                onChange={e => setMode(e.target.value as any)}
                className="w-full px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              >
                <option value="UPI">UPI (GPay / PhonePe / Paytm)</option>
                <option value="Bank Transfer">Bank NEFT / IMPS</option>
                <option value="Cash">Cash</option>
                <option value="Cheque">Cheque</option>
                <option value="Other">Other</option>
              </select>
            </div>
          </div>

          {/* Reference No */}
          <div>
            <label className="block text-xs font-semibold text-[#111417] mb-1">
              Transaction ID / UTR / Reference (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. UPI Ref #94829382..."
              value={reference}
              onChange={e => setReference(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-mono text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-[#111417] mb-1">
              Internal Note (Optional)
            </label>
            <input
              type="text"
              placeholder="e.g. 50% advance before rough cut"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="w-full px-3.5 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs text-[#111417] focus:outline-none focus:border-[#7a2e33]"
            />
          </div>

          {/* Submit */}
          <div className="pt-2 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:bg-[#d4c1a3]/40 rounded-xl"
            >
              Cancel
            </button>
            <button
              type="submit"
              className={`flex items-center gap-1.5 px-5 py-2 text-white font-bold text-xs rounded-xl shadow-xs transition-all cursor-pointer ${
                isClient
                  ? 'bg-[#7a2e33] hover:bg-[#5a2226]'
                  : 'bg-[#1b4332] hover:bg-[#143326]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Confirm & Record</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
