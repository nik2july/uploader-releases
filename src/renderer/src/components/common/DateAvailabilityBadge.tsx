import React from 'react';
import { Lead, ProjectEvent } from '../../types';
import { checkDateAvailability } from '../../utils/sales';
import { CalendarCheck, CalendarX, Clock } from 'lucide-react';

interface DateAvailabilityBadgeProps {
  date: string;
  projects: ProjectEvent[];
  leads: Lead[];
  /** Ignore this lead's own hold, so editing a lead doesn't flag itself as a clash. */
  ignoreLeadId?: number;
  className?: string;
}

/**
 * Whether a date can actually be shot.
 *
 * Surfaced right next to the date picker because quoting a date that is already
 * taken is the one mistake that cannot be walked back gracefully — the couple has
 * already seen the price by then.
 */
export const DateAvailabilityBadge: React.FC<DateAvailabilityBadgeProps> = ({
  date,
  projects,
  leads,
  ignoreLeadId,
  className = '',
}) => {
  if (!date) return null;

  const scopedLeads = ignoreLeadId ? leads.filter(l => l.id !== ignoreLeadId) : leads;
  const { status, conflictWith } = checkDateAvailability(date, projects, scopedLeads);

  const config = {
    available: {
      Icon: CalendarCheck,
      label: 'Date available',
      cls: 'bg-emerald-50 text-emerald-900 border-emerald-200',
    },
    taken: {
      Icon: CalendarX,
      label: conflictWith ? `Date taken — ${conflictWith}` : 'Date already booked',
      cls: 'bg-rose-50 text-rose-900 border-rose-300',
    },
    tentative_hold: {
      Icon: Clock,
      label: conflictWith ? `On hold — ${conflictWith}` : 'Tentative hold',
      cls: 'bg-amber-50 text-amber-900 border-amber-300',
    },
  }[status];

  const { Icon, label, cls } = config;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-[11px] font-bold ${cls} ${className}`}
      title={
        status === 'taken'
          ? 'A confirmed booking already occupies this date.'
          : status === 'tentative_hold'
          ? 'Another lead is holding this date. Holds release themselves after 7 days.'
          : 'Nothing booked or held on this date.'
      }
    >
      <Icon className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
    </span>
  );
};
