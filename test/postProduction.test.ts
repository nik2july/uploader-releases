import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { POST_PRODUCTION_SERVICES, shouldFileIntoPostProduction } from '../src/renderer/src/utils/postProduction';

/**
 * Whether a deliverable opens a job on the freelance board by itself.
 *
 * BAAWARAY FILMS is a partner studio now, so its deliverables should arrive as
 * jobs rather than being typed in twice. The cost of this rule being wrong is
 * not a wrong pixel: a false positive puts a job in a live studio's board, and
 * a duplicate has two editors quietly cutting the same footage.
 */
const raw = (serviceType: string): { kind: string; purpose: string; serviceType: string } =>
  ({ kind: 'deliverable', purpose: 'raw', serviceType });

describe('filing a deliverable into post production', () => {
  test('raw footage for a service post production does opens a job', () => {
    for (const service of POST_PRODUCTION_SERVICES) {
      assert.equal(shouldFileIntoPostProduction(raw(service), {}), true, `${service} should file`);
    }
  });

  test('a service post production does not do is left alone', () => {
    assert.equal(shouldFileIntoPostProduction(raw('Storage'), {}), false);
    assert.equal(shouldFileIntoPostProduction(raw('Photo'), {}), false, 'an older category is not guessed at');
    assert.equal(shouldFileIntoPostProduction(raw('Video'), {}), false, 'Video could be either cut — it stays manual');
    assert.equal(shouldFileIntoPostProduction(raw(''), {}), false);
  });

  test('a deliverable already filed is never filed twice', () => {
    assert.equal(shouldFileIntoPostProduction(raw('Long Form'), { postProductionJobIds: ['job_1'] }), false);
    assert.equal(shouldFileIntoPostProduction(raw('Long Form'), { postProductionJobIds: [] }), true);
  });

  test('a final delivery going back out is not incoming work', () => {
    assert.equal(
      shouldFileIntoPostProduction({ kind: 'deliverable', purpose: 'delivery', serviceType: 'Long Form' }, {}),
      false
    );
  });

  test('a partner studio job is already on the board and is not re-filed', () => {
    assert.equal(
      shouldFileIntoPostProduction({ kind: 'freelance', purpose: 'raw', serviceType: 'Long Form' }, {}),
      false
    );
  });

  test('nothing to file when the deliverable or target is missing', () => {
    assert.equal(shouldFileIntoPostProduction(undefined, {}), false);
    assert.equal(shouldFileIntoPostProduction(raw('Album'), undefined), false);
  });
});
