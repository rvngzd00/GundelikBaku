import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { verifyPassword } from '../core/password.js';
import { privacyHash, randomToken, tokenDigest } from '../core/security.js';
import { pool, withTransaction } from '../db/pool.js';
import { clearAuthCookies, cookieNames, setAuthCookies } from './cookies.js';
import { loadActorContext } from './context.js';

const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: string;
  locked_until: Date | null;
}

async function createSession(
  app: FastifyInstance,
  reply: FastifyReply,
  request: FastifyRequest,
  userId: string,
  familyId: string = randomUUID()
): Promise<void> {
  const sessionId = randomUUID();
  const refreshToken = randomToken();
  const csrfToken = randomToken(24);
  const expiresAt = new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000);
  const accessToken = app.jwt.sign({ sub: userId, sessionId }, { expiresIn: env.ACCESS_TOKEN_TTL });

  await pool.query(`
    INSERT INTO refresh_sessions (
      id, user_id, token_hash, family_id, user_agent, ip_hash, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    sessionId,
    userId,
    tokenDigest(refreshToken),
    familyId,
    request.headers['user-agent']?.slice(0, 500) ?? null,
    privacyHash(request.ip, env.COOKIE_SECRET),
    expiresAt
  ]);

  setAuthCookies(reply, accessToken, refreshToken, csrfToken);
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = loginSchema.parse(request.body);
    const result = await pool.query<UserRow>(`
      SELECT id, email, password_hash, status, locked_until
      FROM users WHERE email = $1 AND deleted_at IS NULL
    `, [input.email]);
    const user = result.rows[0];

    if (!user || user.status !== 'active' || (user.locked_until && user.locked_until > new Date())) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email və ya şifrə yanlışdır');
    }

    const valid = await verifyPassword(input.password, user.password_hash);
    if (!valid) {
      await pool.query(`
        UPDATE users SET
          failed_login_count = failed_login_count + 1,
          locked_until = CASE WHEN failed_login_count + 1 >= 5 THEN now() + interval '15 minutes' ELSE locked_until END
        WHERE id = $1
      `, [user.id]);
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email və ya şifrə yanlışdır');
    }

    await pool.query(`
      UPDATE users SET failed_login_count = 0, locked_until = NULL, last_login_at = now()
      WHERE id = $1
    `, [user.id]);
    await createSession(app, reply, request, user.id);
    const actor = await loadActorContext(user.id);
    return reply.send({ data: actor && { ...actor, permissions: [...actor.permissions] } });
  });

  app.post('/refresh', async (request, reply) => {
    const rawToken = request.cookies[cookieNames.refresh];
    if (!rawToken) throw new AppError(401, 'SESSION_REQUIRED', 'Sessiya tapılmadı');

    const result = await pool.query<{
      id: string; user_id: string; family_id: string; expires_at: Date;
      rotated_at: Date | null; revoked_at: Date | null;
    }>(`
      SELECT id, user_id, family_id, expires_at, rotated_at, revoked_at
      FROM refresh_sessions WHERE token_hash = $1
    `, [tokenDigest(rawToken)]);
    const session = result.rows[0];
    if (!session) throw new AppError(401, 'SESSION_INVALID', 'Sessiya etibarsızdır');

    if (session.rotated_at || session.revoked_at || session.expires_at <= new Date()) {
      await pool.query('UPDATE refresh_sessions SET revoked_at = now() WHERE family_id = $1 AND revoked_at IS NULL', [session.family_id]);
      clearAuthCookies(reply);
      throw new AppError(401, 'SESSION_REUSE_DETECTED', 'Sessiya təhlükəsizlik səbəbi ilə dayandırıldı');
    }

    await withTransaction(async (client) => {
      await client.query('UPDATE refresh_sessions SET rotated_at = now() WHERE id = $1 AND rotated_at IS NULL', [session.id]);
    });
    await createSession(app, reply, request, session.user_id, session.family_id);
    return reply.send({ data: { refreshed: true } });
  });

  app.post('/logout', async (request, reply) => {
    const rawToken = request.cookies[cookieNames.refresh];
    if (rawToken) {
      await pool.query('UPDATE refresh_sessions SET revoked_at = now() WHERE token_hash = $1', [tokenDigest(rawToken)]);
    }
    clearAuthCookies(reply);
    return reply.code(204).send();
  });

  app.get('/me', { preHandler: app.authenticate }, async (request) => ({
    data: request.actor && { ...request.actor, permissions: [...request.actor.permissions] }
  }));
}
