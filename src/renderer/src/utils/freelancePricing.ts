import { FreelancePricing, FreelancePricingBasis, FreelanceServiceType } from '../types/freelance';

/**
 * What freelance work costs, worked out from the thing being sold.
 *
 * The studio does not quote freelance jobs as a lump sum — each of the four services
 * is sold by its own unit, and the price is that unit rate times however much of it
 * this job has. Typing the total in by hand meant doing that multiplication in your
 * head on every job, and a total arrived at that way cannot be checked afterwards:
 * nobody can tell a mis-keyed figure from a genuinely discounted one.
 */

export interface FreelanceServiceDefinition {
  name: string;
  basis: FreelancePricingBasis;
  /** What the rate buys — sits beside the rate box. */
  rateSuffix: string;
  /** What is being counted, in the studio's own words. */
  measureLabel: string;
  /** Why it is measured that way, where that is not obvious. */
  note?: string;
  /** Shown when this job is short enough for the floor to be doing the charging. */
  minimumNote?: string;
}

/**
 * The four services, in the order the studio thinks of them.
 *
 * Short and long form are charged on opposite ends of the job on purpose: a teaser
 * is sold by what is delivered, a full film by the pile of footage handed over,
 * because that is what the work actually scales with in each case.
 */
export const FREELANCE_SERVICES: FreelanceServiceDefinition[] = [
  {
    name: 'Short Form',
    basis: 'per_output_minute',
    rateSuffix: 'per minute of output',
    measureLabel: 'Final cut length',
    note: 'Charged on what you deliver. Anything shorter than a minute still bills as a full minute.',
    minimumNote: 'Under a minute of output — billed as the one-minute minimum.',
  },
  {
    name: 'Long Form',
    basis: 'per_raw_hour',
    rateSuffix: 'per hour of raw data',
    measureLabel: 'Raw data handed over',
    note:
      'Charged on what you are given to work through, not on the length of the finished film. ' +
      'Anything under an hour still bills as a full hour.',
    minimumNote: 'Under an hour of raw data — billed as the one-hour minimum.',
  },
  {
    name: 'Edited Photos',
    basis: 'per_photo',
    rateSuffix: 'per photo',
    measureLabel: 'Photos to edit',
  },
  {
    name: 'Album',
    basis: 'per_sheet',
    rateSuffix: 'per sheet',
    measureLabel: 'Sheets in the album',
  },
];

/**
 * Time-based work never bills below one unit — one minute of output, one hour of raw
 * data — however little of it there is. The setup, review and hand-back around a
 * thirty-second reel or a twenty-minute card cost the same as they do around a long
 * one, so the floor is what stops the smallest jobs being sold at a loss.
 */
export const MINIMUM_BILLABLE_TIME_UNITS = 1;

/** Whether this service is sold by time, and so carries the floor. */
function isTimeBasis(basis: FreelancePricingBasis): boolean {
  return basis === 'per_output_minute' || basis === 'per_raw_hour';
}

export function serviceDefinition(
  serviceType: FreelanceServiceType | undefined
): FreelanceServiceDefinition | undefined {
  return FREELANCE_SERVICES.find(s => s.name === serviceType);
}

type Measurable = Pick<
  FreelancePricing,
  'basis' | 'durationHours' | 'durationMinutes' | 'durationSeconds' | 'quantity'
>;

/**
 * How many units this job bills for.
 *
 * Time converts proportionally — a 90-second cut is a minute and a half, not two —
 * so the studio charges for what it actually delivered. The one exception is the
 * short-form floor, which exists because the setup, review and hand-back around a
 * thirty-second reel cost the same as they do around a two-minute one.
 */
export function computeBillableUnits(pricing: Measurable): number {
  const measured = measuredUnits(pricing);
  if (measured <= 0) return 0;
  if (isTimeBasis(pricing.basis)) return Math.max(MINIMUM_BILLABLE_TIME_UNITS, round2(measured));
  return Math.floor(measured);
}

/** Whether the floor, rather than the work, is what this job is being charged for. */
export function isMinimumApplied(pricing: Measurable): boolean {
  const measured = measuredUnits(pricing);
  return isTimeBasis(pricing.basis) && measured > 0 && measured < MINIMUM_BILLABLE_TIME_UNITS;
}

/** What was actually measured, before the floor — minutes, hours, photos or sheets. */
function measuredUnits(pricing: Measurable): number {
  const hours = Number(pricing.durationHours) || 0;
  const minutes = Number(pricing.durationMinutes) || 0;
  const seconds = Number(pricing.durationSeconds) || 0;
  const quantity = Number(pricing.quantity) || 0;

  switch (pricing.basis) {
    case 'per_output_minute':
      return minutes + seconds / 60;
    case 'per_raw_hour':
      return hours + minutes / 60 + seconds / 3600;
    case 'per_photo':
    case 'per_sheet':
      return quantity;
    default:
      return 0;
  }
}

/** The client charge, in whole rupees — nobody bills a studio in paise. */
export function computePricingTotal(pricing: Measurable & Pick<FreelancePricing, 'rate'>): number {
  const rate = Number(pricing.rate) || 0;
  if (rate <= 0) return 0;
  return Math.round(computeBillableUnits(pricing) * rate);
}

/** The multiplication written out, so the total can be checked at a glance. */
export function describeBilling(pricing: Measurable & Pick<FreelancePricing, 'rate'>): string {
  const units = computeBillableUnits(pricing);
  const rate = Number(pricing.rate) || 0;
  if (units <= 0 || rate <= 0) return '';
  const unitName = unitNoun(pricing.basis, units);
  return `${trimNumber(units)} ${unitName} × ₹${rate.toLocaleString('en-IN')}`;
}

export function unitNoun(basis: FreelancePricingBasis, count: number): string {
  const one = count === 1;
  switch (basis) {
    case 'per_output_minute':
      return one ? 'minute' : 'minutes';
    case 'per_raw_hour':
      return one ? 'hour' : 'hours';
    case 'per_photo':
      return one ? 'photo' : 'photos';
    case 'per_sheet':
      return one ? 'sheet' : 'sheets';
    default:
      return 'units';
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function trimNumber(n: number): string {
  return Number.isInteger(n) ? String(n) : String(round2(n));
}
