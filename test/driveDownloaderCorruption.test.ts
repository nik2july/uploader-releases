import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DriveDownloader,
  GoogleDriveQuotaExceededError,
  isDriveQuotaExceeded
} from '../src/main/driveDownloader';

test('isDriveQuotaExceeded detects Google Drive quota exceeded HTML', () => {
  const quotaHtml = `<!DOCTYPE html><html><head><title>Google Drive - Quota exceeded</title></head><body>
    <div id="uc-text"><p class="uc-error-caption">Sorry, you can&#39;t view or download this file at this time.</p>
    <p class="uc-error-subcaption">Too many users have viewed or downloaded this file recently.</p></div></body></html>`;

  assert.equal(isDriveQuotaExceeded(quotaHtml), true);
  assert.equal(isDriveQuotaExceeded('<html><head><title>Normal Page</title></head></html>'), false);
  assert.equal(isDriveQuotaExceeded('Download quota exceeded for this file.'), true);
});

test('GoogleDriveQuotaExceededError carries metadata about completed progress', () => {
  const err = new GoogleDriveQuotaExceededError('Quota reached', 15728640000, 12);
  assert.equal(err.name, 'GoogleDriveQuotaExceededError');
  assert.equal(err.downloadedBytes, 15728640000);
  assert.equal(err.downloadedFiles, 12);
  assert.match(err.message, /Quota reached/);
});

test('localProgress automatically purges corrupt 2 KB HTML error files on disk', async () => {
  const downloader = new DriveDownloader();
  const testDir = join(tmpdir(), `test_drive_purge_${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  const corruptFilePath = join(testDir, 'C7206.MP4');
  const corruptHtml = `<!DOCTYPE html><html><head><title>Google Drive - Quota exceeded</title></head><body>Quota exceeded</body></html>`;
  await fs.writeFile(corruptFilePath, corruptHtml, 'utf8');

  // Verify file exists initially
  const initialStat = await fs.stat(corruptFilePath);
  assert.ok(initialStat.size < 5000);

  // When expected is a 1.2 GB video file (1200000000 bytes)
  const progress = await (downloader as any).localProgress(corruptFilePath, 1200000000);

  // Must report 0 downloaded bytes and file must have been unlinked!
  assert.equal(progress.done, false);
  assert.equal(progress.have, 0);

  let fileExists = true;
  try {
    await fs.stat(corruptFilePath);
  } catch {
    fileExists = false;
  }
  assert.equal(fileExists, false, 'Corrupt HTML file should be deleted from disk');

  await fs.rm(testDir, { recursive: true, force: true });
});

test('localProgress preserves valid completed files', async () => {
  const downloader = new DriveDownloader();
  const testDir = join(tmpdir(), `test_drive_valid_${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  const validFilePath = join(testDir, 'C7201.MP4');
  // 1 MB binary buffer
  const binaryData = Buffer.alloc(1024 * 1024, 0x55);
  await fs.writeFile(validFilePath, binaryData);

  const progress = await (downloader as any).localProgress(validFilePath, 1024 * 1024);
  assert.equal(progress.done, true);
  assert.equal(progress.have, 1024 * 1024);

  await fs.rm(testDir, { recursive: true, force: true });
});

test('scanLocalDirectory ignores corrupt HTML files and counts valid files', async () => {
  const downloader = new DriveDownloader();
  const testDir = join(tmpdir(), `test_drive_scan_${Date.now()}`);
  await fs.mkdir(testDir, { recursive: true });

  // 1 valid file of 2 MB
  const validPath = join(testDir, 'valid_clip.mp4');
  await fs.writeFile(validPath, Buffer.alloc(2 * 1024 * 1024, 0x11));

  // 1 corrupt HTML file of 2 KB
  const corruptPath = join(testDir, 'corrupt_clip.mp4');
  await fs.writeFile(corruptPath, '<!DOCTYPE html><html><head><title>Google Drive - Quota exceeded</title></head></html>');

  const result = await downloader.scanLocalDirectory(testDir);
  assert.equal(result.fileCount, 1, 'Should only count the 1 genuine media file');
  assert.equal(result.totalBytes, 2 * 1024 * 1024, 'Total bytes should only reflect genuine file');

  await fs.rm(testDir, { recursive: true, force: true });
});
