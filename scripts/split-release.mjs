import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

function splitFile(srcPath, outDir, baseName, chunkSize = 60 * 1024 * 1024) {
  if (!fs.existsSync(srcPath)) {
    console.error(`Source file not found: ${srcPath}`);
    return;
  }
  fs.mkdirSync(outDir, { recursive: true });
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(srcPath, 'r');
  const stat = fs.fstatSync(fd);
  const totalSize = stat.size;
  
  let offset = 0;
  let partIndex = 1;
  const parts = [];

  const buffer = Buffer.alloc(chunkSize);
  while (offset < totalSize) {
    const toRead = Math.min(chunkSize, totalSize - offset);
    const bytesRead = fs.readSync(fd, buffer, 0, toRead, offset);
    const chunk = buffer.subarray(0, bytesRead);
    hash.update(chunk);

    const partName = `${baseName}.part${partIndex}`;
    const partPath = path.join(outDir, partName);
    fs.writeFileSync(partPath, chunk);
    parts.push({ name: partName, size: bytesRead });
    offset += bytesRead;
    partIndex++;
  }
  fs.closeSync(fd);

  const finalHash = hash.digest('hex');
  console.log(`Split ${path.basename(srcPath)} (${totalSize} bytes) into ${parts.length} parts. SHA256: ${finalHash}`);
  return { totalSize, sha256: finalHash, parts };
}

const outDir = path.resolve('release', 'bin');
const exeSrc = path.resolve('release', 'A2Z Setup 0.1.0.exe');
const zipSrc = path.resolve('release', 'A2Z-Billing-Windows-Setup.zip');

console.log('Splitting files for Git distribution...');
const exeMeta = splitFile(exeSrc, outDir, 'a2z-setup');
const zipMeta = splitFile(zipSrc, outDir, 'a2z-zip');

const manifest = {
  version: '0.1.0',
  exe: {
    fileName: 'A2Z Setup 0.1.0.exe',
    ...exeMeta,
  },
  zip: {
    fileName: 'A2Z-Billing-Windows-Setup.zip',
    ...zipMeta,
  },
};

fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log('✅ Split complete. Manifest created at release/bin/manifest.json');
