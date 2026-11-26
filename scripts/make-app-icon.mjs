// Builds the Windows app icon (electron/assets/icon.ico) and electron/assets/icon.png from the
// brand logo, so the installer, desktop shortcut, taskbar and window all use the current logo.
// The .ico holds every standard Windows size (16-256 px) so small icons stay sharp.
//
// Usage: node scripts/make-app-icon.mjs [source.png]   (default: client/public/images/icon-logo.png)
import fs from 'node:fs';
import path from 'node:path';
import { createCanvas, loadImage } from '@napi-rs/canvas';

const src = path.resolve(process.argv[2] || 'client/public/images/icon-logo.png');
const outIco = path.resolve('electron/assets/icon.ico');
const outPng = path.resolve('electron/assets/icon.png');
const SIZES = [16, 24, 32, 48, 64, 128, 256];

const img = await loadImage(fs.readFileSync(src));

async function pngAt(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, size, size);
  return canvas.encode('png');
}

const images = [];
for (const size of SIZES) images.push({ size, data: await pngAt(size) });

// ICO = 6-byte header + 16-byte directory entry per image + PNG payloads.
const header = Buffer.alloc(6);
header.writeUInt16LE(0, 0); // reserved
header.writeUInt16LE(1, 2); // type: icon
header.writeUInt16LE(images.length, 4);
const dir = Buffer.alloc(16 * images.length);
let offset = 6 + dir.length;
images.forEach(({ size, data }, i) => {
  const e = i * 16;
  dir.writeUInt8(size >= 256 ? 0 : size, e); // width (0 means 256)
  dir.writeUInt8(size >= 256 ? 0 : size, e + 1); // height
  dir.writeUInt8(0, e + 2); // palette colours
  dir.writeUInt8(0, e + 3); // reserved
  dir.writeUInt16LE(1, e + 4); // colour planes
  dir.writeUInt16LE(32, e + 6); // bits per pixel
  dir.writeUInt32LE(data.length, e + 8);
  dir.writeUInt32LE(offset, e + 12);
  offset += data.length;
});
fs.writeFileSync(outIco, Buffer.concat([header, dir, ...images.map((x) => x.data)]));
fs.writeFileSync(outPng, await pngAt(512));
console.log(`Wrote ${path.relative(process.cwd(), outIco)} (${SIZES.join(', ')} px) and ${path.relative(process.cwd(), outPng)} from ${path.relative(process.cwd(), src)}`);
