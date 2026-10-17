/**
 * What a client or a lab needs, and nothing else.
 *
 * Photo Delivery keeps the capture metadata — camera, lens, exposure,
 * copyright — and drops the maker notes, the embedded thumbnail and the GPS
 * coordinates. A wedding's location is the couple's business, and a JPEG sent
 * to a print lab travels further than anyone plans for.
 *
 * Rather than trust a metadata option to mean the same thing in every encoder,
 * the EXIF block of the written JPEG is parsed and rebuilt here: IFD0 without
 * the GPS pointer, the Exif sub-IFD without the maker note, no IFD1. Anything
 * that cannot be parsed confidently has its EXIF removed altogether — losing
 * the camera model is a small price for never shipping coordinates.
 */

const TYPE_SIZES = [0, 1, 1, 2, 4, 8, 1, 1, 2, 4, 8, 4, 8];

const TAG_ORIENTATION = 0x0112;
const TAG_X_RESOLUTION = 0x011a;
const TAG_Y_RESOLUTION = 0x011b;
const TAG_RESOLUTION_UNIT = 0x0128;
const TAG_EXIF_IFD = 0x8769;
const TAG_GPS_IFD = 0x8825;
const TAG_INTEROP_IFD = 0xa005;
const TAG_MAKER_NOTE = 0x927c;

interface Entry { tag: number; type: number; count: number; data: Buffer; sub?: Entry[] }

function readIfd(tiff: Buffer, offset: number, little: boolean, depth: number): { entries: Entry[]; next: number } | null {
  if (depth > 3 || offset < 8 || offset + 2 > tiff.length) return null;
  const count = little ? tiff.readUInt16LE(offset) : tiff.readUInt16BE(offset);
  if (count > 512 || offset + 2 + count * 12 + 4 > tiff.length) return null;

  const entries: Entry[] = [];
  for (let i = 0; i < count; i++) {
    const at = offset + 2 + i * 12;
    const tag = little ? tiff.readUInt16LE(at) : tiff.readUInt16BE(at);
    const type = little ? tiff.readUInt16LE(at + 2) : tiff.readUInt16BE(at + 2);
    const items = little ? tiff.readUInt32LE(at + 4) : tiff.readUInt32BE(at + 4);
    if (type < 1 || type >= TYPE_SIZES.length) return null;
    const size = TYPE_SIZES[type] * items;
    if (size > tiff.length) return null;

    let data: Buffer;
    if (size <= 4) {
      data = tiff.subarray(at + 8, at + 8 + size);
    } else {
      const valueAt = little ? tiff.readUInt32LE(at + 8) : tiff.readUInt32BE(at + 8);
      if (valueAt + size > tiff.length) return null;
      data = tiff.subarray(valueAt, valueAt + size);
    }

    if (tag === TAG_EXIF_IFD || tag === TAG_INTEROP_IFD) {
      const pointer = little ? tiff.readUInt32LE(at + 8) : tiff.readUInt32BE(at + 8);
      const child = readIfd(tiff, pointer, little, depth + 1);
      if (!child) return null;
      const kept = child.entries.filter(entry => entry.tag !== TAG_MAKER_NOTE);
      entries.push({ tag, type: 4, count: 1, data: Buffer.alloc(4), sub: kept });
      continue;
    }
    if (tag === TAG_GPS_IFD) continue;  // the whole point

    entries.push({ tag, type, count: items, data: Buffer.from(data) });
  }
  const nextAt = offset + 2 + count * 12;
  return { entries, next: little ? tiff.readUInt32LE(nextAt) : tiff.readUInt32BE(nextAt) };
}

function rational(numerator: number, denominator: number, little: boolean): Buffer {
  const buffer = Buffer.alloc(8);
  if (little) { buffer.writeUInt32LE(numerator, 0); buffer.writeUInt32LE(denominator, 4); }
  else { buffer.writeUInt32BE(numerator, 0); buffer.writeUInt32BE(denominator, 4); }
  return buffer;
}

function short(value: number, little: boolean): Buffer {
  const buffer = Buffer.alloc(4);
  if (little) buffer.writeUInt16LE(value, 0); else buffer.writeUInt16BE(value, 0);
  return buffer;
}

/** Sets a tag in place, or adds it, keeping IFD entries in tag order. */
function setEntry(entries: Entry[], tag: number, type: number, count: number, data: Buffer): void {
  const existing = entries.find(entry => entry.tag === tag);
  if (existing) { existing.type = type; existing.count = count; existing.data = data; return; }
  entries.push({ tag, type, count, data });
  entries.sort((a, b) => a.tag - b.tag);
}

function serialize(ifd0: Entry[], little: boolean): Buffer {
  const pieces: { offset: number; buffer: Buffer }[] = [];
  let cursor = 8;
  const place = (buffer: Buffer): number => {
    const offset = cursor;
    pieces.push({ offset, buffer });
    cursor += buffer.length + (buffer.length % 2);
    return offset;
  };
  const writeU32 = (buffer: Buffer, at: number, value: number): void => {
    if (little) buffer.writeUInt32LE(value, at); else buffer.writeUInt32BE(value, at);
  };
  const writeU16 = (buffer: Buffer, at: number, value: number): void => {
    if (little) buffer.writeUInt16LE(value, at); else buffer.writeUInt16BE(value, at);
  };

  function writeIfd(entries: Entry[]): number {
    const body = Buffer.alloc(2 + entries.length * 12 + 4);
    const offset = place(body);
    writeU16(body, 0, entries.length);
    entries.forEach((entry, index) => {
      const at = 2 + index * 12;
      writeU16(body, at, entry.tag);
      writeU16(body, at + 2, entry.type);
      writeU32(body, at + 4, entry.count);
      if (entry.sub) {
        writeU32(body, at + 8, writeIfd(entry.sub));
      } else if (entry.data.length <= 4) {
        entry.data.copy(body, at + 8);
      } else {
        writeU32(body, at + 8, place(Buffer.from(entry.data)));
      }
    });
    writeU32(body, 2 + entries.length * 12, 0);  // no IFD1: the thumbnail is dropped
    return offset;
  }

  const rootAt = writeIfd(ifd0);
  const tiff = Buffer.alloc(cursor);
  tiff.write(little ? 'II' : 'MM', 0, 'ascii');
  writeU16(tiff, 2, 42);
  writeU32(tiff, 4, rootAt);
  for (const piece of pieces) piece.buffer.copy(tiff, piece.offset);
  return tiff;
}

/**
 * Rewrites the EXIF of a JPEG: no GPS, no maker note, no thumbnail, with the
 * orientation flag reading "normal" and the resolution set to the preset's DPI
 * (the rotation is baked into the pixels by then, and the flag must agree).
 *
 * Returns a new buffer. If the EXIF cannot be parsed, it is removed.
 */
export function scrubExif(jpeg: Buffer, dpi: number): Buffer {
  if (jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8) return jpeg;

  let position = 2;
  while (position + 4 <= jpeg.length) {
    if (jpeg[position] !== 0xff) break;
    const marker = jpeg[position + 1];
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { position += 2; continue; }
    if (marker === 0xda || marker === 0xd9) break;  // image data starts here
    const length = jpeg.readUInt16BE(position + 2);
    const segmentEnd = position + 2 + length;
    if (segmentEnd > jpeg.length) break;

    if (marker === 0xe1 && jpeg.subarray(position + 4, position + 10).toString('ascii') === 'Exif\0\0') {
      const tiff = jpeg.subarray(position + 10, segmentEnd);
      const rebuilt = rebuild(tiff, dpi);
      const replacement = rebuilt
        ? Buffer.concat([Buffer.from([0xff, 0xe1, 0, 0]), Buffer.from('Exif\0\0', 'ascii'), rebuilt])
        : Buffer.alloc(0);
      if (replacement.length) {
        const size = replacement.length - 2;
        if (size > 0xffff) return Buffer.concat([jpeg.subarray(0, position), jpeg.subarray(segmentEnd)]);
        replacement.writeUInt16BE(size, 2);
      }
      return Buffer.concat([jpeg.subarray(0, position), replacement, jpeg.subarray(segmentEnd)]);
    }
    position = segmentEnd;
  }
  return jpeg;
}

function rebuild(tiff: Buffer, dpi: number): Buffer | null {
  if (tiff.length < 8) return null;
  const order = tiff.toString('ascii', 0, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const little = order === 'II';
  const magic = little ? tiff.readUInt16LE(2) : tiff.readUInt16BE(2);
  if (magic !== 42) return null;
  const firstIfd = little ? tiff.readUInt32LE(4) : tiff.readUInt32BE(4);

  let parsed: { entries: Entry[] } | null = null;
  try { parsed = readIfd(tiff, firstIfd, little, 0); } catch { return null; }
  if (!parsed || !parsed.entries.length) return null;

  const entries = parsed.entries;
  setEntry(entries, TAG_ORIENTATION, 3, 1, short(1, little));
  setEntry(entries, TAG_X_RESOLUTION, 5, 1, rational(Math.round(dpi), 1, little));
  setEntry(entries, TAG_Y_RESOLUTION, 5, 1, rational(Math.round(dpi), 1, little));
  setEntry(entries, TAG_RESOLUTION_UNIT, 3, 1, short(2, little));  // inches

  try { return serialize(entries, little); } catch { return null; }
}
