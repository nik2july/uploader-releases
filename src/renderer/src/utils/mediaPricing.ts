import type { FreelancePricing } from '../types/freelance';
import { computeBillableUnits, computePricingTotal, serviceDefinition } from './freelancePricing';

export interface MediaMeasurement {
  rawDurationSeconds: number;
  photoCount: number;
  unknownVideoCount: number;
}

export interface MediaBillingInput {
  serviceType: string;
  rate: number;
  outputMinutes: number;
  outputSeconds: number;
  keepPercent: number;
  photosPerSheet: number;
  quantityOverride?: number;
}

export interface MediaBillingResult {
  pricing: FreelancePricing;
  amount: number;
  keptPhotos: number;
  excludedPhotos: number;
  estimatedSheets: number;
  measurement: MediaMeasurement;
  input: MediaBillingInput;
  policyVersion: 1;
}

function finite(name: string, value: number, min = 0, max = Number.MAX_SAFE_INTEGER): number {
  if (!Number.isFinite(value) || value < min || value > max) throw new Error(`${name} is outside the allowed range.`);
  return value;
}

/** Shared by the web app and desktop. Selection changes billing, never source files. */
export function calculateMediaBilling(measurement: MediaMeasurement, input: MediaBillingInput): MediaBillingResult {
  const service = serviceDefinition(input.serviceType);
  if (!service) throw new Error('Choose a supported billing service.');
  finite('Rate', input.rate);
  finite('Raw duration', measurement.rawDurationSeconds);
  finite('Photo count', measurement.photoCount);
  finite('Keep percentage', input.keepPercent, 0, 100);
  finite('Photos per sheet', input.photosPerSheet, 1, 100);
  finite('Output minutes', input.outputMinutes);
  finite('Output seconds', input.outputSeconds, 0, 59);
  if (!Number.isInteger(measurement.photoCount)) throw new Error('Photo count must be a whole number.');
  if (input.quantityOverride !== undefined) {
    finite('Quantity override', input.quantityOverride);
    if (!Number.isInteger(input.quantityOverride)) throw new Error('Quantity must be a whole number.');
  }
  if (service.basis === 'per_raw_hour' && measurement.unknownVideoCount > 0) {
    throw new Error('Resolve or explicitly exclude clips with unknown duration before billing long form.');
  }
  const keptPhotos = Math.round(measurement.photoCount * input.keepPercent / 100);
  const estimatedSheets = Math.ceil(measurement.photoCount / input.photosPerSheet);
  const duration = measurement.rawDurationSeconds;
  const draft = {
    basis: service.basis,
    rate: input.rate,
    durationHours: service.basis === 'per_raw_hour' ? Math.floor(duration / 3600) : undefined,
    durationMinutes: service.basis === 'per_raw_hour' ? Math.floor(duration % 3600 / 60) : input.outputMinutes,
    durationSeconds: service.basis === 'per_raw_hour' ? duration % 60 : input.outputSeconds,
    quantity: service.basis === 'per_photo' ? input.quantityOverride ?? keptPhotos
      : service.basis === 'per_sheet' ? input.quantityOverride ?? estimatedSheets : undefined,
  };
  if (service.basis === 'per_photo' && (draft.quantity ?? 0) > measurement.photoCount) {
    throw new Error('Selected photos cannot exceed the counted photos.');
  }
  return {
    pricing: { ...draft, billableUnits: computeBillableUnits(draft) },
    amount: computePricingTotal(draft), keptPhotos, excludedPhotos: measurement.photoCount - keptPhotos,
    estimatedSheets, measurement: { ...measurement }, input: { ...input }, policyVersion: 1,
  };
}

/**
 * Preserve the agreed quote while reconstructing its actual service unit.
 *
 * A request submitted since the form started pricing through
 * `calculateMediaBilling` carries its own `pricing`, and that is used as-is.
 * Everything older is reconstructed, and the reconstruction deliberately honours
 * the figure the partner studio was actually shown — dividing the quoted charge
 * by the quoted rate — even where that figure was reached without the one-minute
 * and one-hour minimums the rules apply. Recomputing it here would silently
 * re-price a quote that has already been given.
 */
export function pricingFromRequest(req: {
  serviceType: string; quotedRate?: number; quotedCharge?: number;
  durationHours?: number; durationMinutes?: number; durationSeconds?: number; quantity?: number;
  pricing?: FreelancePricing;
}): FreelancePricing | undefined {
  if (req.pricing) return req.pricing;
  const service = serviceDefinition(req.serviceType);
  if (!service || !req.quotedRate || req.quotedRate < 0) return undefined;
  const draft = { basis: service.basis, rate: req.quotedRate,
    durationHours: req.durationHours, durationMinutes: req.durationMinutes,
    durationSeconds: req.durationSeconds, quantity: req.quantity };
  return { ...draft, billableUnits: req.quotedCharge !== undefined
    ? req.quotedCharge / req.quotedRate : computeBillableUnits(draft) };
}
