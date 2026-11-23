import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

// 1. Read smoothed PNG generated from source
const smoothedIconPath = path.resolve('C:/Users/MOHAMMED THALHA A/.gemini/antigravity/brain/70d64e97-0dbb-4c04-bd4a-9379cee038d4/smoothed_icon.png');

if (!fs.existsSync(smoothedIconPath)) {
  console.error(`Smoothed icon does not exist: ${smoothedIconPath}`);
  process.exit(1);
}

const pngBuffer = fs.readFileSync(smoothedIconPath);
console.log(`Read smoothed PNG: ${pngBuffer.length} bytes`);

// Also save back to client/public/images/icon-logo.png
const logoImagePath = path.resolve('client/public/images/icon-logo.png');
fs.writeFileSync(logoImagePath, pngBuffer);
console.log(`Updated source: ${logoImagePath}`);

// 2. Copy PNG to all target locations
const pngDestinations = [
  path.resolve('client/public/icon.png'),
  path.resolve('client/public/wholesale-billing-icon.png'),
  path.resolve('electron/assets/icon.png'),
  path.resolve('client/dist/icon.png'),
  path.resolve('client/dist/wholesale-billing-icon.png'),
];

for (const dest of pngDestinations) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, pngBuffer);
  console.log(`Updated PNG: ${dest}`);
}

// 3. Build Windows .ico container
// Header (6 bytes) + Directory Entry (16 bytes) + PNG raw data
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Icon type = 1
header.writeUInt16LE(1, 4); // Number of images = 1

// Entry 1 (256x256 / high-res)
header.writeUInt8(0, 6); // Width (0 => 256px+)
header.writeUInt8(0, 7); // Height (0 => 256px+)
header.writeUInt8(0, 8); // Color count
header.writeUInt8(0, 9); // Reserved
header.writeUInt16LE(1, 10); // Color planes = 1
header.writeUInt16LE(32, 12); // Bits per pixel = 32
header.writeUInt32LE(pngBuffer.length, 14); // Image size in bytes
header.writeUInt32LE(22, 18); // Image offset = 22

const icoBuffer = Buffer.concat([header, pngBuffer]);

const icoDestinations = [
  path.resolve('client/public/favicon.ico'),
  path.resolve('electron/assets/icon.ico'),
  path.resolve('client/dist/favicon.ico'),
];

for (const dest of icoDestinations) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, icoBuffer);
  console.log(`Updated ICO: ${dest} (${icoBuffer.length} bytes)`);
}

// 4. Update favicon.svg with embedded base64 of the smoothed logo
const base64Png = pngBuffer.toString('base64');
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">
  <image width="64" height="64" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${base64Png}" />
</svg>
`;

const svgDestinations = [
  path.resolve('client/public/favicon.svg'),
  path.resolve('client/dist/favicon.svg'),
];

for (const dest of svgDestinations) {
  fs.writeFileSync(dest, svgContent);
  console.log(`Updated SVG: ${dest}`);
}

console.log('✅ All icons successfully updated with smoothed transparent edges!');
