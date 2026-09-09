import React from 'react';
import { MessageCircle } from 'lucide-react';

interface WhatsAppButtonProps {
  phone: string;
  className?: string;
  /** Prefilled message text, e.g. a follow-up nudge. */
  message?: string;
}

/**
 * The single contact action across the Sales module — WhatsApp only, since that's
 * the one channel the studio actually replies on. Replaces the old call + message
 * icon pair everywhere leads and clients are reachable from a list row.
 */
export const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({ phone, className = '', message }) => {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  if (!cleanPhone) return null;
  const target = cleanPhone.length === 10 ? `91${cleanPhone}` : cleanPhone;
  const url = `https://wa.me/${target}${message ? `?text=${encodeURIComponent(message)}` : ''}`;

  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      onClick={e => e.stopPropagation()}
      title="WhatsApp"
      className={`p-1.5 rounded-lg bg-white border border-emerald-300 text-emerald-700 hover:border-emerald-600 hover:bg-emerald-50 transition-colors ${className}`}
    >
      <MessageCircle className="w-3.5 h-3.5" />
    </a>
  );
};
