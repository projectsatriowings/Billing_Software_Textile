import fs from 'node:fs';
import path from 'node:path';

const sourcePngPath = path.resolve('client/public/images/icon-logo.png');

if (!fs.existsSync(sourcePngPath)) {
  console.error(`Source icon does not exist: ${sourcePngPath}`);
  process.exit(1);
}

const pngBuffer = fs.readFileSync(sourcePngPath);
console.log(`Read source PNG: ${pngBuffer.length} bytes`);

// 1. Copy PNG to all target locations
const pngDestinations = [
  path.resolve('client/public/icon.png'),
  path.resolve('client/public/wholesale-billing-icon.png'),
  path.resolve('electron/assets/icon.png'),
];

for (const dest of pngDestinations) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, pngBuffer);
  console.log(`Updated PNG: ${dest}`);
}

// 2. Build Windows .ico container
// An ICO header consists of:
// - 6-byte header: reserved(0x0000), type(0x0001 for icon), count(0x0001 for 1 icon)
// - 16-byte directory entry:
//   width: 0 (represents 256), height: 0 (represents 256), colorCount: 0, reserved: 0,
//   planes: 1, bitCount: 32, bytesInRes: pngBuffer.length, imageOffset: 22
// - PNG raw payload starting at offset 22
const header = Buffer.alloc(22);
header.writeUInt16LE(0, 0); // Reserved
header.writeUInt16LE(1, 2); // Icon type = 1
header.writeUInt16LE(1, 4); // Number of images = 1

// Entry 1
header.writeUInt8(0, 6); // Width (0 => 256px)
header.writeUInt8(0, 7); // Height (0 => 256px)
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
];

for (const dest of icoDestinations) {
  const dir = path.dirname(dest);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(dest, icoBuffer);
  console.log(`Updated ICO: ${dest} (${icoBuffer.length} bytes)`);
}

// 3. Update favicon.svg with embedded base64 of the logo
const base64Png = pngBuffer.toString('base64');
const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="64" height="64" viewBox="0 0 64 64">
  <image width="64" height="64" preserveAspectRatio="xMidYMid meet" href="data:image/png;base64,${base64Png}" />
</svg>
`;

const svgPath = path.resolve('client/public/favicon.svg');
fs.writeFileSync(svgPath, svgContent);
console.log(`Updated SVG: ${svgPath}`);

console.log('✅ All icons successfully updated!');
