import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BUSINESS_TYPES, PERMS, ROLES } from '../../../shared/types.ts';
import { PACKS } from '../../../shared/packs.ts';
import { STATES } from '../../../shared/states.ts';
import { HttpError, type Router } from '../http.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/** Public routes: a health check for hosting, and the lists the sign-up screen needs. */
export function registerMeta(r: Router) {
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
    const candidatePaths = [
      path.resolve(process.cwd(), 'release', 'A2Z Setup 0.1.0.exe'),
      path.resolve(__dirname, '../../../../release', 'A2Z Setup 0.1.0.exe'),
      path.resolve(__dirname, '../../../release', 'A2Z Setup 0.1.0.exe'),
    ];
    let filePath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    if (!filePath) {
      throw new HttpError(404, 'NOT_FOUND', 'A2Z Desktop Setup (.exe) is not available on this server.');
    }

    const stat = fs.statSync(filePath);
    ctx.res.writeHead(200, {
      'Content-Type': 'application/vnd.microsoft.portable-executable',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="A2Z Setup 0.1.0.exe"',
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    ctx.req.on('close', () => {
      stream.destroy();
    });
    stream.pipe(ctx.res);
    return;
  });

  // Desktop installer download (.zip with 1-click unblock script)
  r.get('/api/download/desktop-zip', async (ctx) => {
    const candidatePaths = [
      path.resolve(process.cwd(), 'release', 'A2Z-Billing-Windows-Setup.zip'),
      path.resolve(__dirname, '../../../../release', 'A2Z-Billing-Windows-Setup.zip'),
      path.resolve(__dirname, '../../../release', 'A2Z-Billing-Windows-Setup.zip'),
    ];
    let filePath: string | null = null;
    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        filePath = p;
        break;
      }
    }
    if (!filePath) {
      throw new HttpError(404, 'NOT_FOUND', 'A2Z Desktop Setup ZIP is not available on this server.');
    }

    const stat = fs.statSync(filePath);
    ctx.res.writeHead(200, {
      'Content-Type': 'application/zip',
      'Content-Length': stat.size,
      'Content-Disposition': 'attachment; filename="A2Z-Billing-Windows-Setup.zip"',
      'Cache-Control': 'no-cache',
    });

    const stream = fs.createReadStream(filePath);
    ctx.req.on('close', () => {
      stream.destroy();
    });
    stream.pipe(ctx.res);
    return;
  });

  // Download metadata
  r.get('/api/download/info', () => {
    const candidateExe = [
      path.resolve(process.cwd(), 'release', 'A2Z Setup 0.1.0.exe'),
      path.resolve(__dirname, '../../../../release', 'A2Z Setup 0.1.0.exe'),
    ];
    const candidateZip = [
      path.resolve(process.cwd(), 'release', 'A2Z-Billing-Windows-Setup.zip'),
      path.resolve(__dirname, '../../../../release', 'A2Z-Billing-Windows-Setup.zip'),
    ];
    const exePath = candidateExe.find((p) => fs.existsSync(p));
    const zipPath = candidateZip.find((p) => fs.existsSync(p));
    return {
      hasInstaller: Boolean(exePath),
      exeName: 'A2Z Setup 0.1.0.exe',
      exeSize: exePath ? fs.statSync(exePath).size : null,
      hasZip: Boolean(zipPath),
      zipName: 'A2Z-Billing-Windows-Setup.zip',
      zipSize: zipPath ? fs.statSync(zipPath).size : null,
      version: '0.1.0',
    };
  });
}
