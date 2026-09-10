import assert from 'node:assert/strict';
import test from 'node:test';
import { cloudErrorMessage } from '../src/renderer/src/utils/cloudErrors';

test('turns Firestore daily quota failures into an actionable message', () => {
  const result = cloudErrorMessage(new Error("Quota exceeded for quota metric 'Free daily write units per project'"));
  assert.match(result, /daily free quota is exhausted/i);
  assert.match(result, /Blaze billing plan/i);
  assert.doesNotMatch(result, /project_number/i);
});

test('preserves useful non-quota errors and supplies a fallback', () => {
  assert.equal(cloudErrorMessage(new Error('Permission denied')), 'Permission denied');
  assert.equal(cloudErrorMessage(null, 'Could not save.'), 'Could not save.');
});
