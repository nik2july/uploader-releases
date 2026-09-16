import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { chargeForDeliverable, pricingForDeliverable } from '../src/renderer/src/utils/deliverablePricing';

/**
 * What Post Production charges BAAWARAY FILMS for one deliverable.
 *
 * This figure becomes the deliverable's costPrice, so the studio's margin on
 * what the couple paid is only as honest as this is. Two rules carry the weight:
 * a measurement of the footage actually handed over beats an expectation agreed
 * months earlier, and an absent figure means "not priced yet" rather than "free"
 * — a zero here would read as pure profit on the couple's side.
 */
describe('pricing a deliverable for post production', () => {
  test('a short form is priced on the cut agreed with the couple', () => {
    // Nothing measures a cut that has not been made.
    assert.equal(chargeForDeliverable('Short Form', 2000, { billableQuantity: 5 }), 10000);
  });

  test('an album is priced on the sheets agreed', () => {
    assert.equal(chargeForDeliverable('Album', 300, { billableQuantity: 30 }), 9000);
  });

  test('long form prefers the footage handed over to what was expected', () => {
    const charge = chargeForDeliverable('Long Form', 1000, { billableQuantity: 4, rawDurationHours: 7 });
    assert.equal(charge, 7000, 'seven hours arrived, so seven hours are billed');
  });

  test('long form falls back to the agreed hours when nothing was measured', () => {
    assert.equal(chargeForDeliverable('Long Form', 1000, { billableQuantity: 4 }), 4000);
  });

  test('edited photos prefer the counted photos to the quoted ones', () => {
    assert.equal(chargeForDeliverable('Edited Photos', 50, { billableQuantity: 300, rawPhotoCount: 412 }), 20600);
    assert.equal(chargeForDeliverable('Edited Photos', 50, { billableQuantity: 300 }), 15000);
  });

  test('the service minimums still apply', () => {
    // Under a minute of output bills as a minute; under an hour of raw as an hour.
    assert.equal(chargeForDeliverable('Short Form', 2000, { billableQuantity: 0.5 }), 2000);
    assert.equal(chargeForDeliverable('Long Form', 1000, { rawDurationMinutes: 20 }), 1000);
  });

  test('nothing to go on means not priced, which is not the same as free', () => {
    assert.equal(pricingForDeliverable('Short Form', 2000, {}), undefined, 'no quantity agreed');
    assert.equal(pricingForDeliverable('Album', 300, { rawPhotoCount: 500 }), undefined, 'photos say nothing about sheets');
    assert.equal(chargeForDeliverable('Short Form', 2000, {}), 0);
  });

  test('a studio with no rate for the service is not charged a guess', () => {
    assert.equal(pricingForDeliverable('Short Form', 0, { billableQuantity: 5 }), undefined);
    assert.equal(pricingForDeliverable('Short Form', undefined, { billableQuantity: 5 }), undefined);
  });

  test('a service post production does not sell is left alone', () => {
    assert.equal(pricingForDeliverable('Storage', 500, { billableQuantity: 10 }), undefined);
    assert.equal(pricingForDeliverable(undefined, 500, { billableQuantity: 10 }), undefined);
  });

  test('the rate and units are recorded, not just the total', () => {
    // A job stores what it was billed at, so changing the card never rewrites it.
    const pricing = pricingForDeliverable('Short Form', 2000, { billableQuantity: 5 });
    assert.equal(pricing?.rate, 2000);
    assert.equal(pricing?.basis, 'per_output_minute');
    assert.equal(pricing?.billableUnits, 5);
  });
});
