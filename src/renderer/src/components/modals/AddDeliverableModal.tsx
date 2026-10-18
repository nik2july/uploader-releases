import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Plus,
  Film,
  Camera,
  BookOpen,
  HardDrive,
  Sparkles,
  IndianRupee,
  Calendar,
  User,
  CheckCircle2,
  Layers,
  AlertCircle,
  FileText,
  Clock,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { addClientDeliverable } from '../../lib/studioRepository';
import { getClientEvents, getClientEventsStatus, isEditorRole } from '../../utils/formatters';
import type { Client, TeamMember } from '../../types';

export interface AddDeliverableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: (deliverableId: string) => void;
  preselectedClientId?: string | number;
}

const PRESET_DELIVERABLES = [
  { title: 'Cinematic Wedding Film (30-60 Min 4K)', category: 'Video', icon: Film, defaultQty: 45 },
  { title: 'Instagram Reel Teaser (9:16 Vertical)', category: 'Video', icon: Sparkles, defaultQty: 1 },
  { title: 'Luxury Flush Mount Album (40 Sheets)', category: 'Album', icon: BookOpen, defaultQty: 40 },
  { title: 'Curated Edited Photos (Master Color-Graded)', category: 'Photo', icon: Camera, defaultQty: 300 },
  { title: 'Traditional Full-Length Video (Uncut Rituals)', category: 'Video', icon: Film, defaultQty: 120 },
  { title: 'Raw Footage Archive on High-Speed NVMe SSD', category: 'Storage', icon: HardDrive, defaultQty: 1 },
  { title: 'Master Wall Canvas / Acrylic Art Frame', category: 'Frame', icon: Layers, defaultQty: 1 },
];

const CATEGORY_OPTIONS = [
  'Video',
  'Photo',
  'Album',
  'Frame',
  'Storage',
  'Service',
  'Other',
];

export const AddDeliverableModal: React.FC<AddDeliverableModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  preselectedClientId,
}) => {
  const { clients, projects, team } = useApp();

  const [selectedClientId, setSelectedClientId] = useState<string>(
    preselectedClientId ? String(preselectedClientId) : ''
  );
  const [showAllBookedClients, setShowAllBookedClients] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Video');
  const [isZeroAmount, setIsZeroAmount] = useState(false);
  const [sellingPrice, setSellingPrice] = useState<number | ''>('');
  const [costPrice, setCostPrice] = useState<number | ''>('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 14);
    return d.toISOString().slice(0, 10);
  });
  const [billableQuantity, setBillableQuantity] = useState<number | ''>('');
  const [assignedMemberId, setAssignedMemberId] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Eligible clients: Booked clients whose event dates have passed
  const clientOptions = useMemo(() => {
    const booked = (clients || []).filter(c => {
      const s = (c.status || '').toLowerCase();
      return s === 'booked' || s === 'shoot done' || s === 'completed';
    });

    const now = Date.now();
    return booked.map(c => {
      const cEvents = getClientEvents(c, projects);
      const eventStatus = getClientEventsStatus(c, cEvents, now);
      return {
        client: c,
        events: cEvents,
        eventStatus,
        eligible: eventStatus.anyEventPassed || !eventStatus.hasEvents,
      };
    }).sort((a, b) => {
      const nameA = (a.client.couple || a.client.name || '').toLowerCase();
      const nameB = (b.client.couple || b.client.name || '').toLowerCase();
      return nameA.localeCompare(nameB);
    });
  }, [clients, projects]);

  const visibleClients = useMemo(() => {
    if (showAllBookedClients) return clientOptions;
    return clientOptions.filter(item => item.eligible);
  }, [clientOptions, showAllBookedClients]);

  // Available editors from team
  const editors = useMemo(() => {
    return (team || []).filter(m => m.active !== false && (isEditorRole(m.role) || m.category === 'post-production'));
  }, [team]);

  useEffect(() => {
    if (isOpen) {
      if (preselectedClientId) {
        setSelectedClientId(String(preselectedClientId));
      } else if (visibleClients.length > 0 && !selectedClientId) {
        setSelectedClientId(String(visibleClients[0].client.id));
      }
      setError('');
    }
  }, [isOpen, preselectedClientId, visibleClients]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: typeof PRESET_DELIVERABLES[number]) => {
    setTitle(preset.title);
    setCategory(preset.category);
    if (preset.defaultQty) setBillableQuantity(preset.defaultQty);
  };

  const handleZeroAmountToggle = (checked: boolean) => {
    setIsZeroAmount(checked);
    if (checked) {
      setSellingPrice(0);
    } else if (sellingPrice === 0) {
      setSellingPrice('');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClientId) {
      setError('Please select a client.');
      return;
    }
    if (!title.trim()) {
      setError('Please provide a deliverable title.');
      return;
    }

    try {
      setSaving(true);
      setError('');

      const price = isZeroAmount ? 0 : (sellingPrice === '' ? 0 : Number(sellingPrice));
      const cost = costPrice === '' ? undefined : Number(costPrice);
      const qty = billableQuantity === '' ? undefined : Number(billableQuantity);
      const editorId = assignedMemberId ? Number(assignedMemberId) : undefined;

      const newId = await addClientDeliverable(selectedClientId, {
        title: title.trim(),
        category,
        sellingPrice: price,
        costPrice: cost,
        dueDate: dueDate || undefined,
        billableQuantity: qty,
        notes: notes.trim() || undefined,
        assignedMemberId: editorId,
        isExtra: true, // Marked as extra so it can be billed separately!
      });

      onSuccess?.(newId);
      onClose();
    } catch (err: any) {
      console.error('Failed to add deliverable:', err);
      setError(err.message || 'Failed to add deliverable.');
    } finally {
      setSaving(false);
    }
  };

  const selectedClientData = clientOptions.find(o => String(o.client.id) === selectedClientId);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-2xl bg-white rounded-2xl shadow-2xl border border-[#d4c1a3] overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#d4c1a3] bg-[#f9f8f6]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#7a2e33] text-white flex items-center justify-center shadow-xs">
              <Plus className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-[#111417] font-serif">Add Deliverable</h3>
              <p className="text-xs text-[#6b6660]">
                Add a new deliverable to track and bill separately as an extra or complimentary item
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-[#6b6660] hover:text-[#111417] rounded-lg hover:bg-[#d4c1a3]/30 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} className="overflow-y-auto p-6 space-y-5 text-left">
          {error && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider">
                Select Client <span className="text-rose-500">*</span>
              </label>
              <label className="flex items-center gap-1.5 text-[11px] text-[#6b6660] cursor-pointer">
                <input
                  type="checkbox"
                  checked={showAllBookedClients}
                  onChange={(e) => setShowAllBookedClients(e.target.checked)}
                  className="rounded border-[#d4c1a3] text-[#7a2e33] focus:ring-[#7a2e33]"
                />
                <span>Show all booked clients</span>
              </label>
            </div>

            <select
              value={selectedClientId}
              onChange={(e) => setSelectedClientId(e.target.value)}
              required
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
            >
              {visibleClients.length === 0 ? (
                <option value="">No booked clients found with completed shoot dates</option>
              ) : (
                visibleClients.map(({ client, events, eventStatus }) => {
                  const eventDateStr = eventStatus.earliestDate
                    ? `Shoot: ${eventStatus.earliestDate} (${eventStatus.anyEventPassed ? 'Passed' : 'Upcoming'})`
                    : 'No shoot event recorded';
                  const titleStr = `${client.couple || client.name || `Client #${client.id}`} — ${eventDateStr}`;
                  return (
                    <option key={client.id} value={String(client.id)}>
                      {titleStr}
                    </option>
                  );
                })
              )}
            </select>

            {selectedClientData && (
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-[#6b6660]">
                <span className="font-semibold text-[#111417]">
                  {selectedClientData.client.couple || selectedClientData.client.name}
                </span>
                {selectedClientData.client.phone && <span>• {selectedClientData.client.phone}</span>}
                {selectedClientData.eventStatus.earliestDate && (
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                    selectedClientData.eventStatus.anyEventPassed
                      ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      : 'bg-amber-50 text-amber-800 border border-amber-200'
                  }`}>
                    {selectedClientData.eventStatus.anyEventPassed ? 'Shoot Date Passed' : 'Upcoming Shoot'}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Quick Presets */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1.5">
              Quick Suggestions
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRESET_DELIVERABLES.map((preset) => {
                const Icon = preset.icon;
                const isSelected = title === preset.title;
                return (
                  <button
                    key={preset.title}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#7a2e33] text-white border-[#7a2e33] shadow-2xs font-semibold'
                        : 'bg-[#f9f8f6] hover:bg-stone-100 text-[#111417] border-[#d4c1a3]'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{preset.title.split('(')[0].trim()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Title & Category */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1">
                Deliverable Title <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Cinematic Wedding Film (30-60 Min), Luxury Wedding Album"
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#7a2e33]" />
                Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] cursor-pointer"
              >
                {CATEGORY_OPTIONS.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Pricing & Billing (Extra / Billed Separately & Zero Amount) */}
          <div className="p-4 rounded-xl bg-[#f9f8f6] border border-[#d4c1a3] space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <IndianRupee className="w-4 h-4 text-[#7a2e33]" />
                <span className="text-xs font-bold text-[#111417] uppercase tracking-wider">
                  Separate Billing & Pricing
                </span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
                  Extra Item
                </span>
              </div>

              {/* Zero Amount Checkbox Option */}
              <label className="flex items-center gap-2 cursor-pointer bg-white px-2.5 py-1 rounded-lg border border-[#d4c1a3] hover:border-[#7a2e33] transition-colors">
                <input
                  type="checkbox"
                  checked={isZeroAmount}
                  onChange={(e) => handleZeroAmountToggle(e.target.checked)}
                  className="rounded border-[#d4c1a3] text-[#7a2e33] focus:ring-[#7a2e33]"
                />
                <span className="text-xs font-bold text-[#111417]">
                  Complimentary / Zero Amount (₹0)
                </span>
              </label>
            </div>

            <p className="text-[11px] text-[#6b6660]">
              This deliverable is marked as an additional service. You can set a custom selling price to bill separately, or mark it as zero amount (complimentary).
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-[#111417] mb-1">
                  Client Selling Price (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#6b6660]">₹</span>
                  <input
                    type="number"
                    min="0"
                    disabled={isZeroAmount}
                    value={isZeroAmount ? '0' : sellingPrice}
                    onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 15000"
                    className={`w-full pl-7 pr-3.5 py-2 text-sm border rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] ${
                      isZeroAmount
                        ? 'bg-stone-100 text-stone-500 border-[#d4c1a3] cursor-not-allowed'
                        : 'bg-white border-[#d4c1a3]'
                    }`}
                  />
                </div>
                {isZeroAmount && (
                  <span className="text-[10px] text-emerald-700 font-semibold block mt-1">
                    ✓ Billed at ₹0 (Complimentary / Included in contract)
                  </span>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-[#111417] mb-1">
                  Studio Cost Estimate / Payout (₹)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-xs font-bold text-[#6b6660]">₹</span>
                  <input
                    type="number"
                    min="0"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="e.g. 6000 (Optional)"
                    className="w-full pl-7 pr-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Due Date & Quantity */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-[#7a2e33]" />
                Target Due Date
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1">
                Billable Units / Specs (Sheets/Minutes/Photos)
              </label>
              <input
                type="number"
                min="1"
                value={billableQuantity}
                onChange={(e) => setBillableQuantity(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder={category === 'Album' ? '40 (Sheets)' : category === 'Photo' ? '300 (Photos)' : '45 (Minutes)'}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
              />
            </div>
          </div>

          {/* Assigned Editor */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-[#7a2e33]" />
              Assign Post-Production Editor (Optional)
            </label>
            <select
              value={assignedMemberId}
              onChange={(e) => setAssignedMemberId(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] cursor-pointer"
            >
              <option value="">— Unassigned (Assign later) —</option>
              {editors.map((m) => (
                <option key={m.id} value={String(m.id)}>
                  {m.name} ({m.role || 'Editor'})
                </option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#7a2e33]" />
              Editing Instructions & Client Notes
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Songs selected by bride, color grading reference, 4K master export format..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#d4c1a3]">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="px-4 py-2 text-xs font-bold text-[#6b6660] hover:text-[#111417] bg-white border border-[#d4c1a3] rounded-xl hover:bg-stone-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#7a2e33] hover:bg-[#5a2226] rounded-xl shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{saving ? 'Adding…' : 'Add Deliverable'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
