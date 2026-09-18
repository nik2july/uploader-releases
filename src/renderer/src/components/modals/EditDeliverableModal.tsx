import React, { useState, useEffect } from 'react';
import {
  X,
  Edit3,
  Calendar,
  Layers,
  FileText,
  IndianRupee,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Film,
  Sparkles,
} from 'lucide-react';
import { ClientDeliverable } from '../../types';
import { updateClientDeliverable, deleteClientDeliverable } from '../../lib/studioRepository';

export interface EditDeliverableModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: string;
  clientName: string;
  deliverable: ClientDeliverable;
  availableServices?: string[];
  onSaved?: () => void;
  onDeleted?: () => void;
}

const DEFAULT_SERVICES = [
  'Album',
  'Frame',
  'Trailer',
  'Edited Photos',
  'Cinematic Film',
  'Reel / Teaser',
  'Long Form',
  'Traditional Video',
  'Traditional Photos',
  'Raw Rushes',
];

export const EditDeliverableModal: React.FC<EditDeliverableModalProps> = ({
  isOpen,
  onClose,
  clientId,
  clientName,
  deliverable,
  availableServices = DEFAULT_SERVICES,
  onSaved,
  onDeleted,
}) => {
  const [title, setTitle] = useState(deliverable?.title || '');
  const [category, setCategory] = useState(deliverable?.category || 'Album');
  const [dueDate, setDueDate] = useState(deliverable?.dueDate || '');
  const [billableQuantity, setBillableQuantity] = useState<number | ''>(
    deliverable?.billableQuantity !== undefined ? deliverable.billableQuantity : ''
  );
  const [notes, setNotes] = useState(deliverable?.notes || '');
  const [sellingPrice, setSellingPrice] = useState<number | ''>(
    deliverable?.sellingPrice !== undefined ? deliverable.sellingPrice : ''
  );
  const [costPrice, setCostPrice] = useState<number | ''>(
    deliverable?.costPrice !== undefined ? deliverable.costPrice : ''
  );
  const [status, setStatus] = useState(deliverable?.status || 'pending');

  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (deliverable) {
      setTitle(deliverable.title || '');
      setCategory(deliverable.category || 'Album');
      setDueDate(deliverable.dueDate || '');
      setBillableQuantity(
        deliverable.billableQuantity !== undefined ? deliverable.billableQuantity : ''
      );
      setNotes(deliverable.notes || '');
      setSellingPrice(deliverable.sellingPrice !== undefined ? deliverable.sellingPrice : '');
      setCostPrice(deliverable.costPrice !== undefined ? deliverable.costPrice : '');
      setStatus(deliverable.status || 'pending');
      setError('');
    }
  }, [deliverable, isOpen]);

  if (!isOpen || !deliverable) return null;

  const combinedServices = Array.from(
    new Set([...availableServices, category, 'Album', 'Frame', 'Trailer', 'Edited Photos'])
  ).filter(Boolean);

  const isAlbum = category.toLowerCase().includes('album') || title.toLowerCase().includes('album');
  const isFrame = category.toLowerCase().includes('frame') || title.toLowerCase().includes('frame');

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('Please provide a deliverable title.');
      return;
    }

    try {
      setSaving(true);
      setError('');
      await updateClientDeliverable(clientId, deliverable.id, {
        title: title.trim(),
        category: category.trim(),
        dueDate: dueDate || undefined,
        billableQuantity: billableQuantity === '' ? undefined : Number(billableQuantity),
        notes: notes.trim() || undefined,
        sellingPrice: sellingPrice === '' ? undefined : Number(sellingPrice),
        costPrice: costPrice === '' ? undefined : Number(costPrice),
        status,
      });
      onSaved?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to update deliverable:', err);
      setError(err.message || 'Failed to update deliverable.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (
      !window.confirm(
        `Are you sure you want to remove "${deliverable.title}" for ${clientName}? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setDeleting(true);
      setError('');
      await deleteClientDeliverable(clientId, deliverable.id);
      onDeleted?.();
      onClose();
    } catch (err: any) {
      console.error('Failed to delete deliverable:', err);
      setError(err.message || 'Failed to delete deliverable.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl max-w-xl w-full shadow-2xl border border-[#d4c1a3]/40 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#d4c1a3]/30 flex items-center justify-between bg-[#fbf9f5]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#7a2e33]/10 flex items-center justify-center text-[#7a2e33]">
              <Edit3 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-[#111417] leading-tight">Edit Deliverable</h2>
              <div className="text-xs text-[#6b6660] mt-0.5">
                Client: <span className="font-semibold text-[#111417]">{clientName}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-[#6b6660] hover:text-[#111417] p-1.5 rounded-lg hover:bg-stone-200/50 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSave} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{error}</span>
            </div>
          )}

          {/* Title */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1">
              Deliverable Title <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Two Album or 40Sheets/200 Each, 20x30 Inches Frame, Trailer"
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
            />
          </div>

          {/* Service & Due Date Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
                <Layers className="w-3.5 h-3.5 text-[#7a2e33]" />
                Service / Category
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] cursor-pointer"
              >
                {combinedServices.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

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
          </div>

          {/* Quantity / Units */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>
                {isAlbum
                  ? 'Sheets Count (e.g. 40 Sheets)'
                  : isFrame
                  ? 'Frames Count (e.g. 4 Frames)'
                  : 'Quantity / Units'}
              </span>
              {isAlbum && billableQuantity && Number(billableQuantity) > 0 && (
                <span className="text-[11px] font-semibold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                  ≈ {Number(billableQuantity) * 5} photos needed (5 per sheet average)
                </span>
              )}
            </label>
            <input
              type="number"
              min="1"
              value={billableQuantity}
              onChange={(e) => setBillableQuantity(e.target.value === '' ? '' : Number(e.target.value))}
              placeholder={isAlbum ? '40' : isFrame ? '4' : '1'}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
            />
            {isAlbum && (
              <p className="text-[11px] text-[#6b6660] mt-1">
                Formula: Each sheet accommodates ~5 photos on average. Setting this to 40 will request 200 photos from the client.
              </p>
            )}
          </div>

          {/* Special Notes / Instructions */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-[#7a2e33]" />
              Deliverable Specifications / Notes
            </label>
            <textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Velvet finish cover, 20x30 inch synthetic frame, client songs selection..."
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] resize-none"
            />
          </div>

          {/* Pricing Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-[#7a2e33]" />
                Client Selling Price (₹)
              </label>
              <input
                type="number"
                min="0"
                value={sellingPrice}
                onChange={(e) => setSellingPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1 flex items-center gap-1">
                <IndianRupee className="w-3.5 h-3.5 text-[#7a2e33]" />
                Studio Cost Price (₹)
              </label>
              <input
                type="number"
                min="0"
                value={costPrice}
                onChange={(e) => setCostPrice(e.target.value === '' ? '' : Number(e.target.value))}
                placeholder="0"
                className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33]"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-bold text-[#111417] uppercase tracking-wider mb-1">
              Deliverable Status
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              className="w-full px-3.5 py-2 text-sm bg-white border border-[#d4c1a3] rounded-xl focus:outline-none focus:border-[#7a2e33] focus:ring-1 focus:ring-[#7a2e33] cursor-pointer"
            >
              <option value="pending">Pending (Awaiting Footage / Selection)</option>
              <option value="in_progress">In Progress</option>
              <option value="completed">Completed / Final Master</option>
              <option value="delivered">Delivered to Client</option>
            </select>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-[#d4c1a3]/40 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={deleting || saving}
              onClick={handleDelete}
              className="px-3 py-2 text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              title="Delete this deliverable"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{deleting ? 'Removing...' : 'Delete Deliverable'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="px-4 py-2 text-xs font-semibold text-[#6b6660] hover:text-[#111417] rounded-xl hover:bg-stone-100 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 bg-[#7a2e33] hover:bg-[#5f2428] text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Changes'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
