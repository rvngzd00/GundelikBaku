import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { hashPassword } from '../core/password.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { actorOf, assertStoreScope } from '../core/scope.js';
import { notFound } from '../core/errors.js';
import { writeAudit } from '../core/audit.js';

const userInput = z.object({
  email: z.email().max(254).transform((value) => value.toLowerCase()),
  phone: z.string().trim().max(40).optional(),
  firstName: z.string().trim().min(2).max(100),
  lastName: z.string().trim().min(2).max(100),
  temporaryPassword: z.string().min(12).max(200),
  roleCode: z.enum(['admin', 'editor', 'seo', 'moderator', 'vendor_owner', 'vendor_staff', 'customer']),
  storeId: z.uuid(),
  vendorId: z.uuid().optional()
}).superRefine((value, context) => {
  if (value.roleCode.startsWith('vendor_') && !value.vendorId) {
    context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Satıcı rolu üçün vendorId tələb olunur' });
  }
  if (!value.roleCode.startsWith('vendor_') && value.vendorId) {
    context.addIssue({ code: 'custom', path: ['vendorId'], message: 'Bu rol vendor scope qəbul etmir' });
  }
});

const statusInput = z.object({ status: z.enum(['invited', 'active', 'suspended', 'disabled']) });

export async function userRoutes(app: FastifyInstance): Promise<void> {
  app.get('/', { preHandler: app.requirePermission('users.read') }, async (request) => {
    const query = paginationSchema.parse(request.query);
    const actor = actorOf(request);
    const params: unknown[] = [];
    const conditions = ['u.deleted_at IS NULL'];
    if (!actor.isSuperAdmin) {
      params.push(actor.storeIds);
      conditions.push(`ur.store_id = ANY($${params.length}::uuid[])`);
    }
    if (query.search) {
      params.push(`%${query.search}%`);
      conditions.push(`(u.email::text ILIKE $${params.length} OR concat(u.first_name, ' ', u.last_name) ILIKE $${params.length})`);
    }
    if (query.status) {
      params.push(query.status);
      conditions.push(`u.status::text = $${params.length}`);
    }
    params.push(query.limit, (query.page - 1) * query.limit);
    const result = await pool.query(`
      SELECT u.id, u.email, u.phone, u.first_name, u.last_name, u.status,
        u.last_login_at, u.created_at,
        array_remove(array_agg(DISTINCT r.code), NULL) AS roles,
        array_remove(array_agg(DISTINCT ur.store_id::text), NULL) AS store_ids,
        array_remove(array_agg(DISTINCT ur.vendor_id::text), NULL) AS vendor_ids,
        count(*) OVER()::int AS total_count
      FROM users u
      LEFT JOIN user_roles ur ON ur.user_id = u.id
      LEFT JOIN roles r ON r.id = ur.role_id
      WHERE ${conditions.join(' AND ')}
      GROUP BY u.id
      ORDER BY u.created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}
    `, params);
    const total = Number(result.rows[0]?.total_count ?? 0);
    return { data: result.rows.map(({ total_count: _, ...row }) => row), meta: paginationMeta(query.page, query.limit, total) };
  });

  app.post('/', { preHandler: app.requirePermission('users.manage') }, async (request, reply) => {
    const input = userInput.parse(request.body);
    const actor = actorOf(request);
    assertStoreScope(actor, input.storeId);
    if (input.vendorId) {
      const vendor = await pool.query('SELECT store_id FROM vendors WHERE id = $1 AND deleted_at IS NULL', [input.vendorId]);
      if (!vendor.rows[0] || vendor.rows[0].store_id !== input.storeId) throw notFound('Satıcı');
      assertStoreScope(actor, vendor.rows[0].store_id);
    }
    const passwordHash = await hashPassword(input.temporaryPassword);

    const user = await withTransaction(async (client) => {
      const created = await client.query(`
        INSERT INTO users (email, phone, password_hash, first_name, last_name, status)
        VALUES ($1,$2,$3,$4,$5,'invited') RETURNING id, email, phone, first_name, last_name, status, created_at
      `, [input.email, input.phone ?? null, passwordHash, input.firstName, input.lastName]);
      const userId = created.rows[0].id;
      await client.query(`
        INSERT INTO user_roles (user_id, role_id, store_id, vendor_id, granted_by)
        SELECT $1, id, $2, $3, $4 FROM roles WHERE code = $5
      `, [userId, input.storeId, input.vendorId ?? null, actor.userId, input.roleCode]);
      await writeAudit(client, { actorUserId: actor.userId, storeId: input.storeId, vendorId: input.vendorId ?? null, action: 'user.create', entityType: 'user', entityId: userId, afterData: { ...created.rows[0], roleCode: input.roleCode }, requestId: request.id });
      return created.rows[0];
    });
    return reply.code(201).send({ data: user });
  });

  app.patch('/:id/status', { preHandler: app.requirePermission('users.manage') }, async (request) => {
    const id = z.uuid().parse((request.params as { id: string }).id);
    const input = statusInput.parse(request.body);
    const actor = actorOf(request);
    const current = await pool.query(`
      SELECT u.*, array_remove(array_agg(DISTINCT ur.store_id::text), NULL) AS store_ids
      FROM users u LEFT JOIN user_roles ur ON ur.user_id = u.id
      WHERE u.id = $1 AND u.deleted_at IS NULL GROUP BY u.id
    `, [id]);
    if (!current.rows[0]) throw notFound('İstifadəçi');
    if (!actor.isSuperAdmin && !current.rows[0].store_ids.some((storeId: string) => actor.storeIds.includes(storeId))) {
      throw notFound('İstifadəçi');
    }

    const updated = await withTransaction(async (client) => {
      const result = await client.query(`UPDATE users SET status = $2 WHERE id = $1 RETURNING id, email, first_name, last_name, status`, [id, input.status]);
      if (input.status !== 'active') await client.query('UPDATE refresh_sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL', [id]);
      await writeAudit(client, { actorUserId: actor.userId, action: 'user.status.update', entityType: 'user', entityId: id, beforeData: { status: current.rows[0].status }, afterData: { status: input.status }, requestId: request.id });
      return result.rows[0];
    });
    return { data: updated };
  });
}
