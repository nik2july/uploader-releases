import type { FreelancePricing } from '../types/freelance';
import { computeBillableUnits, computePricingTotal } from './freelancePricing';
import { findPostProductionService, resolvePostProductionServices, type PostProductionService } from './postProductionServices';

/** What a deliverable knows about how much work it is. */
export interface DeliverableMeasurements {
  /** Agreed with the couple when the quote was built. */
  billableQuantity?: number;
  /** Measured from the footage that was actually handed over. */
  rawDurationHours?: number;
  rawDurationMinutes?: number;
  rawPhotoCount?: number;
}

/**
 * How Post Production prices one deliverable for BAAWARAY FILMS.
 *
 * Two of the four services can be measured from the footage — hours of raw data,
 * photos to edit — and where a measurement exists it wins, because it is what was
 * actually handed over rather than what someone expected to hand over. The other
 * two cannot be: a Short Form is priced on the length of the finished cut and an
 * Album on its sheets, neither of which exists yet when the footage arrives. For
 * those, the amount agreed on the quote is the only number there is.
 *
 * Returns undefined when the service is not one Post Production prices, when the
 * studio has no rate for it, or when nothing says how much of it there is — all
 * of which mean "leave the charge alone" rather than "it is free".
 */
/**
 * Fills in the billable units, which is where the minimums live: under a minute
 * of output still bills as a minute, under an hour of raw data as an hour.
 */
function finalise(pricing: Omit<FreelancePricing, 'billableUnits'>): FreelancePricing {
  return { ...pricing, billableUnits: computeBillableUnits(pricing) };
}

export function pricingForDeliverable(
  serviceType: string | undefined,
  rate: number | undefined,
  measurements: DeliverableMeasurements,
  services: PostProductionService[] = resolvePostProductionServices(undefined)
): FreelancePricing | undefined {
  const service = findPostProductionService(serviceType, services);
  if (!service || !rate || rate <= 0) return undefined;

  const agreed = Number(measurements.billableQuantity);
  const hasAgreed = Number.isFinite(agreed) && agreed > 0;

  switch (service.basis) {
    case 'per_raw_hour': {
      const measuredHours = Number(measurements.rawDurationHours) || 0;
      const measuredMinutes = Number(measurements.rawDurationMinutes) || 0;
      if (measuredHours > 0 || measuredMinutes > 0) {
        return finalise({ basis: service.basis, rate, durationHours: measuredHours, durationMinutes: measuredMinutes });
      }
      return hasAgreed ? finalise({ basis: service.basis, rate, durationHours: agreed }) : undefined;
    }
    case 'per_photo':
    case 'per_raw_photo': {
      const measured = Number(measurements.rawPhotoCount) || 0;
      if (measured > 0) return finalise({ basis: service.basis, rate, quantity: measured });
      return hasAgreed ? finalise({ basis: service.basis, rate, quantity: agreed }) : undefined;
    }
    case 'per_output_minute':
      // Nothing measures a cut that has not been made.
      return hasAgreed ? finalise({ basis: service.basis, rate, durationMinutes: agreed }) : undefined;
    case 'per_sheet':
    case 'per_item':
      // Counted, and counted when it was sold: nothing measures how many reels.
      return hasAgreed ? finalise({ basis: service.basis, rate, quantity: agreed }) : undefined;
    default:
      return undefined;
  }
}

/** What that pricing comes to, or 0 when there is nothing to charge. */
export function chargeForDeliverable(
  serviceType: string | undefined,
  rate: number | undefined,
  measurements: DeliverableMeasurements,
  services?: PostProductionService[]
): number {
  const pricing = pricingForDeliverable(serviceType, rate, measurements, services);
  return pricing ? computePricingTotal(pricing) : 0;
}
