import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { AppError } from '../core/errors.js';
import { hashPassword, verifyPassword } from '../core/password.js';
import { privacyHash, randomToken, tokenDigest } from '../core/security.js';
import { authEmailTemplate, sendEmail } from '../core/email.js';
import { azerbaijanPhoneSchema } from '../core/phone.js';
import { pool, withTransaction } from '../db/pool.js';
import { clearAuthCookies, cookieNames, setAuthCookies } from './cookies.js';
import { loadActorContext } from './context.js';

const loginSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(200)
});

const registerSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: azerbaijanPhoneSchema.optional(),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  password: z.string().min(12).max(200)
});

const forgotPasswordSchema = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase())
});

const resetPasswordSchema = z.object({
  token: z.string().min(32).max(300),
  password: z.string().min(12).max(200)
});

const acceptInviteSchema = resetPasswordSchema;

interface UserRow {
  id: string;
  email: string;
  password_hash: string;
  status: string;
  locked_until: Date | null;
}

type PendingSession = {
  id: string;
  userId: string;
  familyId: string;
  accessToken: string;
  refreshToken: string;
  csrfToken: string;
  expiresAt: Date;
};

function prepareSession(app: FastifyInstance, userId: string, familyId: string = randomUUID()): PendingSession {
  const id = randomUUID();
  return {
    id,
    userId,
    familyId,
    accessToken: app.jwt.sign({ sub: userId, sessionId: id }, { expiresIn: env.ACCESS_TOKEN_TTL }),
    refreshToken: randomToken(),
    csrfToken: randomToken(24),
    expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000)
  };
}

async function persistSession(
  queryable: Pick<PoolClient, 'query'>,
  session: PendingSession,
  request: FastifyRequest
): Promise<void> {
  await queryable.query(`
    INSERT INTO refresh_sessions (
      id, user_id, token_hash, family_id, user_agent, ip_hash, expires_at
    ) VALUES ($1,$2,$3,$4,$5,$6,$7)
  `, [
    session.id,
    session.userId,
    tokenDigest(session.refreshToken),
    session.familyId,
    request.headers['user-agent']?.slice(0, 500) ?? null,
    privacyHash(request.ip, env.COOKIE_SECRET),
    session.expiresAt
  ]);
}

function applySessionCookies(reply: FastifyReply, session: PendingSession): void {
  setAuthCookies(reply, session.accessToken, session.refreshToken, session.csrfToken);
}

async function createSession(
  app: FastifyInstance,
  reply: FastifyReply,
  request: FastifyRequest,
  userId: string,
  familyId: string = randomUUID()
): Promise<void> {
  const session = prepareSession(app, userId, familyId);
  await persistSession(pool, session, request);
  applySessionCookies(reply, session);
}

async function issueActionToken(
  userId: string,
  type: 'password_reset' | 'invite',
  createdBy: string | null = null
): Promise<{ raw: string; expiresAt: Date }> {
  const raw = randomToken(36);
  const expiresAt = new Date(Date.now() + (type === 'invite' ? 72 : 1) * 3_600_000);
  await withTransaction(async (client) => {
    await client.query(
      'UPDATE user_action_tokens SET used_at=now() WHERE user_id=$1 AND token_type=$2 AND used_at IS NULL',
      [userId, type]
    );
    await client.query(`
      INSERT INTO user_action_tokens(user_id,token_hash,token_type,created_by,expires_at)
      VALUES($1,$2,$3,$4,$5)
    `, [userId, tokenDigest(raw), type, createdBy, expiresAt]);
  });
  return { raw, expiresAt };
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/action-token/:token', async (request) => {
    const token = z.string().min(32).max(300).parse((request.params as { token: string }).token);
    const result = await pool.query(`
      SELECT t.token_type,u.email::text,u.first_name,u.last_name,t.expires_at
      FROM user_action_tokens t JOIN users u ON u.id=t.user_id
      WHERE t.token_hash=$1 AND t.used_at IS NULL AND t.expires_at>now() AND u.deleted_at IS NULL
    `, [tokenDigest(token)]);
    if (!result.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Keçid etibarsızdır və ya vaxtı bitib');
    return { data: { type: result.rows[0].token_type, email: result.rows[0].email, firstName: result.rows[0].first_name, lastName: result.rows[0].last_name, expiresAt: result.rows[0].expires_at } };
  });

  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (request) => {
    const input = forgotPasswordSchema.parse(request.body);
    const result = await pool.query<{ id: string; first_name: string }>(
      "SELECT id,first_name FROM users WHERE email=$1 AND status='active' AND deleted_at IS NULL",
      [input.email]
    );
    let previewUrl: string | undefined;
    if (result.rows[0]) {
      const token = await issueActionToken(result.rows[0].id, 'password_reset');
      const resetUrl = `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}/sifre-yenile/?token=${encodeURIComponent(token.raw)}`;
      if (env.NODE_ENV !== 'production') previewUrl = resetUrl;
      await sendEmail({
        to: input.email,
        subject: 'Gündəlik Bakı — şifrənizi yeniləyin',
        html: authEmailTemplate('Şifrənizi yeniləyin', `Salam ${result.rows[0].first_name}, aşağıdakı təhlükəsiz keçid 1 saat ərzində etibarlıdır.`, 'Şifrəni yenilə', resetUrl)
      });
    }
    return { data: { accepted: true, ...(previewUrl ? { previewUrl } : {}) } };
  });

  app.post('/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = resetPasswordSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const userId = await withTransaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(`
        SELECT id,user_id FROM user_action_tokens
        WHERE token_hash=$1 AND token_type='password_reset' AND used_at IS NULL AND expires_at>now()
        FOR UPDATE
      `, [tokenDigest(input.token)]);
      if (!token.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Şifrə yeniləmə keçidi etibarsızdır və ya vaxtı bitib');
      await client.query("UPDATE users SET password_hash=$2,failed_login_count=0,locked_until=NULL WHERE id=$1 AND status='active'", [token.rows[0].user_id, passwordHash]);
      await client.query('UPDATE user_action_tokens SET used_at=now() WHERE id=$1', [token.rows[0].id]);
      await client.query('UPDATE refresh_sessions SET revoked_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [token.rows[0].user_id]);
      return token.rows[0].user_id;
    });
    await createSession(app, reply, request, userId);
    return { data: { reset: true } };
  });

  app.post('/accept-invite', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = acceptInviteSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const userId = await withTransaction(async (client) => {
      const token = await client.query<{ id: string; user_id: string }>(`
        SELECT t.id,t.user_id FROM user_action_tokens t JOIN users u ON u.id=t.user_id
        WHERE t.token_hash=$1 AND t.token_type='invite' AND t.used_at IS NULL AND t.expires_at>now()
          AND u.status='invited' AND u.deleted_at IS NULL FOR UPDATE OF t,u
      `, [tokenDigest(input.token)]);
      if (!token.rows[0]) throw new AppError(404, 'TOKEN_INVALID', 'Dəvət keçidi etibarsızdır və ya vaxtı bitib');
      await client.query("UPDATE users SET password_hash=$2,status='active',email_verified_at=coalesce(email_verified_at,now()) WHERE id=$1", [token.rows[0].user_id, passwordHash]);
      await client.query('UPDATE user_action_tokens SET used_at=now() WHERE id=$1', [token.rows[0].id]);
      return token.rows[0].user_id;
    });
    await createSession(app, reply, request, userId);
    return { data: { accepted: true } };
  });

  app.post('/register', {
    config: { rateLimit: { max: 5, timeWindow: '1 hour' } }
  }, async (request, reply) => {
    const input = registerSchema.parse(request.body);
    const passwordHash = await hashPassword(input.password);
    const session = prepareSession(app, '00000000-0000-0000-0000-000000000000');

    let userId: string;
    try {
      userId = await withTransaction(async (client) => {
        const store = await client.query<{ id: string }>(
          `SELECT id FROM stores WHERE code=$1 AND status='active' FOR SHARE`,
          [env.DEFAULT_STORE_CODE]
        );
        if (!store.rows[0]) throw new AppError(503, 'STORE_UNAVAILABLE', 'Qeydiyyat müvəqqəti əlçatan deyil');

        const created = await client.query<{ id: string }>(`
          INSERT INTO users(email,phone,password_hash,first_name,last_name,status)
          VALUES($1,$2,$3,$4,$5,'active') RETURNING id
        `, [input.email, input.phone ?? null, passwordHash, input.firstName, input.lastName]);
        const id = created.rows[0]!.id;
        const assigned = await client.query(`
          INSERT INTO user_roles(user_id,role_id,store_id)
          SELECT $1,id,$2 FROM roles WHERE code='customer'
          RETURNING id
        `, [id, store.rows[0].id]);
        if (!assigned.rows[0]) throw new AppError(503, 'CUSTOMER_ROLE_UNAVAILABLE', 'Qeydiyyat rolu tapılmadı');
        await client.query(`
          INSERT INTO loyalty_accounts(user_id,store_id,balance,lifetime_earned)
          VALUES($1,$2,0,0) ON CONFLICT(user_id,store_id) DO NOTHING
        `, [id, store.rows[0].id]);

        session.userId = id;
        session.accessToken = app.jwt.sign({ sub: id, sessionId: session.id }, { expiresIn: env.ACCESS_TOKEN_TTL });
        await persistSession(client, session, request);
        await client.query(`
          INSERT INTO audit_logs(store_id,action,entity_type,entity_id,after_data,request_id)
          VALUES($1,'user.register','user',$2,$3,$4)
        `, [store.rows[0].id, id, JSON.stringify({ email: input.email, roleCode: 'customer' }), request.id]);
        return id;
      });
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new AppError(409, 'ACCOUNT_EXISTS', 'Bu e-poçt və ya telefonla hesab artıq mövcuddur');
      }
      throw error;
    }

    applySessionCookies(reply, session);
    const actor = await loadActorContext(userId);
    return reply.code(201).send({ data: actor && { ...actor, permissions: [...actor.permissions] } });
  });

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

    const outcome = await withTransaction(async (client) => {
      const result = await client.query<{
        id: string; user_id: string; family_id: string; expires_at: Date;
        rotated_at: Date | null; revoked_at: Date | null;
      }>(`
        SELECT rs.id,rs.user_id,rs.family_id,rs.expires_at,rs.rotated_at,rs.revoked_at
        FROM refresh_sessions rs JOIN users u ON u.id=rs.user_id
        WHERE rs.token_hash=$1 AND u.status='active' AND u.deleted_at IS NULL
        FOR UPDATE OF rs
      `, [tokenDigest(rawToken)]);
      const current = result.rows[0];
      if (!current) return { kind: 'invalid' as const };
      if (current.rotated_at || current.revoked_at || current.expires_at <= new Date()) {
        await client.query(
          'UPDATE refresh_sessions SET revoked_at=now() WHERE family_id=$1 AND revoked_at IS NULL',
          [current.family_id]
        );
        return { kind: 'reuse' as const };
      }

      const next = prepareSession(app, current.user_id, current.family_id);
      await client.query('UPDATE refresh_sessions SET rotated_at=now() WHERE id=$1', [current.id]);
      await persistSession(client, next, request);
      return { kind: 'ok' as const, session: next };
    });

    if (outcome.kind !== 'ok') {
      clearAuthCookies(reply);
      throw new AppError(
        401,
        outcome.kind === 'reuse' ? 'SESSION_REUSE_DETECTED' : 'SESSION_INVALID',
        outcome.kind === 'reuse' ? 'Sessiya təhlükəsizlik səbəbi ilə dayandırıldı' : 'Sessiya etibarsızdır'
      );
    }
    applySessionCookies(reply, outcome.session);
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
