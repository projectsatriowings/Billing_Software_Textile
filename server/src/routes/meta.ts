import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUSINESS_TYPES, PERMS, ROLES } from '../../../shared/types.ts';
import { PACKS } from '../../../shared/packs.ts';
import { STATES } from '../../../shared/states.ts';
import { HttpError, type Router } from '../http.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function ensureReleaseFile(type: 'exe' | 'zip'): { filePath: string; size: number } | null {
  const isExe = type === 'exe';
  const targetName = isExe ? 'A2Z Setup 0.1.0.exe' : 'A2Z-Billing-Windows-Setup.zip';

  // 1. Check if complete file already exists on disk
  const candidateFullPaths = [
    path.resolve(process.cwd(), 'release', targetName),
    path.resolve(__dirname, '../../../../release', targetName),
    path.resolve(__dirname, '../../../release', targetName),
  ];
  for (const p of candidateFullPaths) {
    if (fs.existsSync(p)) {
      const size = fs.statSync(p).size;
      if (size > 1000000) {
        return { filePath: p, size };
      }
    }
  }

  // 2. Check for parts in release/bin
  const candidateBinDirs = [
    path.resolve(process.cwd(), 'release', 'bin'),
    path.resolve(__dirname, '../../../../release', 'bin'),
    path.resolve(__dirname, '../../../release', 'bin'),
  ];
  let binDir: string | null = null;
  for (const b of candidateBinDirs) {
    if (fs.existsSync(b)) {
      binDir = b;
      break;
    }
  }
  if (!binDir) return null;

  const manifestPath = path.join(binDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) return null;

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const item = manifest[type];
    if (!item || !Array.isArray(item.parts)) return null;

    // Verify all parts exist
    for (const part of item.parts) {
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
    for (const part of item.parts) {
      const partBuf = fs.readFileSync(path.join(binDir, part.name));
      fs.writeSync(fdOut, partBuf);
    }
    fs.closeSync(fdOut);

    fs.renameSync(tmpPath, outPath);
    console.log(`[A2Z Meta] Successfully reassembled ${targetName} (${item.totalSize} bytes)`);
    return { filePath: outPath, size: item.totalSize };
  } catch (err) {
    console.error(`[A2Z Meta] Error assembling ${targetName}:`, err);
    return null;
  }
}

/** Public routes: a health check for hosting, and the lists the sign-up screen needs. */
export function registerMeta(r: Router) {
  // Pre-assemble release packages in background if needed
  setTimeout(() => {
    try {
      ensureReleaseFile('exe');
      ensureReleaseFile('zip');
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
  r.get('/api/download/desktop', async (ctx) => {
    const file = ensureReleaseFile('exe');
    if (!file) {
      throw new HttpError(404, 'NOT_FOUND', 'A2Z Desktop Setup (.exe) is not available on this server.');
    }

    ctx.res.writeHead(200, {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Length': file.size,
      'Content-Disposition': 'attachment; filename="A2Z Setup 0.1.0.exe"',
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(file.filePath);
    ctx.req.on('close', () => {
      stream.destroy();
    });
    stream.pipe(ctx.res);
    return;
  });

  // Desktop installer download (.zip with 1-click unblock script)
  r.get('/api/download/desktop-zip', async (ctx) => {
    const file = ensureReleaseFile('zip');
    if (!file) {
      throw new HttpError(404, 'NOT_FOUND', 'A2Z Desktop Setup ZIP is not available on this server.');
    }

    ctx.res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': file.size,
      'Content-Disposition': 'attachment; filename="A2Z-Billing-Windows-Setup.zip"',
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(file.filePath);
    ctx.req.on('close', () => {
      stream.destroy();
    });
    stream.pipe(ctx.res);
    return;
  });

  // Download metadata
  r.get('/api/download/info', () => {
    const exe = ensureReleaseFile('exe');
    const zip = ensureReleaseFile('zip');
    return {
      hasInstaller: Boolean(exe),
      exeName: 'A2Z Setup 0.1.0.exe',
      exeSize: exe ? exe.size : null,
      hasZip: Boolean(zip),
      zipName: 'A2Z-Billing-Windows-Setup.zip',
      zipSize: zip ? zip.size : null,
      version: '0.1.0',
    };
  });
}
