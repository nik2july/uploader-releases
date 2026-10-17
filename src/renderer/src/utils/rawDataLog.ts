import type { ScanSummary } from '../../../shared/contracts';

/** What a scan says was received, in the fields the work records it in. */
export interface LoggedMeasurements {
  rawDurationHours: number;
  rawDurationMinutes: number;
  rawPhotoCount: number;
}

/**
 * Split a duration into hours and minutes.
 *
 * Rounding the minutes on their own produces "0h 60m" for anything within thirty
 * seconds of the hour — not a figure anyone would write, and one the manual entry
 * form rejects outright. Rounding to whole minutes first and splitting after
 * cannot say sixty.
 */
export function splitDuration(totalSeconds: number): { hours: number; minutes: number } {
  const safe = Number.isFinite(totalSeconds) && totalSeconds > 0 ? totalSeconds : 0;
  const totalMinutes = Math.round(safe / 60);
  return { hours: Math.floor(totalMinutes / 60), minutes: totalMinutes % 60 };
}

/**
 * What to record against the work from a finished scan.
 *
 * Photos are the billable count rather than the raw file count: a RAW and its
 * JPEG are one photo to edit, and the scan has already applied the studio's
 * pairing rule. Recording the file count instead would bill some couples twice.
 */
export function measurementsFromScan(scan: ScanSummary | undefined): LoggedMeasurements {
  const { hours, minutes } = splitDuration(Number(scan?.totalDurationSeconds) || 0);
  return {
    rawDurationHours: hours,
    rawDurationMinutes: minutes,
    rawPhotoCount: Number(scan?.billablePhotos) || 0,
  };
}
