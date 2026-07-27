import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { actorOf, assertStoreScope, assertVendorScope } from '../core/scope.js';
import { badRequest, notFound } from '../core/errors.js';
import { slugify } from '../core/slug.js';
import { writeAudit } from '../core/audit.js';

const categoryInput = z.object({
  storeId: z.uuid(), parentId: z.uuid().nullable().optional(), name: z.string().trim().min(2).max(160),
  slug: z.string().trim().max(180).optional(), description: z.string().trim().max(5000).default(''),
  position: z.number().int().min(0).default(0), seoTitle: z.string().trim().max(70).optional(),
  seoDescription: z.string().trim().max(170).optional()
});

const productBase = z.object({
  storeId: z.uuid(), vendorId: z.uuid(), brandId: z.uuid().nullable().optional(), sku: z.string().trim().min(1).max(100),
  barcode: z.string().trim().max(100).nullable().optional(), name: z.string().trim().min(2).max(240),
  title: z.string().trim().min(2).max(240).optional(), slug: z.string().trim().max(220).optional(),
  shortDescription: z.string().trim().max(500).default(''), description: z.string().trim().max(100000).default(''),
  productType: z.enum(['physical', 'digital', 'service']).default('physical'), price: z.number().min(0),
  compareAtPrice: z.number().min(0).nullable().optional(), currency: z.string().length(3).default('AZN'),
  categoryIds: z.array(z.uuid()).max(20).default([]), attributes: z.record(z.string(), z.unknown()).default({}),
  seoTitle: z.string().trim().max(70).optional(), seoDescription: z.string().trim().max(170).optional(),
  variant: z.object({ sku: z.string().trim().min(1).max(100), title: z.string().trim().min(1).max(160).default('Standart') }).optional()
});
const productInput = productBase.refine((value) => value.compareAtPrice == null || value.compareAtPrice >= value.price, { path: ['compareAtPrice'], message: 'Köhnə qiymət satış qiymətindən az ola bilməz' });

const productUpdate = productBase.omit({ storeId: true, vendorId: true, variant: true }).partial().refine((value) => value.compareAtPrice == null || value.price == null || value.compareAtPrice >= value.price, { path: ['compareAtPrice'], message: 'Köhnə qiymət satış qiymətindən az ola bilməz' });
const productStatus = z.object({ status: z.enum(['draft', 'review', 'published', 'rejected', 'archived']), note: z.string().trim().max(1000).default('') });
const inventoryInput = z.object({ warehouseId: z.uuid(), variantId: z.uuid(), quantityDelta: z.number().int().refine((v) => v !== 0), note: z.string().trim().max(500).default(''), referenceId: z.string().max(100).optional() });

async function resolveVendor(actor: ReturnType<typeof actorOf>, vendorId: string, storeId?: string) {
  const result = await pool.query('SELECT id, store_id, status FROM vendors WHERE id=$1 AND deleted_at IS NULL', [vendorId]);
  const vendor = result.rows[0];
  if (!vendor || (storeId && vendor.store_id !== storeId)) throw notFound('Satıcı');
  if (actor.vendorIds.length) assertVendorScope(actor, vendorId); else assertStoreScope(actor, vendor.store_id);
  return vendor;
}

async function getScopedProduct(actor: ReturnType<typeof actorOf>, id: string) {
  const result = await pool.query(`SELECT p.*, v.store_id FROM products p JOIN vendors v ON v.id=p.vendor_id WHERE p.id=$1 AND p.deleted_at IS NULL`, [id]);
  const row = result.rows[0];
  if (!row) throw notFound('Məhsul');
  if (actor.vendorIds.length) assertVendorScope(actor, row.vendor_id); else assertStoreScope(actor, row.store_id);
  return row;
}

export async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/categories', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const actor = actorOf(request);
    const storeId = z.uuid().parse((request.query as { storeId?: string }).storeId ?? actor.storeIds[0]);
    assertStoreScope(actor, storeId);
    const result = await pool.query(`SELECT c.*, count(p.product_id)::int AS product_count FROM categories c LEFT JOIN product_categories p ON p.category_id=c.id WHERE c.store_id=$1 GROUP BY c.id ORDER BY c.position,c.name`, [storeId]);
    return { data: result.rows };
  });

  app.post('/categories', { preHandler: app.requirePermission('catalog.create') }, async (request, reply) => {
    const input = categoryInput.parse(request.body); const actor = actorOf(request); assertStoreScope(actor, input.storeId);
    if (input.parentId) {
      const parent = await pool.query('SELECT id FROM categories WHERE id=$1 AND store_id=$2', [input.parentId, input.storeId]);
      if (!parent.rows[0]) throw badRequest('PARENT_CATEGORY_INVALID', 'Üst kateqoriya bu store-a aid deyil');
    }
    const result = await pool.query(`INSERT INTO categories(store_id,parent_id,name,slug,description,position,seo_title,seo_description) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`, [input.storeId,input.parentId??null,input.name,slugify(input.slug??input.name),input.description,input.position,input.seoTitle??null,input.seoDescription??null]);
    return reply.code(201).send({ data: result.rows[0] });
  });

  app.get('/products', { preHandler: app.requirePermission('catalog.read') }, async (request) => {
    const query = paginationSchema.extend({ vendorId: z.uuid().optional(), storeId: z.uuid().optional() }).parse(request.query);
    const actor = actorOf(request); const params: unknown[]=[]; const conditions=['p.deleted_at IS NULL'];
    if (actor.vendorIds.length) { params.push(actor.vendorIds); conditions.push(`p.vendor_id=ANY($${params.length}::uuid[])`); }
    else if (!actor.isSuperAdmin) { params.push(actor.storeIds); conditions.push(`pl.store_id=ANY($${params.length}::uuid[])`); }
    if (query.vendorId) { await resolveVendor(actor, query.vendorId, query.storeId); params.push(query.vendorId); conditions.push(`p.vendor_id=$${params.length}`); }
    if (query.storeId) { assertStoreScope(actor, query.storeId); params.push(query.storeId); conditions.push(`pl.store_id=$${params.length}`); }
    if (query.search) { params.push(`%${query.search}%`); conditions.push(`(p.name ILIKE $${params.length} OR p.sku ILIKE $${params.length} OR pl.title ILIKE $${params.length})`); }
    if (query.status) { params.push(query.status); conditions.push(`pl.status::text=$${params.length}`); }
    params.push(query.limit,(query.page-1)*query.limit);
    const result=await pool.query(`SELECT p.id,p.vendor_id,p.sku,p.name,p.status,p.created_at,v.display_name AS vendor_name,pl.store_id,pl.title,pl.slug,pl.price,pl.compare_at_price,pl.currency,pl.status AS listing_status,pl.published_at,count(*) OVER()::int AS total_count FROM products p JOIN vendors v ON v.id=p.vendor_id JOIN product_listings pl ON pl.product_id=p.id WHERE ${conditions.join(' AND ')} ORDER BY p.created_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    const total=Number(result.rows[0]?.total_count??0); return {data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.post('/products', { preHandler: app.requirePermission('catalog.create') }, async (request, reply) => {
    const input=productInput.parse(request.body); const actor=actorOf(request); await resolveVendor(actor,input.vendorId,input.storeId);
    const data=await withTransaction(async(client)=>{
      if (input.categoryIds.length) { const valid=await client.query('SELECT count(*)::int AS count FROM categories WHERE store_id=$1 AND id=ANY($2::uuid[])',[input.storeId,input.categoryIds]); if(valid.rows[0].count!==input.categoryIds.length) throw badRequest('CATEGORY_SCOPE_INVALID','Kateqoriyalardan biri store-a aid deyil'); }
      const p=await client.query(`INSERT INTO products(vendor_id,brand_id,sku,barcode,name,description,product_type,attributes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,[input.vendorId,input.brandId??null,input.sku,input.barcode??null,input.name,input.description,input.productType,JSON.stringify(input.attributes),actor.userId]);
      const id=p.rows[0].id;
      const listing=await client.query(`INSERT INTO product_listings(store_id,product_id,title,slug,short_description,description,price,compare_at_price,currency,seo_title,seo_description) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,[input.storeId,id,input.title??input.name,slugify(input.slug??input.title??input.name),input.shortDescription,input.description,input.price,input.compareAtPrice??null,input.currency.toUpperCase(),input.seoTitle??null,input.seoDescription??null]);
      for(const [index,categoryId] of input.categoryIds.entries()) await client.query('INSERT INTO product_categories(product_id,category_id,is_primary) VALUES($1,$2,$3)',[id,categoryId,index===0]);
      const variant=input.variant??{sku:input.sku,title:'Standart'}; const v=await client.query(`INSERT INTO product_variants(product_id,sku,title) VALUES($1,$2,$3) RETURNING *`,[id,variant.sku,variant.title]);
      await writeAudit(client,{actorUserId:actor.userId,storeId:input.storeId,vendorId:input.vendorId,action:'product.create',entityType:'product',entityId:id,afterData:{product:p.rows[0],listing:listing.rows[0]},requestId:request.id});
      return {...p.rows[0],listing:listing.rows[0],variants:[v.rows[0]]};
    }); return reply.code(201).send({data});
  });

  app.patch('/products/:id', { preHandler: app.requirePermission('catalog.update') }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const input=productUpdate.parse(request.body); const actor=actorOf(request); const current=await getScopedProduct(actor,id);
    const data=await withTransaction(async(client)=>{
      const p=await client.query(`UPDATE products SET brand_id=coalesce($2,brand_id),sku=coalesce($3,sku),barcode=coalesce($4,barcode),name=coalesce($5,name),description=coalesce($6,description),product_type=coalesce($7,product_type),attributes=coalesce($8,attributes) WHERE id=$1 RETURNING *`,[id,input.brandId??null,input.sku??null,input.barcode??null,input.name??null,input.description??null,input.productType??null,input.attributes?JSON.stringify(input.attributes):null]);
      const l=await client.query(`UPDATE product_listings SET title=coalesce($2,title),slug=coalesce($3,slug),short_description=coalesce($4,short_description),description=coalesce($5,description),price=coalesce($6,price),compare_at_price=coalesce($7,compare_at_price),currency=coalesce($8,currency),seo_title=coalesce($9,seo_title),seo_description=coalesce($10,seo_description),status=CASE WHEN status='published' THEN 'review'::product_status ELSE status END WHERE product_id=$1 RETURNING *`,[id,input.title??null,input.slug?slugify(input.slug):null,input.shortDescription??null,input.description??null,input.price??null,input.compareAtPrice??null,input.currency?.toUpperCase()??null,input.seoTitle??null,input.seoDescription??null]);
      if(input.categoryIds){await client.query('DELETE FROM product_categories WHERE product_id=$1',[id]);for(const[index,c]of input.categoryIds.entries())await client.query('INSERT INTO product_categories(product_id,category_id,is_primary) SELECT $1,id,$3 FROM categories WHERE id=$2 AND store_id=$4',[id,c,index===0,current.store_id]);}
      await writeAudit(client,{actorUserId:actor.userId,storeId:current.store_id,vendorId:current.vendor_id,action:'product.update',entityType:'product',entityId:id,beforeData:current,afterData:{product:p.rows[0],listing:l.rows[0]},requestId:request.id}); return {...p.rows[0],listing:l.rows[0]};
    }); return {data};
  });

  app.patch('/products/:id/status', { preHandler: app.authenticate }, async (request) => {
    const id=z.uuid().parse((request.params as {id:string}).id); const input=productStatus.parse(request.body); const actor=actorOf(request); const current=await getScopedProduct(actor,id);
    const vendorCanSubmit=actor.permissions.has('catalog.update')&&input.status==='review'; const canPublish=actor.permissions.has('catalog.publish');
    if(!vendorCanSubmit&&!canPublish) throw badRequest('STATUS_FORBIDDEN','Bu status keçidi üçün icazə yoxdur');
    if(input.status==='published') { const check=await pool.query(`SELECT title,description,price,seo_title,seo_description FROM product_listings WHERE product_id=$1`,[id]); const l=check.rows[0]; if(!l?.title||!l.description||l.price==null||!l.seo_title||!l.seo_description) throw badRequest('PUBLISH_VALIDATION','Dərc üçün başlıq, təsvir, qiymət və SEO sahələri tamamlanmalıdır'); }
    const data=await withTransaction(async(client)=>{await client.query(`UPDATE products SET status=$2,reviewed_by=CASE WHEN $2 IN ('published','rejected') THEN $3 ELSE reviewed_by END,reviewed_at=CASE WHEN $2 IN ('published','rejected') THEN now() ELSE reviewed_at END WHERE id=$1`,[id,input.status,actor.userId]);const result=await client.query(`UPDATE product_listings SET status=$2,published_at=CASE WHEN $2='published' THEN coalesce(published_at,now()) ELSE published_at END WHERE product_id=$1 RETURNING *`,[id,input.status]);await client.query(`INSERT INTO audit_logs(actor_user_id,store_id,vendor_id,action,entity_type,entity_id,before_data,after_data,request_id) VALUES($1,$2,$3,'product.status.update','product',$4,$5,$6,$7)`,[actor.userId,current.store_id,current.vendor_id,id,JSON.stringify({status:current.status}),JSON.stringify({status:input.status,note:input.note}),request.id]);return result.rows[0];}); return {data};
  });

  app.delete('/products/:id', { preHandler: app.requirePermission('catalog.delete') }, async (request, reply) => {
    const id=z.uuid().parse((request.params as{id:string}).id);const actor=actorOf(request);const current=await getScopedProduct(actor,id);
    await withTransaction(async(client)=>{await client.query(`UPDATE products SET deleted_at=now(),status='archived' WHERE id=$1`,[id]);await client.query(`UPDATE product_listings SET status='archived' WHERE product_id=$1`,[id]);await writeAudit(client,{actorUserId:actor.userId,storeId:current.store_id,vendorId:current.vendor_id,action:'product.delete',entityType:'product',entityId:id,beforeData:current,requestId:request.id});});
    return reply.code(204).send();
  });

  app.post('/inventory/adjust', { preHandler: app.requirePermission('inventory.manage') }, async (request) => {
    const input=inventoryInput.parse(request.body); const actor=actorOf(request);
    const scope=await pool.query(`SELECT p.vendor_id,w.store_id,w.vendor_id AS warehouse_vendor_id FROM product_variants pv JOIN products p ON p.id=pv.product_id JOIN warehouses w ON w.id=$2 WHERE pv.id=$1`,[input.variantId,input.warehouseId]); const row=scope.rows[0]; if(!row||row.warehouse_vendor_id&&row.warehouse_vendor_id!==row.vendor_id) throw badRequest('INVENTORY_SCOPE_INVALID','Variant və anbar uyğun deyil'); if(actor.vendorIds.length)assertVendorScope(actor,row.vendor_id);else assertStoreScope(actor,row.store_id);
    const data=await withTransaction(async(client)=>{const locked=await client.query('SELECT quantity,reserved FROM inventory WHERE variant_id=$1 AND warehouse_id=$2 FOR UPDATE',[input.variantId,input.warehouseId]);const next=Number(locked.rows[0]?.quantity??0)+input.quantityDelta;if(next<Number(locked.rows[0]?.reserved??0))throw badRequest('INSUFFICIENT_STOCK','Yeni stok rezerv sayından az ola bilməz');const result=await client.query(`INSERT INTO inventory(variant_id,warehouse_id,quantity) VALUES($1,$2,$3) ON CONFLICT(variant_id,warehouse_id) DO UPDATE SET quantity=$3,updated_at=now() RETURNING *`,[input.variantId,input.warehouseId,next]);await client.query(`INSERT INTO inventory_movements(variant_id,warehouse_id,movement_type,quantity_delta,reference_type,reference_id,note,actor_user_id) VALUES($1,$2,'adjustment',$3,'manual',$4,$5,$6)`,[input.variantId,input.warehouseId,input.quantityDelta,input.referenceId??request.id,input.note,actor.userId]);return result.rows[0];}); return {data};
  });
}
