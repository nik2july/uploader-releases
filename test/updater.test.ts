import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { compareVersions } from '../src/main/updater';

/**
 * The comparison that decides whether anyone is told about a release. Getting
 * it wrong is silent in both directions: nobody updates, or everybody is
 * nagged forever.
 */
describe('compareVersions', () => {
  test('orders by number, not by string', () => {
    // The classic: "1.10.0" < "1.9.0" alphabetically, but it is newer.
    assert.ok(compareVersions('1.10.0', '1.9.0') > 0);
    assert.ok(compareVersions('1.2.0', '1.10.0') < 0);
  });

  test('equal versions are not an update', () => {
    assert.equal(compareVersions('1.0.0', '1.0.0'), 0);
    assert.equal(compareVersions('v1.0.0', '1.0.0'), 0, 'a leading v is a tag convention, not a version');
  });

  test('an older release never offers itself as an update', () => {
    assert.ok(compareVersions('1.0.0', '1.0.1') < 0);
    assert.ok(compareVersions('0.9.9', '1.0.0') < 0);
  });

  test('missing and malformed parts count as zero rather than throwing', () => {
    assert.ok(compareVersions('1.1', '1.0.9') > 0);
    assert.equal(compareVersions('1.0', '1.0.0'), 0);
    assert.equal(compareVersions('', ''), 0);
  });
});
