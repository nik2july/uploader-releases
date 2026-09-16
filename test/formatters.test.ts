import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { inrDigits } from '../src/renderer/src/utils/formatters';

/**
 * Money that is not there yet.
 *
 * A freelance job created before a price is agreed carries no clientCharge, and
 * the screens rendered `amount.toLocaleString()` straight onto it. That does not
 * degrade — it throws inside a render and takes the whole Freelance Department
 * down to an error card. So the only behaviour that matters here is that a
 * missing amount formats as nothing owed rather than raising.
 */
describe('formatting an amount that may not exist', () => {
  test('a real amount is grouped the Indian way', () => {
    assert.equal(inrDigits(1234567), '12,34,567');
    assert.equal(inrDigits(0), '0');
  });

  test('a missing amount is zero, not an exception', () => {
    assert.equal(inrDigits(undefined), '0');
    assert.equal(inrDigits(null), '0');
    assert.doesNotThrow(() => inrDigits(undefined));
  });

  test('junk that reached the record from somewhere is zero too', () => {
    assert.equal(inrDigits(NaN), '0');
    assert.equal(inrDigits(''), '0');
    assert.equal(inrDigits('not a number'), '0');
    assert.equal(inrDigits(Infinity), '0');
  });

  test('a numeric string still formats, since Firestore holds both', () => {
    assert.equal(inrDigits('45000'), '45,000');
    assert.equal(inrDigits('45000.4'), '45,000.4');
  });
});
