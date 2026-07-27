import type { FastifyInstance } from 'fastify';
import type { PoolClient } from 'pg';
import { z } from 'zod';
import {
  clearCustomerIdentity,
  customerRateLimitKey,
  resolveCustomerIdentity,
  type CustomerIdentity
} from '../customer/identity.js';
import { badRequest, notFound } from '../core/errors.js';
import { hashPassword, verifyPassword } from '../core/password.js';
import { env } from '../config/env.js';
import { pool, withTransaction } from '../db/pool.js';

const syncSchema = z.object({
  cart: z.array(z.object({
    listingId: z.uuid(),
    variantId: z.uuid(),
    quantity: z.number().int().min(1).max(100)
  })).max(100).default([]),
  wishlist: z.array(z.object({ listingId: z.uuid() })).max(200).default([])
});

const profileSchema = z.object({
  firstName: z.string().trim().max(100).default(''),
  lastName: z.string().trim().max(100).default(''),
  displayName: z.string().trim().max(120).default(''),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  phone: z.string().trim().max(40).default(''),
  currentPassword: z.string().max(200).optional(),
  newPassword: z.string().min(8).max(200).optional()
});

const addressSchema = z.object({
  label: z.string().trim().min(1).max(100).default('Əsas ünvan'),
  recipientName: z.string().trim().min(2).max(200),
  phone: z.string().trim().min(7).max(40),
  countryCode: z.string().trim().length(2).default('AZ'),
  city: z.string().trim().min(2).max(120),
  district: z.string().trim().max(120).default(''),
  addressLine1: z.string().trim().min(5).max(300),
  addressLine2: z.string().trim().max(300).default(''),
  postalCode: z.string().trim().max(30).default('')
});

const reviewSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  authorName: z.string().trim().min(2).max(80),
  email: z.union([z.literal(''), z.email().max(254)]).default(''),
  title: z.string().trim().max(120).default(''),
  body: z.string().trim().min(10).max(2000)
});

type StoreRow = { id: string; currency: string };

async function getStore(): Promise<StoreRow> {
  const result = await pool.query<StoreRow>(
    `SELECT id,currency FROM stores WHERE code=$1 AND status='active'`,
    [env.DEFAULT_STORE_CODE]
  );
  if (!result.rows[0]) throw notFound('Store');
  return result.rows[0];
}

function identityValues(identity: CustomerIdentity): [string | null, string | null] {
  return [identity.userId, identity.anonymousId];
}

async function ensureCart(
  client: Pick<PoolClient, 'query'>,
  store: StoreRow,
  identity: CustomerIdentity
): Promise<string> {
  const [userId, anonymousId] = identityValues(identity);
  const conflict = userId
    ? '(store_id,user_id) WHERE user_id IS NOT NULL'
    : '(store_id,anonymous_id) WHERE anonymous_id IS NOT NULL';
  const result = await client.query<{ id: string }>(`
    INSERT INTO carts(store_id,user_id,anonymous_id,currency)
    VALUES($1,$2,$3,$4)
    ON CONFLICT ${conflict}
    DO UPDATE SET expires_at=now()+interval '30 days',updated_at=now()
    RETURNING id
  `, [store.id, userId, anonymousId, store.currency]);
  return result.rows[0]!.id;
}

async function ensureWishlist(
  client: Pick<PoolClient, 'query'>,
  storeId: string,
  identity: CustomerIdentity
): Promise<string> {
  const [userId, anonymousId] = identityValues(identity);
  const conflict = userId
    ? '(store_id,user_id) WHERE user_id IS NOT NULL'
    : '(store_id,anonymous_id) WHERE anonymous_id IS NOT NULL';
  const result = await client.query<{ id: string }>(`
    INSERT INTO wishlists(store_id,user_id,anonymous_id)
    VALUES($1,$2,$3)
    ON CONFLICT ${conflict}
    DO UPDATE SET updated_at=now()
    RETURNING id
  `, [storeId, userId, anonymousId]);
  return result.rows[0]!.id;
}

const commerceProductFields = `
  pl.id AS "listingId",pv.id AS "variantId",pl.slug,pl.title,
    pl.price::float8 AS price,pl.compare_at_price::float8 AS "compareAt",
    pl.currency,p.sku,b.name AS brand,v.display_name AS vendor,
    coalesce(ma.public_url,'/assets/wp-content/uploads/other-cat.webp') AS image`;
const commerceProductFrom = `
  FROM product_listings pl
  JOIN products p ON p.id=pl.product_id
  JOIN vendors v ON v.id=p.vendor_id
  LEFT JOIN brands b ON b.id=p.brand_id
  LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
  LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
  JOIN LATERAL (
    SELECT id FROM product_variants
    WHERE product_id=p.id AND status='active'
    ORDER BY created_at LIMIT 1
  ) pv ON true`;

async function customerState(store: StoreRow, identity: CustomerIdentity): Promise<Record<string, unknown>> {
  const [userId, anonymousId] = identityValues(identity);
  const identityColumn = userId ? 'user_id' : 'anonymous_id';
  const identityValue = userId ?? anonymousId!;

  const [cart, wishlist, profile, addresses, orders, orderItems] = await Promise.all([
    pool.query(`SELECT ${commerceProductFields},ci.quantity ${commerceProductFrom}
      JOIN cart_items ci ON ci.listing_id=pl.id AND ci.variant_id=pv.id
      JOIN carts c ON c.id=ci.cart_id
      WHERE c.store_id=$1 AND c.${identityColumn}=$2
      ORDER BY ci.added_at`, [store.id, identityValue]),
    pool.query(`SELECT ${commerceProductFields} ${commerceProductFrom}
      JOIN wishlist_items wi ON wi.listing_id=pl.id
      JOIN wishlists w ON w.id=wi.wishlist_id
      WHERE w.store_id=$1 AND w.${identityColumn}=$2
      ORDER BY wi.added_at`, [store.id, identityValue]),
    userId
      ? pool.query(`SELECT u.first_name AS "firstName",u.last_name AS "lastName",
          coalesce(nullif(cp.display_name,''),u.first_name) AS "displayName",
          u.email::text,u.phone,true AS "authenticated"
        FROM users u LEFT JOIN customer_profiles cp ON cp.user_id=u.id WHERE u.id=$1`, [userId])
      : pool.query(`SELECT first_name AS "firstName",last_name AS "lastName",
          display_name AS "displayName",email::text,phone,false AS "authenticated"
        FROM customer_profiles WHERE anonymous_id=$1`, [anonymousId]),
    userId
      ? pool.query(`SELECT id,address_type AS "addressType",label,recipient_name AS "recipientName",
          phone,country_code AS "countryCode",city,coalesce(district,'') AS district,
          address_line_1 AS "addressLine1",coalesce(address_line_2,'') AS "addressLine2",
          coalesce(postal_code,'') AS "postalCode"
        FROM user_addresses WHERE user_id=$1 ORDER BY is_default DESC,created_at`, [userId])
      : pool.query(`SELECT id,address_type AS "addressType",label,recipient_name AS "recipientName",
          phone,country_code AS "countryCode",city,coalesce(district,'') AS district,
          address_line_1 AS "addressLine1",coalesce(address_line_2,'') AS "addressLine2",
          coalesce(postal_code,'') AS "postalCode"
        FROM guest_addresses WHERE anonymous_id=$1 ORDER BY address_type`, [anonymousId]),
    pool.query(`SELECT id,order_number AS "orderNumber",status,payment_status AS "paymentStatus",
        currency,grand_total::float8 AS "grandTotal",placed_at AS "placedAt"
      FROM orders WHERE store_id=$1 AND ${identityColumn}=$2 ORDER BY placed_at DESC LIMIT 50`, [store.id, identityValue]),
    pool.query(`SELECT oi.order_id AS "orderId",oi.id,oi.product_name AS title,oi.sku,
        oi.quantity,oi.unit_price::float8 AS price,oi.line_total::float8 AS "lineTotal",
        coalesce(pl.slug,'') AS slug,coalesce(ma.public_url,'/assets/wp-content/uploads/other-cat.webp') AS image,
        oi.snapshot->>'listingId' AS "listingId",oi.variant_id AS "variantId"
      FROM order_items oi
      JOIN orders o ON o.id=oi.order_id
      LEFT JOIN product_listings pl ON pl.id=(oi.snapshot->>'listingId')::uuid
      LEFT JOIN products p ON p.id=oi.product_id
      LEFT JOIN product_media pm ON pm.product_id=p.id AND pm.is_primary
      LEFT JOIN media_assets ma ON ma.id=pm.media_asset_id
      WHERE o.store_id=$1 AND o.${identityColumn}=$2 ORDER BY o.placed_at DESC,oi.id`, [store.id, identityValue])
  ]);

  const itemsByOrder = new Map<string, unknown[]>();
  for (const item of orderItems.rows) {
    const items = itemsByOrder.get(item.orderId) ?? [];
    items.push(item);
    itemsByOrder.set(item.orderId, items);
  }

  return {
    cart: cart.rows,
    wishlist: wishlist.rows,
    profile: profile.rows[0] ?? {
      firstName: '', lastName: '', displayName: '', email: '', phone: '', authenticated: false
    },
    addresses: addresses.rows,
    orders: orders.rows.map((order) => ({ ...order, items: itemsByOrder.get(order.id) ?? [] }))
  };
}

export async function customerRoutes(app: FastifyInstance): Promise<void> {
  app.get('/state', async (request, reply) => {
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    reply.header('Cache-Control', 'private, no-store');
    return { data: await customerState(store, identity) };
  });

  app.post('/sync', {
    config: { rateLimit: { max: 80, timeWindow: '1 minute' } }
  }, async (request, reply) => {
    const input = syncSchema.parse(request.body);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);

    await withTransaction(async (client) => {
      const cartId = await ensureCart(client, store, identity);
      const wishlistId = await ensureWishlist(client, store.id, identity);
      await client.query('DELETE FROM cart_items WHERE cart_id=$1', [cartId]);
      await client.query('DELETE FROM wishlist_items WHERE wishlist_id=$1', [wishlistId]);

      for (const item of input.cart) {
        const product = await client.query<{ price: string }>(`
          SELECT pl.price FROM product_listings pl
          JOIN product_variants pv ON pv.product_id=pl.product_id
          WHERE pl.id=$1 AND pv.id=$2 AND pl.store_id=$3
            AND pl.status='published' AND pv.status='active'
        `, [item.listingId, item.variantId, store.id]);
        if (!product.rows[0]) continue;
        await client.query(`
          INSERT INTO cart_items(cart_id,listing_id,variant_id,quantity,unit_price)
          VALUES($1,$2,$3,$4,$5)
        `, [cartId, item.listingId, item.variantId, item.quantity, product.rows[0].price]);
      }

      if (input.wishlist.length) {
        const listingIds = [...new Set(input.wishlist.map((item) => item.listingId))];
        await client.query(`
          INSERT INTO wishlist_items(wishlist_id,listing_id)
          SELECT $1,pl.id FROM product_listings pl
          WHERE pl.store_id=$2 AND pl.status='published' AND pl.id=ANY($3::uuid[])
          ON CONFLICT DO NOTHING
        `, [wishlistId, store.id, listingIds]);
      }
    });

    reply.header('Cache-Control', 'private, no-store');
    return { data: await customerState(store, identity) };
  });

  app.patch('/profile', {
    config: { rateLimit: { max: 20, timeWindow: '15 minutes' } }
  }, async (request, reply) => {
    const input = profileSchema.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);

    if (identity.userId) {
      await withTransaction(async (client) => {
        if (input.newPassword) {
          if (!input.currentPassword) throw badRequest('CURRENT_PASSWORD_REQUIRED', 'Cari şifrəni daxil edin');
          const current = await client.query<{ password_hash: string }>(
            'SELECT password_hash FROM users WHERE id=$1 FOR UPDATE',
            [identity.userId]
          );
          if (!current.rows[0] || !await verifyPassword(input.currentPassword, current.rows[0].password_hash)) {
            throw badRequest('CURRENT_PASSWORD_INVALID', 'Cari şifrə yanlışdır');
          }
        }
        const nextHash = input.newPassword ? await hashPassword(input.newPassword) : null;
        await client.query(`
          UPDATE users SET first_name=$2,last_name=$3,email=$4,phone=nullif($5,''),
            password_hash=coalesce($6,password_hash) WHERE id=$1
        `, [identity.userId, input.firstName, input.lastName, input.email, input.phone, nextHash]);
        await client.query(`
          INSERT INTO customer_profiles(user_id,display_name)
          VALUES($1,$2)
          ON CONFLICT (user_id) WHERE user_id IS NOT NULL
          DO UPDATE SET display_name=excluded.display_name
        `, [identity.userId, input.displayName]);
      });
    } else {
      if (input.newPassword) {
        throw badRequest('AUTH_REQUIRED', 'Şifrə dəyişmək üçün hesaba daxil olun');
      }
      await pool.query(`
        INSERT INTO customer_profiles(anonymous_id,display_name,first_name,last_name,email,phone)
        VALUES($1,$2,$3,$4,nullif($5,'')::citext,nullif($6,''))
        ON CONFLICT (anonymous_id) WHERE anonymous_id IS NOT NULL
        DO UPDATE SET display_name=excluded.display_name,first_name=excluded.first_name,
          last_name=excluded.last_name,email=excluded.email,phone=excluded.phone
      `, [identity.anonymousId, input.displayName, input.firstName, input.lastName, input.email, input.phone]);
    }

    const store = await getStore();
    return { data: (await customerState(store, identity))['profile'] };
  });

  app.put('/addresses/:type', async (request, reply) => {
    const type = z.enum(['billing', 'shipping']).parse((request.params as { type: string }).type);
    const input = addressSchema.parse(request.body);
    const identity = await resolveCustomerIdentity(request, reply);
    if (identity.userId) {
      const existing = await pool.query<{ id: string }>(
        'SELECT id FROM user_addresses WHERE user_id=$1 AND address_type=$2 ORDER BY is_default DESC,created_at LIMIT 1',
        [identity.userId, type]
      );
      if (existing.rows[0]) {
        await pool.query(`
          UPDATE user_addresses SET label=$2,recipient_name=$3,phone=$4,country_code=$5,
            city=$6,district=nullif($7,''),address_line_1=$8,address_line_2=nullif($9,''),
            postal_code=nullif($10,'') WHERE id=$1
        `, [existing.rows[0].id, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
          input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
      } else {
        await pool.query(`
          INSERT INTO user_addresses(user_id,address_type,label,recipient_name,phone,country_code,
            city,district,address_line_1,address_line_2,postal_code)
          VALUES($1,$2,$3,$4,$5,$6,$7,nullif($8,''),$9,nullif($10,''),nullif($11,''))
        `, [identity.userId, type, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
          input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
      }
    } else {
      await pool.query(`
        INSERT INTO guest_addresses(anonymous_id,address_type,label,recipient_name,phone,country_code,
          city,district,address_line_1,address_line_2,postal_code)
        VALUES($1,$2,$3,$4,$5,$6,$7,nullif($8,''),$9,nullif($10,''),nullif($11,''))
        ON CONFLICT(anonymous_id,address_type) DO UPDATE SET label=excluded.label,
          recipient_name=excluded.recipient_name,phone=excluded.phone,country_code=excluded.country_code,
          city=excluded.city,district=excluded.district,address_line_1=excluded.address_line_1,
          address_line_2=excluded.address_line_2,postal_code=excluded.postal_code
      `, [identity.anonymousId, type, input.label, input.recipientName, input.phone, input.countryCode.toUpperCase(),
        input.city, input.district, input.addressLine1, input.addressLine2, input.postalCode]);
    }
    const store = await getStore();
    return { data: (await customerState(store, identity))['addresses'] };
  });

  app.post('/products/:slug/reviews', {
    config: {
      rateLimit: {
        max: 10,
        timeWindow: '15 minutes',
        groupId: 'product-reviews',
        keyGenerator: customerRateLimitKey,
        errorResponseBuilder: () => ({
          statusCode: 429,
          code: 'REVIEW_RATE_LIMITED',
          error: 'Too Many Requests',
          message: 'Ardıcıl çox sayda rəy göndərildi. Bir qədər gözləyib yenidən cəhd edin.'
        })
      }
    }
  }, async (request, reply) => {
    const slug = z.string().min(2).max(220).parse((request.params as { slug: string }).slug);
    const input = reviewSchema.parse(request.body);
    const [store, identity] = await Promise.all([getStore(), resolveCustomerIdentity(request, reply)]);
    const product = await pool.query<{ product_id: string }>(`
      SELECT product_id FROM product_listings
      WHERE store_id=$1 AND slug=$2 AND status='published'
    `, [store.id, slug]);
    if (!product.rows[0]) throw notFound('Məhsul');

    const [userId, anonymousId] = identityValues(identity);
    const identityColumn = userId ? 'user_id' : 'anonymous_id';
    const identityValue = userId ?? anonymousId!;
    const verified = await pool.query<{ verified: boolean }>(`
      SELECT EXISTS(
        SELECT 1 FROM order_items oi
        JOIN orders o ON o.id=oi.order_id
        WHERE o.store_id=$1 AND oi.product_id=$2 AND o.${identityColumn}=$3
          AND o.status NOT IN ('cancelled','returned','refunded')
      ) AS verified
    `, [store.id, product.rows[0].product_id, identityValue]);
    const conflict = userId
      ? '(store_id,product_id,user_id) WHERE user_id IS NOT NULL'
      : '(store_id,product_id,anonymous_id) WHERE anonymous_id IS NOT NULL';

    const review = await pool.query(`
      INSERT INTO product_reviews(
        store_id,product_id,user_id,anonymous_id,author_name,author_email,
        rating,title,body,status,verified_purchase
      )
      VALUES($1,$2,$3,$4,$5,nullif($6,'')::citext,$7,$8,$9,'published',$10)
      ON CONFLICT ${conflict}
      DO UPDATE SET author_name=excluded.author_name,author_email=excluded.author_email,
        rating=excluded.rating,title=excluded.title,body=excluded.body,status='published',
        verified_purchase=excluded.verified_purchase,created_at=now()
      RETURNING id,author_name,rating,title,body,verified_purchase,created_at
    `, [store.id, product.rows[0].product_id, userId, anonymousId, input.authorName,
      input.email, input.rating, input.title, input.body, Boolean(verified.rows[0]?.verified)]);
    const summary = await pool.query<{ average: number; count: number }>(`
      SELECT coalesce(round(avg(rating)::numeric,1),0)::float8 AS average,count(*)::int AS count
      FROM product_reviews WHERE store_id=$1 AND product_id=$2 AND status='published'
    `, [store.id, product.rows[0].product_id]);

    reply.header('Cache-Control', 'private, no-store');
    return {
      data: {
        review: review.rows[0],
        summary: summary.rows[0] ?? { average: 0, count: 0 }
      }
    };
  });

  app.post('/logout', async (_request, reply) => {
    clearCustomerIdentity(reply);
    return reply.code(204).send();
  });
}
