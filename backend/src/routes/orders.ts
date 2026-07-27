import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { pool, withTransaction } from '../db/pool.js';
import { actorOf, assertStoreScope, assertVendorScope } from '../core/scope.js';
import { badRequest, notFound } from '../core/errors.js';
import { paginationMeta, paginationSchema } from '../core/pagination.js';
import { writeAudit } from '../core/audit.js';

const statuses = ['pending','confirmed','processing','ready','shipped','delivered','cancelled','returned','refunded'] as const;
type OrderStatus = typeof statuses[number];
const transitions: Record<OrderStatus, readonly OrderStatus[]> = {
  pending:['confirmed','cancelled'], confirmed:['processing','cancelled'], processing:['ready','cancelled'],
  ready:['shipped','delivered','cancelled'], shipped:['delivered','returned'], delivered:['returned'],
  returned:['refunded'], cancelled:[], refunded:[]
};
const statusInput=z.object({status:z.enum(statuses),note:z.string().trim().max(1000).default(''),trackingNumber:z.string().trim().max(120).optional(),shippingProvider:z.string().trim().max(120).optional()});

export async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.get('/',{preHandler:app.requirePermission('orders.read')},async(request)=>{
    const query=paginationSchema.extend({storeId:z.uuid().optional(),vendorId:z.uuid().optional(),from:z.iso.datetime().optional(),to:z.iso.datetime().optional()}).parse(request.query);
    const actor=actorOf(request); const params:unknown[]=[]; const where=['1=1'];
    if(actor.vendorIds.length){params.push(actor.vendorIds);where.push(`vo.vendor_id=ANY($${params.length}::uuid[])`);}
    else if(!actor.isSuperAdmin){params.push(actor.storeIds);where.push(`o.store_id=ANY($${params.length}::uuid[])`);}
    if(query.storeId){assertStoreScope(actor,query.storeId);params.push(query.storeId);where.push(`o.store_id=$${params.length}`);}
    if(query.vendorId){if(actor.vendorIds.length)assertVendorScope(actor,query.vendorId);params.push(query.vendorId);where.push(`vo.vendor_id=$${params.length}`);}
    if(query.status){params.push(query.status);where.push(`${actor.vendorIds.length?'vo':'o'}.status::text=$${params.length}`);}
    if(query.search){params.push(`%${query.search}%`);where.push(`(o.order_number::text ILIKE $${params.length} OR o.customer_name ILIKE $${params.length} OR o.customer_email::text ILIKE $${params.length})`);}
    if(query.from){params.push(query.from);where.push(`o.placed_at >= $${params.length}`);} if(query.to){params.push(query.to);where.push(`o.placed_at <= $${params.length}`);}
    params.push(query.limit,(query.page-1)*query.limit);
    const result=await pool.query(`SELECT o.id,o.order_number,o.customer_name,o.customer_email,o.customer_phone,o.status,o.payment_status,o.currency,o.grand_total,o.placed_at,vo.id AS vendor_order_id,vo.vendor_id,vo.status AS vendor_status,vo.subtotal AS vendor_subtotal,v.display_name AS vendor_name,count(*) OVER()::int AS total_count FROM orders o JOIN vendor_orders vo ON vo.order_id=o.id JOIN vendors v ON v.id=vo.vendor_id WHERE ${where.join(' AND ')} ORDER BY o.placed_at DESC LIMIT $${params.length-1} OFFSET $${params.length}`,params);
    const total=Number(result.rows[0]?.total_count??0);return{data:result.rows.map(({total_count:_,...row})=>row),meta:paginationMeta(query.page,query.limit,total)};
  });

  app.get('/:id',{preHandler:app.requirePermission('orders.read')},async(request)=>{
    const id=z.uuid().parse((request.params as{id:string}).id);const actor=actorOf(request);
    const params:unknown[]=[id];let scope='';if(actor.vendorIds.length){params.push(actor.vendorIds);scope=`AND vo.vendor_id=ANY($2::uuid[])`;}else if(!actor.isSuperAdmin){params.push(actor.storeIds);scope=`AND o.store_id=ANY($2::uuid[])`;}
    const order=await pool.query(`SELECT o.*,jsonb_agg(DISTINCT jsonb_build_object('id',vo.id,'vendorId',vo.vendor_id,'vendorName',v.display_name,'status',vo.status,'subtotal',vo.subtotal,'discountTotal',vo.discount_total,'commissionTotal',vo.commission_total,'payoutTotal',vo.payout_total)) AS vendor_orders FROM orders o JOIN vendor_orders vo ON vo.order_id=o.id JOIN vendors v ON v.id=vo.vendor_id WHERE o.id=$1 ${scope} GROUP BY o.id`,params);if(!order.rows[0])throw notFound('Sifariş');
    const items=await pool.query(`SELECT oi.* FROM order_items oi JOIN vendor_orders vo ON vo.id=oi.vendor_order_id WHERE oi.order_id=$1 ${actor.vendorIds.length?'AND vo.vendor_id=ANY($2::uuid[])':''} ORDER BY oi.product_name`,actor.vendorIds.length?[id,actor.vendorIds]:[id]);
    const history=await pool.query(`SELECT h.*,concat(u.first_name,' ',u.last_name) AS actor_name FROM order_status_history h LEFT JOIN users u ON u.id=h.actor_user_id WHERE h.order_id=$1 ORDER BY h.created_at`,[id]);
    return{data:{...order.rows[0],items:items.rows,history:history.rows}};
  });

  app.patch('/:orderId/vendor-orders/:vendorOrderId/status',{preHandler:app.requirePermission('orders.manage')},async(request)=>{
    const ids=z.object({orderId:z.uuid(),vendorOrderId:z.uuid()}).parse(request.params);const input=statusInput.parse(request.body);const actor=actorOf(request);
    const current=await pool.query(`SELECT vo.*,o.store_id,o.status AS order_status FROM vendor_orders vo JOIN orders o ON o.id=vo.order_id WHERE vo.id=$1 AND vo.order_id=$2`,[ids.vendorOrderId,ids.orderId]);const row=current.rows[0];if(!row)throw notFound('Satıcı sifarişi');if(actor.vendorIds.length)assertVendorScope(actor,row.vendor_id);else assertStoreScope(actor,row.store_id);
    if(!transitions[row.status as OrderStatus].includes(input.status))throw badRequest('ORDER_TRANSITION_INVALID',`${row.status} statusundan ${input.status} statusuna keçid mümkün deyil`);
    const data=await withTransaction(async(client)=>{
      const updated=await client.query(`UPDATE vendor_orders SET status=$2,accepted_at=CASE WHEN $2='confirmed' THEN coalesce(accepted_at,now()) ELSE accepted_at END WHERE id=$1 RETURNING *`,[ids.vendorOrderId,input.status]);
      await client.query(`INSERT INTO order_status_history(order_id,vendor_order_id,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,$4,$5,$6)`,[ids.orderId,ids.vendorOrderId,row.status,input.status,input.note,actor.userId]);
      if(input.status==='shipped')await client.query(`INSERT INTO shipments(vendor_order_id,provider,tracking_number,status,shipped_at) VALUES($1,$2,$3,'shipped',now())`,[ids.vendorOrderId,input.shippingProvider??null,input.trackingNumber??null]);
      const aggregate=await client.query(`SELECT array_agg(status) AS statuses FROM vendor_orders WHERE order_id=$1`,[ids.orderId]);const all=aggregate.rows[0].statuses as OrderStatus[];let orderStatus:OrderStatus=row.order_status;
      if(all.every(s=>s==='delivered'))orderStatus='delivered';else if(all.every(s=>s==='cancelled'))orderStatus='cancelled';else if(all.some(s=>s==='shipped'||s==='delivered'))orderStatus='shipped';else if(all.some(s=>s==='processing'||s==='ready'))orderStatus='processing';else if(all.every(s=>s==='confirmed'))orderStatus='confirmed';
      if(orderStatus!==row.order_status){await client.query('UPDATE orders SET status=$2,cancelled_at=CASE WHEN $2=\'cancelled\' THEN now() ELSE cancelled_at END WHERE id=$1',[ids.orderId,orderStatus]);await client.query(`INSERT INTO order_status_history(order_id,from_status,to_status,note,actor_user_id) VALUES($1,$2,$3,'Vendor sifarişlərindən avtomatik hesablandı',$4)`,[ids.orderId,row.order_status,orderStatus,actor.userId]);}
      await writeAudit(client,{actorUserId:actor.userId,storeId:row.store_id,vendorId:row.vendor_id,action:'order.status.update',entityType:'vendor_order',entityId:ids.vendorOrderId,beforeData:{status:row.status},afterData:{status:input.status,note:input.note},requestId:request.id});return updated.rows[0];
    });return{data};
  });
}
