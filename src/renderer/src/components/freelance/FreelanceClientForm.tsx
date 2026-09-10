import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { FreelanceClient } from '../../types';
import { sanitizePhone, generateUniquePassword } from '../../utils/formatters';
import { DEFAULT_DIAL_CODE, DIAL_CODES, formatInternational } from '../../utils/phone';
import { X, Check, KeyRound, Copy, RefreshCw } from 'lucide-react';

/**
 * The details of one partner studio, in a form.
 *
 * Shared by the roster and the studio's own page rather than written twice: a field
 * added in one place and missed in the other is a field the studio can only edit from
 * whichever screen happened to get it.
 */

interface FreelanceClientFormProps {
  /** The studio being edited; absent when adding a new one. */
  client?: FreelanceClient;
  onClose: () => void;
  onSaved?: (id: string) => void;
}

const emptyDraft = {
  name: '',
  contactPerson: '',
  dialCode: DEFAULT_DIAL_CODE,
  phone: '',
  email: '',
  city: '',
  gstin: '',
  notes: '',
};

export const FreelanceClientForm: React.FC<FreelanceClientFormProps> = ({
  client,
  onClose,
  onSaved,
}) => {
  const { addFreelanceClient, updateFreelanceClient } = useApp();

  const [password, setPassword] = useState(client?.password || generateUniquePassword('FS'));
  const [mustChangePassword, setMustChangePassword] = useState(client?.mustChangePassword ?? true);
  const [copiedPass, setCopiedPass] = useState(false);

  const handleResetPassword = () => {
    setPassword(generateUniquePassword('FS'));
    setMustChangePassword(true);
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(password);
    setCopiedPass(true);
    setTimeout(() => setCopiedPass(false), 2000);
  };

  const [draft, setDraft] = useState(
    client
      ? {
          name: client.name,
          contactPerson: client.contactPerson || '',
          dialCode: client.dialCode || DEFAULT_DIAL_CODE,
          phone: client.phone || '',
          email: client.email || '',
          city: client.city || '',
          gstin: client.gstin || '',
          notes: client.notes || '',
        }
      : emptyDraft
  );

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const payload = {
      name: draft.name.trim(),
      contactPerson: draft.contactPerson.trim() || undefined,
      dialCode: draft.dialCode || DEFAULT_DIAL_CODE,
      phone: sanitizePhone(draft.phone),
      email: draft.email.trim() || undefined,
      city: draft.city.trim() || undefined,
      gstin: draft.gstin.trim() || undefined,
      notes: draft.notes.trim() || undefined,
      password: password.trim(),
      mustChangePassword,
    };
    if (client) {
      updateFreelanceClient(client.id, payload);
      onSaved?.(client.id);
    } else {
      onSaved?.(addFreelanceClient(payload).id);
    }
    onClose();
  };

  const field = (label: string, key: keyof typeof emptyDraft, props: any = {}) => (
    <div>
      <label className="block text-[11px] font-semibold text-[#111417] mb-1">{label}</label>
      <input
        {...props}
        value={draft[key]}
        onChange={e => setDraft(d => ({ ...d, [key]: e.target.value }))}
        className="w-full px-3 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
      />
    </div>
  );

  return (
    <form
      onSubmit={handleSave}
      className="bg-white rounded-xl p-4 border border-[#d4c1a3] shadow-2xs space-y-3"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-bold text-[#7a2e33] uppercase tracking-wider">
          {client ? 'Edit Studio' : 'New Studio'}
        </h4>
        <button
          type="button"
          onClick={onClose}
          className="text-[#6b6660] hover:text-[#111417] cursor-pointer"
          aria-label="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {field('Studio Name *', 'name', { required: true, placeholder: 'e.g. Lensview Films' })}
        {field('Contact Person', 'contactPerson', { placeholder: 'e.g. Rohit' })}
        {/* The country is asked for, not inferred: ten digits are an Indian mobile, a
            US number with its area code, or half of Europe, and WhatsApp needs to know
            which before it can open anything. */}
        <div>
          <label className="block text-[11px] font-semibold text-[#111417] mb-1">WhatsApp Phone</label>
          <div className="flex items-center gap-1.5">
            <select
              value={draft.dialCode}
              onChange={e => setDraft(d => ({ ...d, dialCode: e.target.value }))}
              className="w-28 px-2 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33]"
              aria-label="Country dial code"
            >
              {DIAL_CODES.map(d => (
                <option key={d.code} value={d.code}>
                  {d.flag} +{d.code}
                </option>
              ))}
            </select>
            <input
              type="tel"
              value={draft.phone}
              onChange={e => setDraft(d => ({ ...d, phone: e.target.value }))}
              placeholder="9876543210"
              className="flex-1 min-w-0 px-3 py-2 bg-[#f9f8f6]/50 border border-[#d4c1a3] rounded-xl text-xs font-medium text-[#111417] focus:outline-none focus:border-[#7a2e33] focus:bg-white transition-all"
            />
          </div>
          {draft.phone.trim() && (
            <p className="text-[10px] text-[#6b6660] mt-1">
              Messages go to {formatInternational(draft.phone, draft.dialCode)}
            </p>
          )}
        </div>
        {field('City', 'city', { placeholder: 'e.g. Chandigarh' })}
        {field('Email', 'email', { type: 'email', placeholder: 'studio@example.com' })}
        {field('GSTIN', 'gstin', { placeholder: 'Optional' })}
        
        <div className="md:col-span-3">
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-[#111417]">
              <KeyRound className="w-3.5 h-3.5" />
              <span>Partner Portal Password</span>
            </div>
            {mustChangePassword && (
              <span className="text-[10px] text-amber-800 bg-amber-100 px-2 py-0.5 rounded border border-amber-200 font-semibold">
                Reset required on login
              </span>
            )}
          </div>
          <div className="flex gap-2 mb-1">
            <input
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value.trim())}
              className="flex-1 px-3 py-2 bg-white border border-[#d4c1a3] rounded-xl text-xs font-mono font-bold text-[#7a2e33] tracking-wider focus:outline-none focus:border-[#7a2e33]"
            />
            <button
              type="button"
              onClick={handleCopyPassword}
              className="p-2 rounded-xl bg-white border border-[#d4c1a3] hover:bg-[#d4c1a3]/50 text-[#7a2e33] transition-all flex items-center justify-center cursor-pointer"
              title="Copy Password"
            >
              {copiedPass ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={handleResetPassword}
              className="px-3 py-2 rounded-xl bg-[#7a2e33] hover:bg-[#5a2226] text-[#f9f8f6] text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
              title="Generate New Temporary Password"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Reset Key</span>
            </button>
          </div>
          <p className="text-[10px] text-[#6b6660]">
            Clicking "Reset Key" creates a new temporary password and prompts the partner to configure their own password when they next log in.
          </p>
        </div>

        <div className="md:col-span-3">
          {field('Notes', 'notes', { placeholder: 'Rates agreed, turnaround expectations…' })}
        </div>
      </div>
      <div className="flex justify-end">
        <button
          type="submit"
          className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7a2e33] text-[#f9f8f6] text-xs font-bold hover:bg-[#5a2226] transition-colors cursor-pointer"
        >
          <Check className="w-3.5 h-3.5" />
          {client ? 'Save Changes' : 'Add Studio'}
        </button>
      </div>
    </form>
  );
};
