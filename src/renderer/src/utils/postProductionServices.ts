import type { CrewRoleConfig } from '../types';
import type { FreelancePricingBasis } from '../types/freelance';
import { FREELANCE_SERVICES } from './freelancePricing';

/** A service Post Production sells, and how it is measured. */
export interface PostProductionService {
  /** The crew role this came from, when the studio configured it. */
  id?: string;
  name: string;
  basis: FreelancePricingBasis;
  /** "per minute of output", "per sheet" — what the rate is per. */
  rateSuffix: string;
  /** "Final cut length", "Sheets in the album" — what to ask for. */
  measureLabel: string;
  /** Preset default quantity / duration (e.g. 5 for 5-min trailer, 40 for 40-sheet album) */
  defaultQuantity?: number;
  /** Default editor payout / cost rate */
  defaultCostRate?: number;
  clientBillingRate?: number;
  note?: string;
  minimumNote?: string;
}

const UNIT_WORDS: Record<FreelancePricingBasis, { rateSuffix: string; measureLabel: string }> = {
  per_output_minute: { rateSuffix: 'per minute of output', measureLabel: 'Final cut length' },
  per_raw_hour: { rateSuffix: 'per hour of raw data', measureLabel: 'Raw data handed over' },
  per_photo: { rateSuffix: 'per photo', measureLabel: 'Photos to deliver' },
  per_sheet: { rateSuffix: 'per sheet', measureLabel: 'Sheets in the album' },
  per_item: { rateSuffix: 'per item', measureLabel: 'How many' },
  per_raw_photo: { rateSuffix: 'per raw photo', measureLabel: 'Raw photos to cull' },
};

/**
 * Everything Post Production sells, from the studio's own settings.
 *
 * The four it started with were a constant in the source, so selling a fifth —
 * an Instagram post, a set of reels — meant editing code and shipping a build.
 * A deliverable service now says how it is measured, and saying so is what makes
 * it something Post Production prices.
 *
 * The built-in four are the floor rather than the whole list: a studio that has
 * configured nothing keeps exactly the behaviour it had, and a configured
 * service of the same name replaces its definition rather than duplicating it.
 */
export function resolvePostProductionServices(crewRoles: CrewRoleConfig[] | undefined): PostProductionService[] {
  const byName = new Map<string, PostProductionService>();
  for (const service of FREELANCE_SERVICES) {
    byName.set(service.name.trim().toLowerCase(), {
      name: service.name, basis: service.basis,
      rateSuffix: service.rateSuffix, measureLabel: service.measureLabel,
      note: service.note, minimumNote: service.minimumNote,
    });
  }
  for (const role of crewRoles || []) {
    const basis = role.postProductionBasis;
    if (!basis || !UNIT_WORDS[basis] || !role.name?.trim()) continue;
    byName.set(role.name.trim().toLowerCase(), {
      id: role.id, name: role.name.trim(), basis, ...UNIT_WORDS[basis],
      defaultQuantity: role.defaultQuantity,
      defaultCostRate: role.defaultCostRate,
      clientBillingRate: role.clientBillingRate || role.defaultRate,
    });
  }
  return [...byName.values()];
}

/**
 * The service a piece of work is, however its name was typed.
 *
 * Case and surrounding space are ignored because the name comes from a settings
 * form. Nothing else is: a near miss returns undefined, so work Post Production
 * does not sell is left alone rather than priced as something it resembles.
 */
export function findPostProductionService(
  name: string | undefined,
  services: PostProductionService[]
): PostProductionService | undefined {
  const cleaned = (name || '').trim().toLowerCase();
  if (!cleaned) return undefined;
  return services.find(service => service.name.trim().toLowerCase() === cleaned);
}
