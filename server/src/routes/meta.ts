import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { BUSINESS_TYPES, PERMS, ROLES } from '../../../shared/types.ts';
import { PACKS } from '../../../shared/packs.ts';
import { STATES } from '../../../shared/states.ts';
import { HttpError, type Ctx, type Router } from '../http.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface ReleaseManifestEntry {
  fileName: string;
  totalSize: number;
  sha256?: string;
  parts: Array<{ name: string; size: number }>;
}

const shaCache = new Map<string, { size: number; mtimeMs: number; sha256: string }>();

function getFileSha256(filePath: string, size: number, mtimeMs: number): string {
  const cached = shaCache.get(filePath);
  if (cached && cached.size === size && cached.mtimeMs === mtimeMs) {
    return cached.sha256;
  }
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(filePath, 'r');
  try {
    const buf = Buffer.allocUnsafe(1024 * 1024);
    let bytesRead = 0;
    while ((bytesRead = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      hash.update(bytesRead === buf.length ? buf : buf.subarray(0, bytesRead));
    }
  } finally {
    fs.closeSync(fd);
  }
  const sha256 = hash.digest('hex');
  shaCache.set(filePath, { size, mtimeMs, sha256 });
  return sha256;
}

function findBinDir(): string | null {
  const candidateBinDirs = [
    path.resolve(process.cwd(), 'release', 'bin'),
    path.resolve(__dirname, '../../../../release', 'bin'),
    path.resolve(__dirname, '../../../release', 'bin'),
  ];
  for (const b of candidateBinDirs) {
    if (fs.existsSync(b)) return b;
  }
  return null;
}

function readManifestEntry(binDir: string | null, type: 'exe' | 'zip' | 'apk'): ReleaseManifestEntry | null {
  if (!binDir) return null;
  const manifestPath = path.join(binDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const item = manifest?.[type];
    if (!item || !Array.isArray(item.parts) || typeof item.totalSize !== 'number') return null;
    return item as ReleaseManifestEntry;
  } catch {
    return null;
  }
}

function ensureReleaseFile(type: 'exe' | 'zip' | 'apk'): { filePath: string; size: number } | null {
  let targetName: string;
  if (type === 'exe') {
    targetName = 'A2Z Setup 0.1.0.exe';
  } else if (type === 'zip') {
    targetName = 'A2Z-Billing-Windows-Setup.zip';
  } else {
    targetName = 'A2Z-Billing.apk';
  }

  const binDir = findBinDir();
  const manifestItem = readManifestEntry(binDir, type);

  // 1. Check if complete, manifest-consistent file already exists on disk
  const candidateFullPaths = [
    path.resolve(process.cwd(), 'release', targetName),
    path.resolve(process.cwd(), 'client', 'public', 'downloads', targetName),
    path.resolve(process.cwd(), 'client', 'dist', 'downloads', targetName),
    ...(type === 'apk'
      ? [
          path.resolve(process.cwd(), 'android', 'app', 'build', 'outputs', 'apk', 'release', 'app-release.apk'),
        ]
      : []),
    path.resolve(__dirname, '../../../../release', targetName),
    path.resolve(__dirname, '../../../release', targetName),
    path.resolve(__dirname, '../../../../client/public/downloads', targetName),
    path.resolve(__dirname, '../../../client/public/downloads', targetName),
  ];

  for (const p of candidateFullPaths) {
    if (!fs.existsSync(p)) continue;
    const st = fs.statSync(p);
    if (st.size <= 1000000) continue;
    if (manifestItem) {
      if (st.size !== manifestItem.totalSize) continue;
      if (manifestItem.sha256 && getFileSha256(p, st.size, st.mtimeMs) !== manifestItem.sha256) continue;
    }
    return { filePath: p, size: st.size };
  }

  // 2. Reassemble from parts in release/bin (also overwrites any stale cached file)
  if (!binDir || !manifestItem) return null;

  try {
    for (const part of manifestItem.parts) {
      const partPath = path.join(binDir, part.name);
      if (!fs.existsSync(partPath)) {
        console.warn(`[A2Z Meta] Missing part file: ${partPath}`);
        return null;
      }
    }

    const targetDir = path.dirname(binDir);
    const outPath = path.join(targetDir, targetName);
    const tmpPath = path.join(targetDir, `${targetName}.tmp-${Date.now()}`);

    const fdOut = fs.openSync(tmpPath, 'w');
    for (const part of manifestItem.parts) {
      const partBuf = fs.readFileSync(path.join(binDir, part.name));
      fs.writeSync(fdOut, partBuf);
    }
    fs.closeSync(fdOut);

    fs.renameSync(tmpPath, outPath);
    console.log(`[A2Z Meta] Successfully reassembled ${targetName} (${manifestItem.totalSize} bytes)`);
    return { filePath: outPath, size: manifestItem.totalSize };
  } catch (err) {
    console.error(`[A2Z Meta] Error assembling ${targetName}:`, err);
    return null;
  }
}

function sendReleaseDownload(
  ctx: Ctx,
  type: 'exe' | 'zip' | 'apk',
  contentType: string,
  filename: string,
  missingMessage: string,
) {
  const file = ensureReleaseFile(type);
  if (!file) {
    throw new HttpError(404, 'NOT_FOUND', missingMessage);
  }

  ctx.res.writeHead(200, {
    'Content-Type': contentType,
    'Content-Length': file.size,
    'Content-Disposition': `attachment; filename="${filename}"`,
    'Cache-Control': 'no-cache',
  });

  if (ctx.req.method === 'HEAD') {
    ctx.res.end();
    return;
  }

  const stream = fs.createReadStream(file.filePath);
  ctx.req.on('close', () => {
    stream.destroy();
  });
  stream.pipe(ctx.res);
}

/** Public routes: a health check for hosting, and the lists the sign-up screen needs. */
export function registerMeta(r: Router) {
  // Pre-assemble release packages in background if needed
  setTimeout(() => {
    try {
      ensureReleaseFile('exe');
      ensureReleaseFile('zip');
      ensureReleaseFile('apk');
    } catch {}
  }, 500);

  r.get('/api/health', async (ctx) => {
    try {
      await ctx.db.one('SELECT 1 AS ok');
    } catch {
      throw new HttpError(503, 'DB_DOWN', 'The database is not reachable right now');
    }
    return { ok: true, db: 'up', driver: ctx.db.driver, time: new Date().toISOString() };
  });

  r.get('/api/meta', () => ({
    roles: ROLES,
    perms: PERMS,
    businessTypes: BUSINESS_TYPES,
    states: STATES,
    languages: [{ id: 'en', name: 'English' }, { id: 'ta', name: 'தமிழ்' }, { id: 'hi', name: 'हिन्दी' }],
    packs: PACKS.map((p) => ({ id: p.id, name: p.name, blurb: p.blurb })),
  }));

  // Desktop installer download (.exe)
  const serveDesktopExe = (ctx: Ctx) =>
    sendReleaseDownload(
      ctx,
      'exe',
      'application/vnd.microsoft.portable-executable',
      'A2Z Setup 0.1.0.exe',
      'A2Z Desktop Setup (.exe) is not available on this server.',
    );
  r.get('/api/download/desktop', serveDesktopExe);
  r.add('HEAD', '/api/download/desktop', serveDesktopExe);

  // Desktop installer download (.zip with 1-click unblock script)
  const serveDesktopZip = (ctx: Ctx) =>
    sendReleaseDownload(
      ctx,
      'zip',
      'application/zip',
      'A2Z-Billing-Windows-Setup.zip',
      'A2Z Desktop Setup ZIP is not available on this server.',
    );
  r.get('/api/download/desktop-zip', serveDesktopZip);
  r.add('HEAD', '/api/download/desktop-zip', serveDesktopZip);

  // Android APK download (.apk)
  const serveAndroidApk = (ctx: Ctx) =>
    sendReleaseDownload(
      ctx,
      'apk',
      'application/vnd.android.package-archive',
      'A2Z-Billing.apk',
      'A2Z Android App (.apk) is not available on this server.',
    );
  r.get('/api/download/android', serveAndroidApk);
  r.add('HEAD', '/api/download/android', serveAndroidApk);
  r.get('/api/download/apk', serveAndroidApk);
  r.add('HEAD', '/api/download/apk', serveAndroidApk);

  // Download metadata
  r.get('/api/download/info', () => {
    const exe = ensureReleaseFile('exe');
    const zip = ensureReleaseFile('zip');
    const apk = ensureReleaseFile('apk');
    return {
      hasInstaller: Boolean(exe),
      exeName: 'A2Z Setup 0.1.0.exe',
      exeSize: exe ? exe.size : null,
      hasZip: Boolean(zip),
      zipName: 'A2Z-Billing-Windows-Setup.zip',
      zipSize: zip ? zip.size : null,
      hasApk: Boolean(apk),
      apkName: 'A2Z-Billing.apk',
      apkSize: apk ? apk.size : null,
      version: '0.1.0',
    };
  });
}
