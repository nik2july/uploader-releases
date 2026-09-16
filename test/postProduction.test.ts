import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  POST_PRODUCTION_SERVICES,
  shouldFileIntoPostProduction,
  getUniqueReusableDeliverables,
} from '../src/renderer/src/utils/postProduction';

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

  test('the service name is matched however it was typed into settings', () => {
    // These come from a category someone typed; an exact match would have the
    // feature look like it was never built.
    assert.equal(shouldFileIntoPostProduction(raw('short form'), {}), true);
    assert.equal(shouldFileIntoPostProduction(raw('SHORT FORM'), {}), true);
    assert.equal(shouldFileIntoPostProduction(raw('  Edited Photos  '), {}), true);
    assert.equal(shouldFileIntoPostProduction(raw('edited photos'), {}), true);
  });

  test('tolerance stops at spelling — a different service is still a different service', () => {
    assert.equal(shouldFileIntoPostProduction(raw('Short Films'), {}), false);
    assert.equal(shouldFileIntoPostProduction(raw('Photos'), {}), false);
    assert.equal(shouldFileIntoPostProduction(raw('Albums'), {}), false);
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

describe('deduplicating reusable raw data deliverables', () => {
  const filmDeliverable = {
    id: 'del_film_1',
    title: 'Edited Film for each event in 4k',
    rawDataLink: 'https://drive.google.com/drive/folders/shared-raw-footage-xyz',
    desktopTransfers: {
      tx_1: { id: 'tx_1', fileCount: 450, status: 'verified' },
    },
  };

  const reelsDeliverable = {
    id: 'del_reels_2',
    title: 'Reels',
    rawDataLink: 'https://drive.google.com/drive/folders/shared-raw-footage-xyz',
    reusedFromDeliverableId: 'del_film_1',
    reusedFromTitle: 'Edited Film for each event in 4k',
    desktopTransfers: {
      tx_1: { id: 'tx_1', fileCount: 450, status: 'verified' },
    },
  };

  const photoDeliverable = {
    id: 'del_photo_3',
    title: 'Edited Photos',
    rawDataLink: 'https://drive.google.com/drive/folders/photo-raws-123',
    desktopTransfers: {
      tx_photo: { id: 'tx_photo', fileCount: 2000, status: 'verified' },
    },
  };

  const trailerDeliverable = {
    id: 'del_trailer_4',
    title: 'Trailer',
  };

  test('when Reels reuses Film data, Trailer only sees Edited Film once', () => {
    const deliverables = [filmDeliverable, reelsDeliverable, photoDeliverable, trailerDeliverable];
    const reusable = getUniqueReusableDeliverables(deliverables, trailerDeliverable.id);

    // Should contain Edited Film (for video raw) and Edited Photos (for photo raw), but NOT Reels
    assert.equal(reusable.length, 2, 'Should have exactly 2 unique raw packages, not 3');
    const ids = reusable.map(d => d.id);
    assert.ok(ids.includes('del_film_1'), 'Must include original root film deliverable');
    assert.ok(ids.includes('del_photo_3'), 'Must include photo deliverable');
    assert.ok(!ids.includes('del_reels_2'), 'Must deduplicate and omit derivative Reels deliverable');
  });

  test('current deliverable itself is excluded', () => {
    const deliverables = [filmDeliverable, reelsDeliverable];
    const reusableForFilm = getUniqueReusableDeliverables(deliverables, filmDeliverable.id);
    assert.equal(reusableForFilm.length, 1);
    assert.equal(reusableForFilm[0].id, 'del_reels_2');
  });

  test('historical items sharing identical rawDataLink without reusedFromDeliverableId still deduplicate', () => {
    const legacyReels = {
      id: 'del_legacy_reels',
      title: 'Instagram Reels',
      rawDataLink: 'https://drive.google.com/drive/folders/shared-raw-footage-xyz',
    };
    const deliverables = [filmDeliverable, legacyReels, trailerDeliverable];
    const reusable = getUniqueReusableDeliverables(deliverables, trailerDeliverable.id);

    assert.equal(reusable.length, 1, 'Should deduplicate by identical rawDataLink');
    assert.equal(reusable[0].id, 'del_film_1', 'Should prioritize Edited Film over Instagram Reels');
  });

  test('hard drive deliveries with matching notes deduplicate', () => {
    const hd1 = {
      id: 'del_hd_1',
      title: 'Full Wedding Video',
      rawDataSource: 'hard_drive',
      hardDriveNotes: 'WD Red 4TB Drive #3',
    };
    const hd2 = {
      id: 'del_hd_2',
      title: 'Teaser Video',
      rawDataSource: 'hard_drive',
      hardDriveNotes: 'WD Red 4TB Drive #3',
    };
    const deliverables = [hd1, hd2, trailerDeliverable];
    const reusable = getUniqueReusableDeliverables(deliverables, trailerDeliverable.id);

    assert.equal(reusable.length, 1);
    assert.equal(reusable[0].id, 'del_hd_1');
  });
});

