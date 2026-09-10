import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { buildDropboxDestination } from '../src/main/dropboxClient';
import { safeDownloadTarget } from '../src/main/driveDownloader';
import { TransferStore } from '../src/main/store';
import { b2ListingPrefix, b2ObjectName, b2RelativeName } from '../src/main/b2Paths';

describe('cloud filenames', () => {
  test('round-trips exact Backblaze raw-data names and nested folders', () => {
    const relative = 'DAY 01/CARD A/शादी \\ final [001].MOV';
    const objectName = b2ObjectName('raw/JOB-1', relative);
    assert.equal(objectName, `raw/JOB-1/${relative}`);
    assert.equal(b2RelativeName('raw/JOB-1', objectName), relative);
    assert.equal(b2ListingPrefix('raw/JOB-1'), 'raw/JOB-1/');
    assert.throws(() => b2RelativeName('raw/JOB-1', `raw/JOB-10/${relative}`), /outside this project/);
  });

  test('keeps spaces and Unicode in Dropbox deliverables', () => {
    assert.equal(
      buildDropboxDestination('/Volumes/Edit/शादी final V2.mov', 'A & B – Wedding'),
      '/Deliverables/A & B – Wedding/शादी final V2.mov'
    );
  });

  test('uses the native basename rather than a renderer supplied path', () => {
    assert.equal(
      buildDropboxDestination('/Volumes/Edit/Final Cut.mp4', 'A/B project'),
      '/Deliverables/A-B project/Final Cut.mp4'
    );
  });

  test('keeps nested download structure inside the selected folder', () => {
    const target = safeDownloadTarget('/Volumes/Edit/Project', 'DAY 01/CARD_A/क्लिप 001.MOV');
    assert.equal(target, path.resolve('/Volumes/Edit/Project/DAY 01/CARD_A/क्लिप 001.MOV'));
    assert.throws(() => safeDownloadTarget('/Volumes/Edit/Project', '../outside.mov'), /unsafe path/);
  });
});

test('downloaded folder locations persist per editor and project', () => {
  const store = new TransferStore(':memory:');
  try {
    store.rememberDownload('editor-a', 'job-1', '/Volumes/SSD/Job 1');
    store.rememberDownload('editor-b', 'job-1', '/Volumes/Other/Job 1');
    assert.equal(store.downloadPath('editor-a', 'job-1'), '/Volumes/SSD/Job 1');
    assert.equal(store.downloadPath('editor-b', 'job-1'), '/Volumes/Other/Job 1');
    store.forgetDownload('editor-a', 'job-1');
    assert.equal(store.downloadPath('editor-a', 'job-1'), undefined);
    assert.equal(store.downloadPath('editor-b', 'job-1'), '/Volumes/Other/Job 1');
  } finally {
    store.close();
  }
});
