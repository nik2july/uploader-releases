import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Render the supplied short SVG unchanged. Only add the macOS icon tile/padding.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const mark = await sharp(path.join(root, 'resources/baawaray-mark.svg')).resize(880, 880).png().toBuffer();
const tile = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024"><rect x="48" y="48" width="928" height="928" rx="208" fill="#f9f8f6"/></svg>');
const master = await sharp(tile).composite([{ input: mark, left: 72, top: 72 }]).png().toBuffer();
await fs.writeFile(path.join(root, 'resources/icon.png'), master);
await fs.writeFile(path.join(root, 'build/icon.png'), master);

const chunks = [];
for (const [type, size] of [['icp4', 16], ['icp5', 32], ['icp6', 64], ['ic07', 128], ['ic08', 256], ['ic09', 512], ['ic10', 1024]]) {
  const png = await sharp(master).resize(size, size).png().toBuffer();
  const header = Buffer.alloc(8); header.write(type); header.writeUInt32BE(png.length + 8, 4);
  chunks.push(header, png);
}
const icnsHeader = Buffer.alloc(8); icnsHeader.write('icns');
icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, b) => sum + b.length, 0), 4);
await fs.writeFile(path.join(root, 'build/icon.icns'), Buffer.concat([icnsHeader, ...chunks]));

const sizes = [16, 32, 48, 64, 128, 256];
const icoHeader = Buffer.alloc(6 + sizes.length * 16); icoHeader.writeUInt16LE(1, 2); icoHeader.writeUInt16LE(sizes.length, 4);
const images = []; let offset = icoHeader.length;
for (const [index, size] of sizes.entries()) {
  const png = await sharp(master).resize(size, size).png().toBuffer(); const p = 6 + index * 16;
  icoHeader[p] = size === 256 ? 0 : size; icoHeader[p + 1] = size === 256 ? 0 : size;
  icoHeader.writeUInt16LE(1, p + 4); icoHeader.writeUInt16LE(32, p + 6); icoHeader.writeUInt32LE(png.length, p + 8); icoHeader.writeUInt32LE(offset, p + 12);
  offset += png.length; images.push(png);
}
await fs.writeFile(path.join(root, 'build/icon.ico'), Buffer.concat([icoHeader, ...images]));
console.log('Generated Baawaray app icons from the supplied short SVG.');
