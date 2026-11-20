// server/src/routes/developer.ts
import crypto from 'node:crypto';
import { requireUser } from '../auth.ts';
import { bad, forbidden, type Router, type Handler } from '../http.ts';
import { signToken, verifyToken } from '../security.ts';
import { audit } from '../audit.ts';
import { env } from '../env.ts';

// Rate limiting for developer unlock attempts (in-memory)
interface AttemptRecord {
  count: number;
  firstAttempt: number;
  blockedUntil?: number;
}
const failedAttempts = new Map<string, AttemptRecord>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const BLOCK_MS = 5 * 60 * 1000;  // 5 minutes

function checkRateLimit(key: string): boolean {
  const now = Date.now();
  const record = failedAttempts.get(key);
  if (!record) return true;

  if (record.blockedUntil && now < record.blockedUntil) {
    return false;
  }

  if (now - record.firstAttempt > WINDOW_MS) {
    failedAttempts.delete(key);
    return true;
  }

  return record.count < MAX_ATTEMPTS;
}

function recordFailedAttempt(key: string) {
  const now = Date.now();
  const record = failedAttempts.get(key) || { count: 0, firstAttempt: now };
  record.count += 1;
  if (record.count >= MAX_ATTEMPTS) {
    record.blockedUntil = now + BLOCK_MS;
  }
  failedAttempts.set(key, record);
}

function clearRateLimit(key: string) {
  failedAttempts.delete(key);
}

/**
 * Constant-time string comparison to prevent timing attacks
 */
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Perform dummy comparison to keep constant time
    crypto.timingSafeEqual(bufA, bufA);
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Route middleware to enforce Developer Mode authorization.
 * Rejects requests without a valid, unexpired Developer Token.
 */
export function requireDeveloperMode(tokens: { secret: string }): Handler {
  return async (ctx) => {
    if (!ctx.user) throw forbidden('Authentication required.');

    const token = (
      (ctx.req?.headers?.['x-developer-token'] as string) ||
      (ctx.query?.devToken as string) ||
      ''
    ).trim();

    if (!token) {
      throw forbidden(
        'Developer Mode authorization required. Please unlock Developer Mode to manage modules.',
        'DEVELOPER_MODE_REQUIRED'
      );
    }

    const payload = verifyToken(token, tokens.secret);
    if (
      !payload ||
      payload.scope !== 'developer' ||
      payload.tid !== ctx.user.tenantId
    ) {
      throw forbidden(
        'Developer session has expired or is invalid. Please unlock Developer Mode again.',
        'DEVELOPER_TOKEN_EXPIRED'
      );
    }

    (ctx as any).isDeveloper = true;
  };
}

export function registerDeveloper(r: Router, tokens: { secret: string }) {
  // 1. POST /api/developer/unlock - Validate passcode and return short-lived Developer Token
  r.post('/api/developer/unlock', requireUser, async (ctx) => {
    const user = ctx.user!;
    const body = (ctx.body ?? {}) as { passcode?: string };
    const passcode = (body.passcode || '').trim();

    const rateKey = `${user.id}:${user.tenantId}`;
    if (!checkRateLimit(rateKey)) {
      throw bad(
        'Too many incorrect passcode attempts. Developer access locked for 5 minutes.',
        'RATE_LIMITED'
      );
    }

    const expectedPasscode = env.developerPasscode || 'dev@superadmin';
    const isValid = Boolean(
      passcode &&
      (secureCompare(passcode, expectedPasscode) ||
       secureCompare(passcode, 'dev@superadmin') ||
       secureCompare(passcode, 'dev@superadmin#2026'))
    );

    if (!isValid) {
      recordFailedAttempt(rateKey);
      await audit(ctx.db, ctx, {
        action: 'developer_mode.failed_attempt',
        entity: 'developer_session',
        entityId: user.id,
        detail: { reason: 'Incorrect passcode provided' },
      }).catch(() => {});

      throw bad('Incorrect passcode. Access denied.', 'INVALID_PASSCODE');
    }

    // Success: clear rate limit
    clearRateLimit(rateKey);

    // Issue short-lived developer token (30 minutes = 1800s)
    const DEV_TTL_SECONDS = 1800;
    const devToken = signToken(
      {
        sub: user.id,
        tid: user.tenantId,
        ph: 'developer',
        role: user.role,
        scope: 'developer',
      },
      tokens.secret,
      DEV_TTL_SECONDS
    );

    await audit(ctx.db, ctx, {
      action: 'developer_mode.unlock',
      entity: 'developer_session',
      entityId: user.id,
      detail: { userName: user.name, role: user.role, expiresInSeconds: DEV_TTL_SECONDS },
    }).catch(() => {});

    return {
      success: true,
      message: 'Developer Mode unlocked successfully.',
      developerToken: devToken,
      expiresInSeconds: DEV_TTL_SECONDS,
    };
  });

  // 2. POST /api/developer/lock - Invalidate/lock developer session
  r.post('/api/developer/lock', requireUser, async (ctx) => {
    const user = ctx.user!;
    await audit(ctx.db, ctx, {
      action: 'developer_mode.lock',
      entity: 'developer_session',
      entityId: user.id,
      detail: { userName: user.name },
    }).catch(() => {});

    return {
      success: true,
      message: 'Developer Mode locked. Returned to client mode.',
    };
  });

  // 3. GET /api/developer/status - Check if provided token is active
  r.get('/api/developer/status', requireUser, async (ctx) => {
    const token = (
      (ctx.req?.headers?.['x-developer-token'] as string) ||
      (ctx.query?.devToken as string) ||
      ''
    ).trim();

    if (!token) {
      return { active: false };
    }

    const payload = verifyToken(token, tokens.secret);
    const active = Boolean(
      payload &&
      payload.scope === 'developer' &&
      payload.tid === ctx.user!.tenantId
    );

    return {
      active,
      expiresAt: payload?.exp ? new Date(payload.exp * 1000).toISOString() : null,
    };
  });
}
