// Generates solid-teal PNG icons with a white "waveform" mark. No dependencies.
// Run: node scripts/generate-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'icons');
mkdirSync(outDir, { recursive: true });

const TEAL = [0x0f, 0x76, 0x6e];
const WHITE = [255, 255, 255];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const t = Buffer.from(type);
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])));
  return Buffer.concat([len, t, data, crc]);
};

// scale: fraction of the canvas used by the mark (smaller for maskable safe zone).
function png(size, scale) {
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const bars = [0.3, 0.6, 1, 0.6, 0.3];
  const unit = (size * scale) / 9;
  const markH = unit * 7;
  const startX = (size - unit * 9) / 2;
  for (let y = 0; y < size; y++) {
    const row = y * (size * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      let color = TEAL;
      const i = Math.floor((x - startX) / unit);
      if (i >= 0 && i < 9 && i % 2 === 0) {
        const h = markH * bars[i / 2];
        if (Math.abs(y - size / 2) <= h / 2) color = WHITE;
      }
      raw.set(color, row + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

writeFileSync(join(outDir, 'icon-192.png'), png(192, 0.8));
writeFileSync(join(outDir, 'icon-512.png'), png(512, 0.8));
writeFileSync(join(outDir, 'icon-maskable-512.png'), png(512, 0.5));
console.log('Icons written to', outDir);
