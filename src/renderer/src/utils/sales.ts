import {
  Client,
  DateAvailability,
  Lead,
  LostReason,
  ProjectEvent,
  SalesStage,
} from '../types';
import { phoneKey } from '../lib/auth';

/**
 * Sales pipeline logic.
 *
 * The one rule this module exists to enforce: a booking is confirmed only when the
 * advance payment is received. Every metric here counts advance-paid leads and
 * nothing else, so sales figures can never be inflated by production activity or by
 * optimism about deals that have not actually closed.
 */

export const SALES_STAGES: { id: SalesStage; label: string; short: string }[] = [
  { id: 'new_enquiry', label: 'Inquiry Received', short: 'Inquiry' },
  { id: 'responded', label: 'Responded', short: 'Responded' },
  { id: 'consultation', label: 'Consultation Booked', short: 'Consult' },
  { id: 'quoted', label: 'Quote Sent', short: 'Quoted' },
  { id: 'booked', label: 'Advance Paid — Booked', short: 'Booked' },
];

export const LOST_REASONS: { id: LostReason; label: string }[] = [
  { id: 'price', label: 'Price too high' },
  { id: 'date_unavailable', label: 'Date unavailable' },
  { id: 'chose_competitor', label: 'Went with someone else' },
  { id: 'went_silent', label: 'Went silent' },
  { id: 'other', label: 'Other' },
];

/** Days at a stage before the follow-up queue starts nagging. */
export const DEFAULT_FOLLOWUP_THRESHOLDS: Record<string, number> = {
  responded: 3,
  quoted: 7,
};

/** Days a quoted lead may sit unpaid before counting as at-risk. */
export const DEFAULT_AT_RISK_DAYS = 7;

/** A tentative hold releases itself after this long so dates never block forever. */
export const HOLD_DURATION_DAYS = 7;

/**
 * Maps legacy stage values onto the current model.
 *
 * Records created before the sales rebuild used 'contacted' / 'proposal' / 'won',
 * and stored 'lost' as a stage rather than a flag. Reading through this keeps those
 * rows working without a destructive migration.
 */
export function normaliseLeadStage(raw: string | undefined | null, customStageIds: string[] = []): SalesStage {
  switch (raw) {
    case 'contacted':
      return 'responded';
    case 'proposal':
      return 'quoted';
    case 'won':
      return 'booked';
    case 'lost':
      // Lost is a flag now; the stage it died at is unknown for legacy rows.
      return 'new_enquiry';
    case 'new_enquiry':
    case 'responded':
    case 'consultation':
    case 'quoted':
    case 'booked':
      return raw;
    default:
      // A studio-added tracking stage (see PipelineStageConfig) passes straight
      // through — anything else unrecognised falls back to the top of the board.
      if (raw && customStageIds.includes(raw)) return raw;
      return 'new_enquiry';
  }
}

/**
 * Which board column a lead belongs in, given the studio's configured stages.
 *
 * The board used to compare `normaliseLeadStage(...)` against each column id
 * directly, and that let leads disappear. Two independent things have to line up
 * for that comparison to work — the stage stored on the lead, and the id of a
 * configured column — and when they drift apart the lead is not shown anywhere at
 * all. It is not archived, not lost, not in a "other" bucket: it is in the
 * database, counted in no column, and invisible on the screen the studio runs its
 * sales from. That happened here: the saved pipeline still called its first column
 * `inquiry`, the name the sales rebuild replaced with `new_enquiry`, so the column
 * matched neither the leads written under the old name nor the ones written under
 * the new one, and showed (0) with five real enquiries filed under it.
 *
 * So the fallback lands somewhere real. A stage that matches a configured column
 * uses it; anything else — a legacy name, a stage from a pipeline the studio has
 * since reconfigured, a value written by an older client — goes to the first
 * column, which is where an unclassified enquiry belongs anyway. The board may show
 * a lead in an unexpected column; it may never silently drop one.
 */
export function pipelineColumnFor(
  raw: string | undefined | null,
  stageIds: readonly string[]
): string {
  if (stageIds.length === 0) return normaliseLeadStage(raw);
  // Passing the configured ids lets a studio-named stage through the normaliser
  // instead of being flattened to the canonical top-of-board value.
  const normalised = normaliseLeadStage(raw, stageIds as string[]);
  return stageIds.includes(normalised) ? normalised : stageIds[0];
}

/** True when a lead is out of the active pipeline (legacy stage or explicit flag). */
export function isLeadLost(lead: Lead): boolean {
  return Boolean(lead.isLost) || lead.stage === 'lost';
}

/**
 * A lead counts as booked only with an advance recorded.
 *
 * Deliberately stricter than the stage alone: if data drifts, or a legacy row says
 * 'won' without a payment, it is not treated as revenue.
 */
export function isLeadBooked(lead: Lead): boolean {
  if (isLeadLost(lead)) return false;
  return (
    normaliseLeadStage(lead.stage) === 'booked' &&
    typeof lead.advanceAmount === 'number' &&
    lead.advanceAmount > 0 &&
    Boolean(lead.advancePaidAt)
  );
}

/** Open pipeline: not booked, not lost. */
export function isLeadActive(lead: Lead): boolean {
  return !isLeadLost(lead) && !isLeadBooked(lead);
}

function startOfDay(d: Date): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

export function daysBetween(fromIso: string | undefined, to: Date = new Date()): number {
  if (!fromIso) return 0;
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  const ms = startOfDay(to).getTime() - startOfDay(from).getTime();
  return Math.max(0, Math.floor(ms / 86400000));
}

/** How long this lead has sat at its current stage. */
export function daysInStage(lead: Lead, now: Date = new Date()): number {
  return daysBetween(lead.stageEnteredAt || lead.inquiredAt, now);
}

/** Hours from inquiry to first reply — couples often book whoever answers first. */
export function firstResponseHours(lead: Lead): number | null {
  if (!lead.inquiredAt || !lead.respondedAt) return null;
  const a = new Date(lead.inquiredAt).getTime();
  const b = new Date(lead.respondedAt).getTime();
  if (Number.isNaN(a) || Number.isNaN(b) || b < a) return null;
  return Math.round(((b - a) / 3600000) * 10) / 10;
}

/**
 * Quoted leads that have gone quiet past the threshold — the biggest revenue leak.
 */
export function isAtRisk(lead: Lead, thresholdDays = DEFAULT_AT_RISK_DAYS, now = new Date()): boolean {
  if (!isLeadActive(lead)) return false;
  if (normaliseLeadStage(lead.stage) !== 'quoted') return false;
  return daysInStage(lead, now) >= thresholdDays;
}

/** Anything overdue for a nudge: an explicit follow-up date, or a stalled stage. */
export function isFollowUpDue(
  lead: Lead,
  thresholds: Record<string, number> = DEFAULT_FOLLOWUP_THRESHOLDS,
  now: Date = new Date()
): boolean {
  if (!isLeadActive(lead)) return false;

  const explicit = lead.nextFollowUpAt || lead.followUp;
  if (explicit) {
    const due = new Date(explicit);
    if (!Number.isNaN(due.getTime()) && startOfDay(due) <= startOfDay(now)) return true;
  }

  const stage = normaliseLeadStage(lead.stage);
  const limit = thresholds[stage];
  return typeof limit === 'number' && daysInStage(lead, now) >= limit;
}

/**
 * Wedding season label for a date.
 *
 * Indian wedding season straddles the new year (roughly Oct–Mar), so a calendar year
 * would split a single season in half and make year-over-year comparison meaningless.
 * A season is named for the year it starts in: Oct 2026–Sep 2027 is "2026–27".
 */
export function seasonOf(dateIso: string | undefined): string {
  if (!dateIso) return 'unknown';
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return 'unknown';
  const year = d.getFullYear();
  const startYear = d.getMonth() >= 9 ? year : year - 1; // month 9 = October
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, '0')}`;
}

export function currentSeason(now: Date = new Date()): string {
  return seasonOf(now.toISOString());
}

/** The season immediately before the given one, for year-over-year comparison. */
export function previousSeason(season: string): string {
  const startYear = Number(season.split('-')[0]);
  if (!Number.isFinite(startYear)) return 'unknown';
  const prev = startYear - 1;
  return `${prev}-${String((prev + 1) % 100).padStart(2, '0')}`;
}

export interface SalesOverviewStats {
  season: string;
  previousSeason: string;
  bookingsThisSeason: number;
  bookingsLastSeason: number;
  revenueThisSeason: number;
  inquiriesThisWeek: number;
  inquiriesThisMonth: number;
  quotesSent: number;
  quotesConverted: number;
  quoteToBookingRate: number;
  atRiskCount: number;
  atRiskValue: number;
}

/**
 * The four Overview tiles.
 *
 * Reads leads for funnel shape and client advance logs for confirmed bookings.
 * Nothing downstream of the advance — shoot status, editing, delivery — is consulted,
 * so sales figures can never be inflated by production activity.
 */
export function computeOverviewStats(
  leads: Lead[],
  atRiskDays = DEFAULT_AT_RISK_DAYS,
  now: Date = new Date(),
  clients: Client[] = []
): SalesOverviewStats {
  const season = currentSeason(now);
  const prev = previousSeason(season);

  /**
   * Bookings are counted from recorded advances, not from lead stages alone.
   *
   * A deal can originate as a lead or straight from a quotation, and only the
   * advance payment log is written by both paths — so it is the one place that sees
   * every booking exactly once. Balance instalments are excluded via `isAdvance`,
   * which is what keeps production payments out of the sales figures.
   */
  const advanceRows: { at: string; amount: number }[] = [];
  clients.forEach(c => {
    (c.paymentLogs || [])
      .filter(log => log.isAdvance)
      .forEach(log => advanceRows.push({ at: log.date, amount: Number(log.amount) || 0 }));
  });

  // Leads booked before advance logs existed still count, without double-counting
  // the ones already represented by a client advance row.
  const legacyBooked = leads.filter(
    l => isLeadBooked(l) && !advanceRows.some(r => r.at === l.advancePaidAt)
  );
  legacyBooked.forEach(l =>
    advanceRows.push({ at: l.advancePaidAt || l.date, amount: Number(l.value) || 0 })
  );

  const bookedThis = advanceRows.filter(r => seasonOf(r.at) === season);
  const bookedPrev = advanceRows.filter(r => seasonOf(r.at) === prev);

  const weekAgo = new Date(now);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(now);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  const inquiredSince = (since: Date) =>
    leads.filter(l => {
      const raw = l.inquiredAt;
      if (!raw) return false;
      const d = new Date(raw);
      return !Number.isNaN(d.getTime()) && d >= since && d <= now;
    }).length;

  // Anything that reached the quote stage at any point, whether or not it closed.
  const reachedQuote = leads.filter(l => {
    if (isLeadBooked(l)) return true;
    const stage = normaliseLeadStage(l.stage);
    return stage === 'quoted' || Boolean(l.quotationId);
  });
  const convertedFromQuote = reachedQuote.filter(isLeadBooked);

  const atRisk = leads.filter(l => isAtRisk(l, atRiskDays, now));

  return {
    season,
    previousSeason: prev,
    bookingsThisSeason: bookedThis.length,
    bookingsLastSeason: bookedPrev.length,
    revenueThisSeason: bookedThis.reduce((sum, r) => sum + r.amount, 0),
    inquiriesThisWeek: inquiredSince(weekAgo),
    inquiriesThisMonth: inquiredSince(monthAgo),
    quotesSent: reachedQuote.length,
    quotesConverted: convertedFromQuote.length,
    quoteToBookingRate:
      reachedQuote.length > 0
        ? Math.round((convertedFromQuote.length / reachedQuote.length) * 100)
        : 0,
    atRiskCount: atRisk.length,
    atRiskValue: atRisk.reduce((sum, l) => sum + (Number(l.value) || 0), 0),
  };
}

export interface SourcePerformance {
  source: string;
  inquiries: number;
  bookings: number;
  revenue: number;
  conversionRate: number;
}

/** Where the money actually comes from, so marketing spend can follow it. */
export function computeSourcePerformance(leads: Lead[]): SourcePerformance[] {
  const bySource = new Map<string, SourcePerformance>();

  leads.forEach(lead => {
    const source = (lead.source || 'Unknown').trim() || 'Unknown';
    const row =
      bySource.get(source) ||
      { source, inquiries: 0, bookings: 0, revenue: 0, conversionRate: 0 };
    row.inquiries += 1;
    if (isLeadBooked(lead)) {
      row.bookings += 1;
      row.revenue += Number(lead.value) || 0;
    }
    bySource.set(source, row);
  });

  return Array.from(bySource.values())
    .map(r => ({
      ...r,
      conversionRate: r.inquiries > 0 ? Math.round((r.bookings / r.inquiries) * 100) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.inquiries - a.inquiries);
}

export interface LossBreakdown {
  reason: LostReason | 'unspecified';
  label: string;
  count: number;
  value: number;
}

/** Season-end view of why deals died — price, availability, or speed. */
export function computeLossBreakdown(leads: Lead[], season?: string): LossBreakdown[] {
  const lost = leads.filter(l => {
    if (!isLeadLost(l)) return false;
    if (!season) return true;
    return seasonOf(l.lostAt || l.date) === season;
  });

  const byReason = new Map<string, LossBreakdown>();
  lost.forEach(l => {
    const reason = l.lostReason || 'unspecified';
    const label =
      LOST_REASONS.find(r => r.id === reason)?.label || 'Reason not recorded';
    const row = byReason.get(reason) || { reason: reason as any, label, count: 0, value: 0 };
    row.count += 1;
    row.value += Number(l.value) || 0;
    byReason.set(reason, row);
  });

  return Array.from(byReason.values()).sort((a, b) => b.count - a.count);
}

/**
 * Whether a date can be shot, checking confirmed events and live tentative holds.
 *
 * Expired holds are ignored rather than deleted here — release is handled where the
 * data can actually be written, so this stays a pure read.
 */
export function checkDateAvailability(
  dateIso: string,
  projects: ProjectEvent[],
  leads: Lead[],
  now: Date = new Date()
): { status: DateAvailability; conflictWith?: string } {
  if (!dateIso) return { status: 'available' };
  const target = dateIso.slice(0, 10);

  const booked = projects.find(p => (p.date || '').slice(0, 10) === target);
  if (booked) {
    return { status: 'taken', conflictWith: booked.couple || booked.eventName };
  }

  const held = leads.find(l => {
    if (!isLeadActive(l)) return false;
    if ((l.date || '').slice(0, 10) !== target) return false;
    if (l.dateAvailability !== 'tentative_hold') return false;
    if (!l.holdExpiresAt) return false;
    return new Date(l.holdExpiresAt) > now;
  });
  if (held) {
    return { status: 'tentative_hold', conflictWith: held.couple };
  }

  return { status: 'available' };
}

/** Expiry timestamp for a hold placed now. */
export function holdExpiryFrom(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + HOLD_DURATION_DAYS);
  return d.toISOString();
}

/** A partial advance blocks the date for a full month, not the default week — it's
 * real money in hand, so the couple gets longer before the date can be re-quoted. */
export const PARTIAL_ADVANCE_HOLD_DAYS = 30;

export function partialAdvanceHoldExpiry(fromDate: string): string {
  const d = new Date(fromDate);
  d.setDate(d.getDate() + PARTIAL_ADVANCE_HOLD_DAYS);
  return d.toISOString();
}

export function isHoldExpired(lead: Lead, now: Date = new Date()): boolean {
  if (lead.dateAvailability !== 'tentative_hold' || !lead.holdExpiresAt) return false;
  return new Date(lead.holdExpiresAt) <= now;
}

/** Peak season weekends fill first, so they are worth flagging on the calendar. */
export function isPeakSeasonWeekend(dateIso: string): boolean {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return false;
  const month = d.getMonth();
  const day = d.getDay();
  const inPeak = month >= 9 || month <= 2; // Oct–Mar
  const isWeekend = day === 0 || day === 5 || day === 6; // Fri–Sun
  return inPeak && isWeekend;
}

/** Past clients, for tagging a referral back to whoever sent it. */
export function findReferrer(clients: Client[], referredByClientId?: number): Client | undefined {
  if (!referredByClientId) return undefined;
  return clients.find(c => c.id === referredByClientId);
}

/** Someone already on file under the same phone number. */
export interface PhoneMatch {
  kind: 'lead' | 'client';
  id: number;
  name: string;
  /** Only for leads — lets the caller jump straight to the existing inquiry. */
  lead?: Lead;
}

/**
 * Everyone already recorded against a phone number.
 *
 * The phone number is a person's login identity: client sign-in resolves an account
 * with `rows.find(r => phoneKey(r.phone) === digits)`, so a second record sharing a
 * number means one of them can never be logged into, and which one wins is arbitrary.
 * Filing a duplicate has to be caught while it is being typed, not discovered when
 * the couple cannot sign in.
 *
 * Matching reuses `phoneKey` from the auth layer, so what counts as "the same number"
 * here is exactly what counts at the login screen — bare ten digits and +91-prefixed
 * forms of one number are the same person.
 */
export function findPhoneMatches(
  phone: string | undefined,
  leads: Lead[],
  clients: Client[],
  options: { excludeLeadId?: number | null } = {}
): PhoneMatch[] {
  const key = phoneKey(phone);
  // Below ten digits it is still being typed — warning then is just noise.
  if (key.length < 10) return [];

  const matches: PhoneMatch[] = [];

  leads.forEach(lead => {
    if (options.excludeLeadId != null && lead.id === options.excludeLeadId) return;
    if (isLeadLost(lead)) return;
    if (phoneKey(lead.phone) !== key) return;
    matches.push({ kind: 'lead', id: lead.id, name: lead.couple || 'Unnamed inquiry', lead });
  });

  clients.forEach(client => {
    if (phoneKey(client.phone) !== key) return;
    matches.push({ kind: 'client', id: client.id, name: client.name || 'Unnamed client' });
  });

  return matches;
}
