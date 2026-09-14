import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { batchFolder, cloudName, rawBatches } from '../src/renderer/src/utils/rawBatches';
import type { FreelanceJob } from '../src/renderer/src/types';

/**
 * What the editor is shown as downloadable for one job.
 *
 * A shoot is often sent in more than one go, and since the studio can point a
 * later batch at the other cloud, the job's own rawDataLink stopped being the
 * whole story. Getting this wrong is silent: the editor simply never learns
 * that a second batch of the wedding exists.
 */
const job = (fields: Record<string, unknown>): FreelanceJob => ({ id: 'j1', ...fields } as unknown as FreelanceJob);

describe('the raw batches offered to an editor', () => {
  test('a job with one link offers that single package', () => {
    const batches = rawBatches(job({ rawDataLink: 'b2://baawaray.raw/raw/SHARMA' }));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].label, 'Raw footage');
    assert.equal(batches[0].cloud, 'Backblaze B2');
  });

  test('two transfers in two clouds are both offered, oldest first', () => {
    const batches = rawBatches(job({
      rawDataLink: 'b2://baawaray.raw/raw/SHARMA',
      desktopTransfers: {
        t2: { id: 't2', link: 'https://drive.google.com/drive/folders/abc', purpose: 'raw', createdAt: '2026-09-14', bytes: 310, fileCount: 486 },
        t1: { id: 't1', link: 'b2://baawaray.raw/raw/SHARMA', purpose: 'raw', createdAt: '2026-09-12', bytes: 842, fileCount: 1204 },
      },
    }));
    assert.deepEqual(batches.map(b => [b.label, b.cloud]), [
      ['Batch 1', 'Backblaze B2'],
      ['Batch 2', 'Google Drive'],
    ]);
    assert.equal(batches[0].bytes, 842);
    assert.equal(batches[1].fileCount, 486);
  });

  test('the headline link is not offered twice when a transfer already covers it', () => {
    const batches = rawBatches(job({
      rawDataLink: 'b2://baawaray.raw/raw/SHARMA/',
      desktopTransfers: { t1: { id: 't1', link: 'b2://baawaray.raw/raw/SHARMA', purpose: 'raw', createdAt: '2026-09-12', bytes: 842, fileCount: 1204 } },
    }));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].bytes, 842, 'the recorded size should survive, not the bare link');
  });

  test('a link pasted in by hand is still offered alongside recorded transfers', () => {
    const batches = rawBatches(job({
      rawDataLink: 'https://www.dropbox.com/scl/fo/xyz',
      desktopTransfers: { t1: { id: 't1', link: 'b2://baawaray.raw/raw/SHARMA', purpose: 'raw', createdAt: '2026-09-12', bytes: 1, fileCount: 1 } },
    }));
    assert.deepEqual(batches.map(b => b.cloud), ['Backblaze B2', 'Dropbox']);
  });

  test('delivery transfers are not offered as raw footage', () => {
    const batches = rawBatches(job({
      rawDataLink: 'b2://baawaray.raw/raw/SHARMA',
      desktopTransfers: { d1: { id: 'd1', link: 'https://drive.google.com/drive/folders/final', purpose: 'delivery', createdAt: '2026-09-13' } },
    }));
    assert.equal(batches.length, 1);
    assert.equal(batches[0].cloud, 'Backblaze B2');
  });

  test('a job with nothing attached offers nothing', () => {
    assert.deepEqual(rawBatches(job({})), []);
  });

  test('batch folders are distinct and safe to create', () => {
    const batches = rawBatches(job({
      desktopTransfers: {
        t1: { id: 't1', link: 'b2://baawaray.raw/raw/SHARMA', purpose: 'raw', createdAt: '2026-09-12' },
        t2: { id: 't2', link: 'https://drive.google.com/drive/folders/abc', purpose: 'raw', createdAt: '2026-09-14' },
      },
    }));
    const names = batches.map(batchFolder);
    assert.deepEqual(names, ['Batch 1 - Backblaze B2', 'Batch 2 - Google Drive']);
    assert.equal(new Set(names).size, names.length);
    for (const name of names) assert.doesNotMatch(name, /[/\\:]/, 'a batch folder must not escape the chosen directory');
  });

  test('an unrecognised host is labelled rather than guessed at', () => {
    assert.equal(cloudName('https://wetransfer.com/downloads/xyz'), 'Shared link');
  });
});
