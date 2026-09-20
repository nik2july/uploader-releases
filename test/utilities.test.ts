import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import { analyzeSequences } from '../src/main/utilities/sequenceScan';
import type { FileRecord } from '../src/main/utilities/sequenceScan';
import { digitRuns, tokenize } from '../src/main/sequences';
import { bitrateFor, estimateBytes, ffmpegArgs, planForQuality, planForTargetSize } from '../src/main/utilities/clipDelivery';
import { convertPhoto } from '../src/main/utilities/photoDelivery';
import { scrubExif } from '../src/main/utilities/exifScrub';
import { PHOTO_PRESETS } from '../src/shared/utilities';
import type { Clip, SequenceScanOptions } from '../src/shared/utilities';
import {
  applyExclusions, buildTree, excludedFolders, includedFiles, summaryText, totalsFor,
} from '../src/renderer/src/utils/durationTree';
import {
  compactMessage, defaultReportOptions, missingNumbers, missingSummary, whatsAppMessage,
} from '../src/renderer/src/utils/sequenceReport';

const options: SequenceScanOptions = {
  mediaOnly: true, ignoreSidecars: true, combineAcrossSubfolders: false,
  includeVideo: true, includePhoto: true, includeAudio: true,
};

/** Builds the records the scanner's walk would have produced. */
function records(...paths: string[]): FileRecord[] {
  return paths.map(full => {
    const slash = full.lastIndexOf('/');
    const folder = slash < 0 ? '' : full.slice(0, slash);
    const name = slash < 0 ? full : full.slice(slash + 1);
    const dot = name.lastIndexOf('.');
    const displayExt = name.slice(dot + 1);
    const { tokens, seps } = tokenize(name.slice(0, dot));
    return { name, displayExt, lowerExt: displayExt.toLowerCase(), folder, tokens, seps, runs: tokens.map(digitRuns) };
  });
}

describe('missing clips', () => {
  test('keeps complete sequences and names the ends', () => {
    const { sequences } = analyzeSequences(records(
      'Cam A/C0001.MP4', 'Cam A/C0002.MP4', 'Cam A/C0003.MP4',
    ), options, 'Day 1');
    assert.equal(sequences.length, 1);
    assert.equal(sequences[0].firstName, 'C0001.MP4');
    assert.equal(sequences[0].lastName, 'C0003.MP4');
    assert.deepEqual(missingNumbers(sequences[0]), []);
  });

  test('finds a gap and collapses consecutive ones into a range', () => {
    const { sequences } = analyzeSequences(records(
      'Cam A/C0001.MP4', 'Cam A/C0002.MP4', 'Cam A/C0005.MP4', 'Cam A/C0006.MP4',
    ), options, 'Day 1');
    assert.deepEqual(missingNumbers(sequences[0]), [3, 4]);
    assert.equal(missingSummary(sequences[0], 40), 'C0003 to C0004');
  });

  test('ignores a per-clip id so one Canon roll is one sequence', () => {
    const { sequences } = analyzeSequences(records(
      'Cam B/A025C110_2607254Y_CANON.MXF',
      'Cam B/A025C111_2531447L_CANON.MXF',
      'Cam B/A025C113_2318876K_CANON.MXF',
      'Cam B/A025C114_2904112M_CANON.MXF',
    ), options, 'Day 2');
    assert.equal(sequences.length, 1, 'the random id must not split the roll');
    assert.deepEqual(missingNumbers(sequences[0]), [112]);
    assert.equal(missingSummary(sequences[0], 40), 'A025C112');
  });

  test('a card rollover can be merged into one run', () => {
    const merged = analyzeSequences(records(
      '100MEDIA/DJI_0001.MP4', '100MEDIA/DJI_0002.MP4', '101MEDIA/DJI_0004.MP4', '101MEDIA/DJI_0005.MP4',
    ), { ...options, combineAcrossSubfolders: true }, 'Drone');
    assert.equal(merged.sequences.length, 1);
    assert.deepEqual(missingNumbers(merged.sequences[0]), [3]);

    const split = analyzeSequences(records(
      '100MEDIA/DJI_0001.MP4', '100MEDIA/DJI_0002.MP4', '101MEDIA/DJI_0004.MP4', '101MEDIA/DJI_0005.MP4',
    ), options, 'Drone');
    assert.equal(split.sequences.length, 2, 'without merging, each card is its own run');
  });
});

describe('the message', () => {
  const scan = (): { rootPath: string; rootName: string; sequences: ReturnType<typeof analyzeSequences>['sequences']; unnumberedCount: number; skippedCount: number; totalFiles: number; scannedAt: string } => {
    const { sequences } = analyzeSequences(records(
      'Day 1 Haldi/Cam A/C0001.MP4', 'Day 1 Haldi/Cam A/C0002.MP4', 'Day 1 Haldi/Cam A/C0004.MP4',
    ), options, 'Haldi');
    return { rootPath: '/tmp/Haldi', rootName: 'Haldi', sequences, unnumberedCount: 0, skippedCount: 0, totalFiles: 3, scannedAt: '2026-01-01T10:00:00.000Z' };
  };

  test('the short one names the folder, the ends and the gap', () => {
    const message = compactMessage(scan(), { ...defaultReportOptions, projectName: 'Haldi' });
    assert.match(message, /\*Day 1 Haldi\/Cam A\*/);
    assert.match(message, /First: C0001\.MP4/);
    assert.match(message, /Last: C0004\.MP4/);
    assert.match(message, /Missing \(1\): C0003/);
  });

  test('the detailed one counts what arrived and asks for the rest', () => {
    const message = whatsAppMessage(scan(), { ...defaultReportOptions, detailed: true, useEmoji: false, showDate: false });
    assert.match(message, /Files received: \*3\*/);
    assert.match(message, /Missing: \*1\* clip/);
    assert.match(message, /Please share the missing clip at your earliest/);
  });
});

describe('duration totals', () => {
  const scan = {
    rootPath: '/tmp/Shoot', rootName: 'Shoot', scannedAt: '2026-01-01T00:00:00.000Z', cancelled: false,
    files: [
      { relativePath: '01 Cam/A.MP4', folderPath: '01 Cam', name: 'A.MP4', ext: 'mp4', kind: 'video' as const, duration: 600, bytes: 1_000_000 },
      { relativePath: '01 Cam/B.MP4', folderPath: '01 Cam', name: 'B.MP4', ext: 'mp4', kind: 'video' as const, duration: 300, bytes: 500_000 },
      { relativePath: 'Proxies/A.MP4', folderPath: 'Proxies', name: 'A.MP4', ext: 'mp4', kind: 'video' as const, duration: 600, bytes: 100_000 },
      { relativePath: 'C.MP4', folderPath: '', name: 'C.MP4', ext: 'mp4', kind: 'video' as const, duration: 0, bytes: 4_400_000_000 },
    ],
  };

  test('rolls every subfolder up into the root', () => {
    const root = buildTree(scan);
    const totals = totalsFor(root, includedFiles(root));
    assert.equal(totals.duration, 1500);
    assert.equal(totals.count, 4);
    assert.equal(totals.unreadable.length, 1, 'a file no reader can open counts as zero and is flagged');
  });

  test('an excluded folder drops out of the total but is still reported', () => {
    const root = buildTree(scan);
    applyExclusions(root, new Set(['Proxies']));
    const files = includedFiles(root);
    const totals = totalsFor(root, files);
    assert.equal(totals.duration, 900, 'the proxies are no longer double-counted');
    assert.equal(totals.excludedDuration, 600);
    assert.equal(totals.excludedCount, 1);
    assert.deepEqual(excludedFolders(root).map(node => node.path), ['Proxies']);
    assert.match(summaryText('Shoot', root, files), /Not counted: Proxies — 1 clips, 00:10:00/);
  });

  test('excluding a parent excludes everything beneath it', () => {
    const nested = buildTree({
      ...scan,
      files: [
        { relativePath: 'Day 2/Cam A/A.MP4', folderPath: 'Day 2/Cam A', name: 'A.MP4', ext: 'mp4', kind: 'video' as const, duration: 120, bytes: 10 },
        { relativePath: 'Day 1/A.MP4', folderPath: 'Day 1', name: 'A.MP4', ext: 'mp4', kind: 'video' as const, duration: 60, bytes: 10 },
      ],
    });
    applyExclusions(nested, new Set(['Day 2']));
    assert.equal(totalsFor(nested, includedFiles(nested)).duration, 60);
  });
});

describe('clip delivery planning', () => {
  const clip = (width: number, duration: number, bytes: number): Clip =>
    ({ path: '/x.mp4', relativePath: 'x.mp4', width, height: 1080, fps: 25, duration, bytes, transfer: '', primaries: '' });

  test('HD gets a fraction of the 4K bitrate', () => {
    const plan = planForQuality('balanced', [clip(3840, 60, 1e9)]);
    assert.equal(plan.uhdBitrate, 65_000_000);
    assert.equal(Math.round(plan.hdBitrate), 18_200_000);
  });

  test('never spends more than 90% of a light clip\'s own bitrate', () => {
    const light = clip(3840, 100, 10_000_000);        // 0.8 Mbps source
    assert.ok(bitrateFor(light, 65_000_000, 18_200_000) < 1_000_000);
  });

  test('a target size is solved for, not guessed', () => {
    const clips = [clip(3840, 3600, 100e9), clip(1920, 3600, 40e9)];
    const plan = planForTargetSize(50, clips);
    assert.ok(Math.abs(plan.estimatedBytes - 50e9) / 50e9 < 0.02);
    assert.equal(Math.round(estimateBytes(clips, plan.uhdBitrate, plan.hdBitrate)), Math.round(plan.estimatedBytes));
  });

  const filtersFor = (subject: Clip): string => {
    const args = ffmpegArgs(subject, '/out.mp4', 65_000_000);
    return args[args.indexOf('-vf') + 1];
  };

  test('high frame rates are halved and HLG is tonemapped', () => {
    const filters = filtersFor({ ...clip(3840, 10, 1e8), fps: 120, transfer: 'arib-std-b67', primaries: 'bt2020' });
    assert.match(filters, /fps=60\.000/);
    assert.match(filters, /tonemap=hable/);
    assert.match(filters, /format=yuv420p$/);
  });

  test('an HLG clip with no primaries written gets them stamped on first', () => {
    // Without this, zscale refuses the clip with "no path between colorspaces"
    // and the delivery quietly loses it.
    const untagged = filtersFor({ ...clip(3840, 10, 1e8), transfer: 'arib-std-b67', primaries: '' });
    assert.match(untagged, /^setparams=color_primaries=bt2020:color_trc=arib-std-b67:colorspace=bt2020nc,zscale/);

    const tagged = filtersFor({ ...clip(3840, 10, 1e8), transfer: 'arib-std-b67', primaries: 'bt2020' });
    assert.doesNotMatch(tagged, /setparams/, 'a properly tagged clip keeps the chain our deliveries used');

    const plain = filtersFor(clip(3840, 10, 1e8));
    assert.equal(plain, 'format=yuv420p', 'and Rec.709 material is not tonemapped at all');
  });
});

describe('photo delivery', () => {
  async function fixture(width: number, height: number): Promise<string> {
    const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'baawaray-photo-'));
    const file = path.join(folder, 'source.jpg');
    await sharp({ create: { width, height, channels: 3, background: { r: 180, g: 120, b: 90 } } })
      .withExif({ IFD0: { Make: 'Canon', Model: 'EOS R5', Copyright: 'Baawaray Films' } })
      .jpeg({ quality: 95 })
      .toFile(file);
    return file;
  }

  test('resizes down to the preset, never up, and forces the DPI', async () => {
    const source = await fixture(8000, 5000);
    const print = PHOTO_PRESETS.find(preset => preset.id === 'print')!;
    const destination = path.join(path.dirname(source), 'out.jpg');
    await convertPhoto(source, destination, print);
    const written = await sharp(destination).metadata();
    assert.equal(written.width, print.maxLongEdge);
    assert.equal(written.density, print.dpi);

    const small = await fixture(1000, 800);
    const smallOut = path.join(path.dirname(small), 'small.jpg');
    await convertPhoto(small, smallOut, print);
    assert.equal((await sharp(smallOut).metadata()).width, 1000, 'a smaller original is never upscaled');
  });

  test('flags a source that cannot make a full-quality 16×24', async () => {
    const source = await fixture(4000, 3000);
    const print = PHOTO_PRESETS.find(preset => preset.id === 'print')!;
    const outcome = await convertPhoto(source, path.join(path.dirname(source), 'warn.jpg'), print);
    assert.ok(outcome.warning, 'below 5760 px on the long edge is under the lab floor');
    assert.equal(outcome.warning?.dpiAt24in, Math.round(4000 / 24));
  });

  test('keeps the camera and the copyright line', async () => {
    const source = await fixture(4000, 3000);
    const viewing = PHOTO_PRESETS.find(preset => preset.id === '4k')!;
    const destination = path.join(path.dirname(source), 'clean.jpg');
    await convertPhoto(source, destination, viewing);
    const exif = (await sharp(destination).metadata()).exif;
    assert.ok(exif, 'capture metadata survives');
    const text = exif!.toString('latin1');
    assert.match(text, /Baawaray Films/);
    assert.match(text, /EOS R5/);
  });
});

/**
 * A JPEG whose EXIF holds everything Photo Delivery promises to drop: a GPS
 * IFD, a maker note, and a thumbnail directory. Written by hand, because the
 * point is to prove the scrubber removes them rather than that some encoder
 * never wrote them.
 */
function jpegWithEverything(): Buffer {
  const tiff = Buffer.alloc(130);
  const u16 = (at: number, value: number): void => { tiff.writeUInt16LE(value, at); };
  const u32 = (at: number, value: number): void => { tiff.writeUInt32LE(value, at); };
  tiff.write('II', 0, 'ascii'); u16(2, 42); u32(4, 8);

  u16(8, 3);                                             // IFD0: three entries
  u16(10, 0x010f); u16(12, 2); u32(14, 6); u32(18, 50);  // Make -> "Canon"
  u16(22, 0x8769); u16(24, 4); u32(26, 1); u32(30, 56);  // Exif IFD
  u16(34, 0x8825); u16(36, 4); u32(38, 1); u32(42, 94);  // GPS IFD
  u32(46, 112);                                          // IFD1: the thumbnail
  tiff.write('Canon\0', 50, 'ascii');

  u16(56, 2);                                            // Exif IFD
  u16(58, 0x927c); u16(60, 7); u32(62, 8); u32(66, 86);  // MakerNote
  u16(70, 0x9000); u16(72, 7); u32(74, 4); tiff.write('0230', 78, 'ascii');
  u32(82, 0);
  tiff.write('SECRET!!', 86, 'ascii');

  u16(94, 1);                                            // GPS IFD
  u16(96, 0x0001); u16(98, 2); u32(100, 2); tiff.write('N\0', 104, 'ascii');
  u32(106, 0);

  u16(112, 1);                                           // IFD1
  u16(114, 0x0103); u16(116, 3); u32(118, 1); u16(122, 6);
  u32(126, 0);

  const app1 = Buffer.alloc(4);
  app1[0] = 0xff; app1[1] = 0xe1; app1.writeUInt16BE(2 + 6 + tiff.length, 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]), app1, Buffer.from('Exif\0\0', 'ascii'), tiff, Buffer.from([0xff, 0xd9]),
  ]);
}

/** Every tag in the rewritten EXIF, sub-directories included. */
function exifTags(jpeg: Buffer): number[] {
  const start = jpeg.indexOf(Buffer.from('Exif\0\0', 'ascii'));
  if (start < 0) return [];
  const tiff = jpeg.subarray(start + 6);
  const little = tiff.toString('ascii', 0, 2) === 'II';
  const read16 = (at: number): number => (little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at));
  const read32 = (at: number): number => (little ? tiff.readUInt32LE(at) : tiff.readUInt32BE(at));
  const out: number[] = [];
  const walk = (offset: number, depth: number): void => {
    if (depth > 3 || offset < 8 || offset + 2 > tiff.length) return;
    const count = read16(offset);
    for (let i = 0; i < count; i++) {
      const at = offset + 2 + i * 12;
      const tag = read16(at);
      out.push(tag);
      if (tag === 0x8769 || tag === 0x8825 || tag === 0xa005) walk(read32(at + 8), depth + 1);
    }
    const next = read32(offset + 2 + count * 12);
    if (next) walk(next, depth + 1);
  };
  walk(read32(4), 0);
  return out;
}

describe('exif scrubbing', () => {
  test('drops GPS, the maker note and the thumbnail, and keeps the camera', () => {
    const before = exifTags(jpegWithEverything());
    assert.ok(before.includes(0x8825) && before.includes(0x927c) && before.includes(0x0103));

    const cleaned = scrubExif(jpegWithEverything(), 300);
    const after = exifTags(cleaned);
    assert.equal(after.includes(0x8825), false, 'no GPS directory');
    assert.equal(after.includes(0x927c), false, 'no maker note');
    assert.equal(after.includes(0x0103), false, 'no thumbnail directory');
    assert.equal(cleaned.includes(Buffer.from('SECRET!!', 'ascii')), false, 'and none of its bytes either');
    assert.ok(after.includes(0x010f), 'the camera make survives');
    assert.ok(after.includes(0x9000), 'so does the Exif sub-directory');
  });

  test('writes the preset\'s DPI and a normal orientation', () => {
    const after = exifTags(scrubExif(jpegWithEverything(), 300));
    assert.ok(after.includes(0x0112) && after.includes(0x011a) && after.includes(0x011b) && after.includes(0x0128));
  });

  test('leaves a file with no EXIF alone', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
    assert.deepEqual(scrubExif(jpeg, 300), jpeg);
  });

  test('removes the whole block rather than risk shipping coordinates', () => {
    const broken = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x0e]),
      Buffer.from('Exif\0\0', 'ascii'),
      Buffer.from([0x49, 0x49, 0x2a, 0x00, 0xff, 0xff, 0xff, 0xff]),  // nonsense IFD offset
      Buffer.from([0xff, 0xd9]),
    ]);
    const cleaned = scrubExif(broken, 300);
    assert.equal(cleaned.includes(Buffer.from('Exif\0\0', 'ascii')), false);
  });
});
