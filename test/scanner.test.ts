import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { TransferStore } from '../src/main/store';
import { scanDirectory, scanOfflineDirectory } from '../src/main/scanner';
import type { ScanOptions, ScanSummary, Transfer, WorkTarget } from '../src/shared/contracts';
import { tempDir } from './helpers';

/**
 * What the folder is measured to contain.
 *
 * The invoice is built from these numbers, so a miscount is a mischarge. The
 * cases below are the ones that cost money if they are wrong: a RAW and a JPEG
 * of the same frame counted as two photos, a proxies folder billed as if it
 * were footage, a file that could not be read counted as nothing at all.
 *
 * Video durations are measured with ffprobe against real media and are not
 * covered here; there are no clip fixtures in the repo.
 */
const cleanups: (() => void)[] = [];
afterEach(() => { for (const done of cleanups.splice(0)) done(); });

async function scan(files: Record<string, string>, options: Partial<ScanOptions> = {}, target?: WorkTarget): Promise<{
  summary: ScanSummary; job: Transfer; store: TransferStore; root: string;
}> {
  const root = await tempDir();
  for (const [relativePath, body] of Object.entries(files)) {
    const full = path.join(root, relativePath);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  const store = new TransferStore(':memory:');
  cleanups.push(() => store.close());
  const now = new Date().toISOString();
  store.save({
    id: 'scan-1', ownerUid: 'owner', rootPath: root, rootName: path.basename(root), status: 'scanning',
    options: { excludedBillingFolders: [], countPhotoPairsOnce: true, ...options },
    target,
    createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
  });

  await scanDirectory(store, 'scan-1', new AbortController().signal, () => {});
  const job = store.get('scan-1');
  return { summary: job.scan!, job, store, root };
}

describe('counting photos', () => {
  test('counts every photo format the cameras produce', async () => {
    const { summary } = await scan({
      'a.jpg': 'x', 'b.CR3': 'x', 'c.nef': 'x', 'd.HEIC': 'x', 'e.dng': 'x', 'f.tif': 'x',
    });
    assert.equal(summary.totalPhotos, 6);
    assert.equal(summary.billablePhotos, 6);
  });

  test('a RAW and a JPEG of the same frame is one photo, not two', async () => {
    const { summary } = await scan({ 'DSC001.CR3': 'x', 'DSC001.jpg': 'x', 'DSC002.jpg': 'x' });
    assert.equal(summary.totalPhotos, 3, 'all three files are still uploaded');
    assert.equal(summary.pairedPhotos, 1);
    assert.equal(summary.billablePhotos, 2, 'the pair bills once — it is one frame to edit');
  });

  test('pairing is off when the studio bills each file', async () => {
    const { summary } = await scan(
      { 'DSC001.CR3': 'x', 'DSC001.jpg': 'x' },
      { countPhotoPairsOnce: false },
    );
    assert.equal(summary.pairedPhotos, 1, 'the pair is still reported, so the choice is visible');
    assert.equal(summary.billablePhotos, 2);
  });

  test('same name in different folders is not a pair', async () => {
    const { summary } = await scan({ 'DAY01/DSC001.jpg': 'x', 'DAY02/DSC001.jpg': 'x' });
    assert.equal(summary.pairedPhotos, 0);
    assert.equal(summary.billablePhotos, 2);
  });
});

describe('what is excluded from billing', () => {
  test('a proxies folder uploads in full but does not bill', async () => {
    const { summary } = await scan(
      { 'DAY01/a.jpg': 'x', 'Proxies/a.jpg': 'x', 'Proxies/nested/b.jpg': 'x' },
      { excludedBillingFolders: ['Proxies'] },
    );
    assert.equal(summary.fileCount, 3, 'excluded files are still uploaded');
    assert.equal(summary.totalPhotos, 3);
    assert.equal(summary.billablePhotos, 1, 'exclusion runs all the way down the tree');
    assert.equal(summary.excludedBillingFiles, 2);
  });

  test('folder exclusion ignores case, the way people type it', async () => {
    const { summary } = await scan(
      { 'PROXIES/a.jpg': 'x', 'b.jpg': 'x' },
      { excludedBillingFolders: ['proxies'] },
    );
    assert.equal(summary.billablePhotos, 1);
  });
});

describe('what the folder holds', () => {
  test('an explicit file selection does not pull in neighbouring files', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'selected photo.jpg'), 'one');
    await fs.writeFile(path.join(root, 'private notes.txt'), 'two');
    const store = new TransferStore(':memory:');
    cleanups.push(() => store.close());
    const now = new Date().toISOString();
    store.save({
      id: 'selected-scan', ownerUid: 'owner', rootPath: root, rootName: 'selected photo.jpg',
      sourceFiles: ['selected photo.jpg'], status: 'scanning',
      options: { excludedBillingFolders: [], countPhotoPairsOnce: true },
      createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
    });
    await scanDirectory(store, 'selected-scan', new AbortController().signal, () => {});
    assert.equal(store.get('selected-scan').scan?.fileCount, 1);
    assert.equal(store.next('selected-scan')?.relativePath, 'selected photo.jpg');
  });

  test('records every folder so the structure can be recreated in Drive', async () => {
    const { store } = await scan({ 'DAY01/CARD_A/a.jpg': 'x', 'DAY02/b.jpg': 'x' });
    const folders = store.folders('scan-1').map(f => f.path).sort();
    assert.deepEqual(folders, ['', 'DAY01', 'DAY01/CARD_A', 'DAY02']);
  });

  test('totals bytes and files, and marks the scan ready', async () => {
    const { summary, job } = await scan({ 'a.jpg': 'abcde', 'DAY01/notes.txt': 'xy' });
    assert.equal(summary.fileCount, 2);
    assert.equal(summary.totalBytes, 7);
    assert.equal(summary.folderCount, 2);
    assert.equal(job.status, 'ready');
    assert.equal(job.error, undefined);
  });

  test('files that are neither photo nor video still upload, and do not bill as either', async () => {
    const { summary } = await scan({ 'notes.txt': 'x', 'a.jpg': 'x' });
    assert.equal(summary.fileCount, 2);
    assert.equal(summary.totalPhotos, 1);
    assert.equal(summary.totalVideos, 0);
  });

  test('Finder clutter is skipped rather than uploaded', async () => {
    const { summary } = await scan({ '.DS_Store': 'x', '._a.jpg': 'x', 'a.jpg': 'x' });
    assert.equal(summary.fileCount, 1);
  });
});

describe('measurements it refuses to guess at', () => {
  test('a symbolic link is excluded and said so, not followed', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'real.jpg'), 'x');
    await fs.symlink(path.join(root, 'real.jpg'), path.join(root, 'link.jpg'));

    const store = new TransferStore(':memory:');
    cleanups.push(() => store.close());
    const now = new Date().toISOString();
    store.save({
      id: 'scan-1', ownerUid: 'owner', rootPath: root, rootName: 'root', status: 'scanning',
      options: { excludedBillingFolders: [], countPhotoPairsOnce: true },
      createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
    });
    await scanDirectory(store, 'scan-1', new AbortController().signal, () => {});

    const summary = store.get('scan-1').scan!;
    assert.equal(summary.fileCount, 1, 'the link must not be counted or followed');
    assert.ok(summary.warnings.some(w => /Symbolic link excluded/.test(w)), 'and the studio must be told');
  });

  test('a folder it cannot read blocks the upload instead of undercounting', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'a.jpg'), 'x');
    const locked = path.join(root, 'locked');
    await fs.mkdir(locked);
    await fs.writeFile(path.join(locked, 'b.jpg'), 'x');
    await fs.chmod(locked, 0o000);
    cleanups.push(() => { void fs.chmod(locked, 0o755).catch(() => {}); });

    const store = new TransferStore(':memory:');
    cleanups.push(() => store.close());
    const now = new Date().toISOString();
    store.save({
      id: 'scan-1', ownerUid: 'owner', rootPath: root, rootName: 'root', status: 'scanning',
      options: { excludedBillingFolders: [], countPhotoPairsOnce: true },
      createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
    });
    await scanDirectory(store, 'scan-1', new AbortController().signal, () => {});

    const job = store.get('scan-1');
    // Silently counting an unreadable folder as empty is how a wedding is
    // "uploaded" without the second camera's card in it.
    assert.equal(job.status, 'needs_attention');
    assert.ok(job.scan!.readErrors > 0);
    assert.match(job.error!, /could not be inventoried/);
  });

  test('a clip whose duration cannot be read is flagged, not counted as zero', async () => {
    // A truncated or unsupported file carrying a video extension. Long-form
    // bills by raw hours, so treating this as "0 seconds" would undercharge
    // silently; calculateMediaBilling refuses to price it while it is unknown.
    const { summary } = await scan({ 'broken.mov': 'not really a video' });
    assert.equal(summary.totalVideos, 1);
    assert.equal(summary.unknownVideoCount, 1);
    assert.equal(summary.totalDurationSeconds, 0);
    assert.equal(summary.unreadableFiles.length, 1);
    assert.match(summary.unreadableFiles[0].reason, /truncated or corrupt/);
    assert.ok(summary.warnings.some(w => /could not be read/.test(w)));
  });

  test('an unreadable clip is reported even where it is not billed', async () => {
    // Readability is a question about the data; billing is a question about
    // money. Excluding a folder from billing must not stop the studio being
    // told that something in it is broken.
    const { summary } = await scan(
      { 'Proxies/broken.mov': 'not really a video' },
      { excludedBillingFolders: ['Proxies'] },
    );
    assert.equal(summary.unreadableFiles.length, 1, 'a corrupt proxy is still a corrupt file');
    assert.equal(summary.unknownVideoCount, 0, 'but it does not muddy the billing measurement');
  });

  test('an empty file is reported whatever its type', async () => {
    const { summary } = await scan({ 'DSC0001.jpg': '', 'DSC0002.jpg': 'x' });
    assert.equal(summary.unreadableFiles.length, 1);
    assert.equal(summary.unreadableFiles[0].path, 'DSC0001.jpg');
    assert.match(summary.unreadableFiles[0].reason, /empty/);
  });

  test('a cancelled scan stops and does not leave a usable manifest', async () => {
    const root = await tempDir();
    for (let i = 0; i < 40; i++) await fs.writeFile(path.join(root, `photo-${i}.jpg`), 'x');

    const store = new TransferStore(':memory:');
    cleanups.push(() => store.close());
    const now = new Date().toISOString();
    store.save({
      id: 'scan-1', ownerUid: 'owner', rootPath: root, rootName: 'root', status: 'scanning',
      options: { excludedBillingFolders: [], countPhotoPairsOnce: true },
      createdAt: now, updatedAt: now, completedFiles: 0, uploadedBytes: 0,
    });

    const controller = new AbortController();
    controller.abort();
    await assert.rejects(scanDirectory(store, 'scan-1', controller.signal, () => {}));
    assert.notEqual(store.get('scan-1').status, 'ready');
  });
});

describe('service-aware scanning', () => {
  const baseTarget: WorkTarget = {
    kind: 'freelance',
    id: 'fl-1',
    title: 'Test Job',
    clientName: 'Partner Studio',
    serviceType: 'Short Form',
    purpose: 'raw',
  };

  test('Short Form skips duration probing and scans missing files only', async () => {
    // Note: mock video file that would fail ffprobe if probed
    const { summary } = await scan(
      {
        'C0001.mp4': 'mock video bytes',
        'C0003.mp4': 'mock video bytes',
      },
      {},
      { ...baseTarget, serviceType: 'Short Form' }
    );
    assert.equal(summary.totalVideos, 2);
    // Because duration probe is skipped for Short Form, unknownVideoCount is 0 (ffprobe not run)
    assert.equal(summary.unknownVideoCount, 0);
    assert.equal(summary.totalDurationSeconds, 0);
    // But sequence check still finds missing clip C0002!
    assert.equal(summary.missingClipCount, 1);
    assert.equal(summary.billablePhotos, 0);
  });

  test('Long Form ignores photo count for billing and checks sequences', async () => {
    const { summary } = await scan(
      {
        'photo1.jpg': 'x',
        'photo2.jpg': 'x',
      },
      {},
      { ...baseTarget, serviceType: 'Long Form' }
    );
    assert.equal(summary.totalPhotos, 2);
    assert.equal(summary.billablePhotos, 0, 'photos are not billable for video edit (Long Form)');
  });

  test('Edited Photos and Album skip video duration probing and count photos', async () => {
    const { summary: photoSummary } = await scan(
      {
        'clip.mp4': 'mock video bytes',
        'DSC001.jpg': 'x',
        'DSC002.jpg': 'x',
      },
      {},
      { ...baseTarget, serviceType: 'Edited Photos' }
    );
    assert.equal(photoSummary.totalVideos, 1);
    assert.equal(photoSummary.unknownVideoCount, 0, 'video duration is not probed for photo service');
    assert.equal(photoSummary.billablePhotos, 2);

    const { summary: albumSummary } = await scan(
      {
        'clip.mp4': 'mock video bytes',
        'DSC001.jpg': 'x',
        'DSC002.jpg': 'x',
      },
      {},
      { ...baseTarget, serviceType: 'Album' }
    );
    assert.equal(albumSummary.totalVideos, 1);
    assert.equal(albumSummary.unknownVideoCount, 0, 'video duration is not probed for album service');
    assert.equal(albumSummary.billablePhotos, 2);
  });
});

describe('offline hard drive scanning', () => {
  test('scanOfflineDirectory counts photos with RAW+JPEG pair deduplication', async () => {
    const root = await tempDir();
    await fs.writeFile(path.join(root, 'DSC0001.ARW'), 'arw-content');
    await fs.writeFile(path.join(root, 'DSC0001.JPG'), 'jpg-content');
    await fs.writeFile(path.join(root, 'DSC0002.CR3'), 'cr3-content');
    await fs.writeFile(path.join(root, 'README.txt'), 'notes');

    const result = await scanOfflineDirectory(root, 'Edited Photos', true);
    assert.equal(result.totalPhotos, 3);
    assert.equal(result.photoCount, 2, 'DSC0001 pair is counted as 1 billable photo');
    assert.equal(result.fileCount, 4);
    assert.ok(result.driveLabel.includes(path.basename(root)));
  });

  test('scanOfflineDirectory ignores proxy folders', async () => {
    const root = await tempDir();
    const proxyDir = path.join(root, 'Proxies');
    await fs.mkdir(proxyDir, { recursive: true });
    await fs.writeFile(path.join(proxyDir, 'proxy1.mp4'), 'mock');
    await fs.writeFile(path.join(root, 'main.mp4'), 'mock video');

    const result = await scanOfflineDirectory(root, 'Short Form');
    assert.equal(result.videoCount, 1, 'Proxy folder video is excluded');
    assert.equal(result.fileCount, 1);
  });
});

