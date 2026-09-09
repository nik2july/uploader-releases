import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { collapseRanges, digitRuns, findSequences, tokenize } from '../src/main/sequences';

const MEDIA = new Set(['.mxf', '.mp4', '.mov', '.jpg', '.cr3', '.arw', '.insv']);
const files = (...names: string[]): { relativePath: string }[] => names.map(relativePath => ({ relativePath }));

describe('reading a filename', () => {
  test('finds digit runs and ignores checksum-length ones', () => {
    assert.deepEqual(digitRuns('A025C112').map(r => r.value), [25, 112]);
    assert.deepEqual(digitRuns('IMG_1234567890123').map(r => r.value), [], 'thirteen digits is not a clip counter');
  });

  test('splits on separators and can rebuild the name', () => {
    const { tokens, seps } = tokenize('A025C112_2607254Y_CANON');
    assert.deepEqual(tokens, ['A025C112', '2607254Y', 'CANON']);
    assert.deepEqual(seps, ['_', '_']);
  });

  test('collapses runs of numbers into ranges', () => {
    assert.deepEqual(collapseRanges([1, 2, 3, 7, 9, 10]), [[1, 3], [7, 7], [9, 10]]);
  });
});

describe('finding the gap', () => {
  test('a plain camera sequence with one clip missing', () => {
    const found = findSequences(files(
      'DAY01/C0001.MP4', 'DAY01/C0002.MP4', 'DAY01/C0004.MP4', 'DAY01/C0005.MP4',
    ), MEDIA);
    assert.equal(found.length, 1);
    assert.equal(found[0].missingCount, 1);
    assert.deepEqual(found[0].missing, ['C0003.MP4']);
    assert.equal(found[0].folder, 'DAY01');
  });

  test('a complete sequence reports nothing', () => {
    assert.deepEqual(findSequences(files('C0001.MP4', 'C0002.MP4', 'C0003.MP4'), MEDIA), []);
  });

  test('gaps are collapsed into ranges rather than listed one by one', () => {
    const found = findSequences(files(
      'IMG_0001.JPG', 'IMG_0002.JPG', 'IMG_0007.JPG', 'IMG_0008.JPG',
    ), MEDIA);
    assert.equal(found[0].missingCount, 4);
    assert.deepEqual(found[0].missing, ['IMG_0003 – IMG_0006.JPG']);
  });

  test('a per-clip camera id does not split one sequence into many', () => {
    // Canon C-series: reel, counter, then a hash unique to every clip. Treating
    // that hash as part of the identity would make each file its own sequence
    // and hide the gap completely.
    const found = findSequences(files(
      'A025C001_2607254Y_CANON.MXF', 'A025C002_2607261B_CANON.MXF',
      'A025C004_260726ZZ_CANON.MXF', 'A025C005_2607301K_CANON.MXF',
    ), MEDIA);
    assert.equal(found.length, 1, 'the per-clip hash must be masked, not treated as identity');
    assert.equal(found[0].missingCount, 1);
    assert.ok(found[0].missing[0].includes('003'), `expected the missing clip to be 003, got ${found[0].missing[0]}`);
  });

  test('two different cameras in one folder stay two sequences', () => {
    const found = findSequences(files(
      'C0001.MP4', 'C0002.MP4',
      'DSC01001.JPG', 'DSC01003.JPG',
    ), MEDIA);
    assert.equal(found.length, 1, 'only the photo run has a gap');
    assert.ok(found[0].missing[0].startsWith('DSC01002'));
  });

  test('the same numbers in different folders are different sequences', () => {
    // Two cards each numbered from 1. Combining them would invent gaps.
    const found = findSequences(files(
      'CARD_A/C0001.MP4', 'CARD_A/C0002.MP4',
      'CARD_B/C0001.MP4', 'CARD_B/C0002.MP4',
    ), MEDIA);
    assert.deepEqual(found, []);
  });

  test('sidecars and non-media are ignored', () => {
    // A missing .xmp means nothing; a missing clip means everything.
    const found = findSequences(files(
      'C0001.MP4', 'C0002.MP4', 'C0003.MP4',
      'C0001.XMP', 'C0003.XMP',
      'notes.txt',
    ), MEDIA);
    assert.deepEqual(found, []);
  });

  test('a single file is never a broken sequence', () => {
    assert.deepEqual(findSequences(files('C0007.MP4'), MEDIA), []);
  });

  test('numbering that simply starts high is not a gap', () => {
    // Cards often continue from where the last one stopped.
    assert.deepEqual(findSequences(files('C0850.MP4', 'C0851.MP4', 'C0852.MP4'), MEDIA), []);
  });

  test('reports how many arrived alongside what did not', () => {
    const found = findSequences(files('C0001.MP4', 'C0002.MP4', 'C0005.MP4'), MEDIA);
    assert.equal(found[0].received, 3);
    assert.equal(found[0].missingCount, 2);
  });
});
