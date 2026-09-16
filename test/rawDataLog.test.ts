import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { measurementsFromScan, splitDuration } from '../src/renderer/src/utils/rawDataLog';
import type { ScanSummary } from '../src/shared/contracts';

/**
 * What a scanned drive records against the work.
 *
 * These figures set what Post Production charges — Long Form by the hour of raw
 * data, Edited Photos by the photo — so they were being typed in off the
 * Finder's info panel. Reading them off the scan removes the typo but only helps
 * if the arithmetic is right.
 */
const scan = (fields: Partial<ScanSummary>): ScanSummary => fields as ScanSummary;

describe('logging what a drive contained', () => {
  test('a duration splits into hours and whole minutes', () => {
    assert.deepEqual(splitDuration(3600), { hours: 1, minutes: 0 });
    assert.deepEqual(splitDuration(5430), { hours: 1, minutes: 31 });
    assert.deepEqual(splitDuration(45), { hours: 0, minutes: 1 });
  });

  test('just under an hour is an hour, never sixty minutes', () => {
    // Rounding the minutes alone gave "0h 60m" — not a figure anyone writes, and
    // one the manual entry form rejects outright.
    assert.deepEqual(splitDuration(3599), { hours: 1, minutes: 0 });
    assert.deepEqual(splitDuration(7199), { hours: 2, minutes: 0 });
    // 59.5 minutes is a genuine round up to the hour; 59.4 is not.
    assert.deepEqual(splitDuration(3570), { hours: 1, minutes: 0 });
    assert.deepEqual(splitDuration(3564), { hours: 0, minutes: 59 });
  });

  test('minutes never exceed what an hour holds', () => {
    for (let seconds = 0; seconds < 20000; seconds += 7) {
      const { minutes } = splitDuration(seconds);
      assert.ok(minutes >= 0 && minutes <= 59, `${seconds}s produced ${minutes} minutes`);
    }
  });

  test('nothing measured is zero, not a crash', () => {
    assert.deepEqual(splitDuration(0), { hours: 0, minutes: 0 });
    assert.deepEqual(splitDuration(NaN), { hours: 0, minutes: 0 });
    assert.deepEqual(splitDuration(-60), { hours: 0, minutes: 0 });
    assert.deepEqual(measurementsFromScan(undefined), { rawDurationHours: 0, rawDurationMinutes: 0, rawPhotoCount: 0 });
  });

  test('photos are the billable count, not every file on the card', () => {
    // A RAW and its JPEG are one photo to edit. Recording the file count would
    // bill some couples twice over.
    const measured = measurementsFromScan(scan({ totalPhotos: 800, billablePhotos: 400, totalDurationSeconds: 0 }));
    assert.equal(measured.rawPhotoCount, 400);
  });

  test('a real shoot reads the way it would be written down', () => {
    const measured = measurementsFromScan(scan({ totalDurationSeconds: 4 * 3600 + 37 * 60, billablePhotos: 1240 }));
    assert.deepEqual(measured, { rawDurationHours: 4, rawDurationMinutes: 37, rawPhotoCount: 1240 });
  });
});
