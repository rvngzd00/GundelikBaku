import { env } from '../config/env.js';
import { hashPassword } from '../core/password.js';
import { PERMISSIONS, ROLE_PERMISSIONS } from '../auth/permissions.js';
import { closePool, withTransaction } from './pool.js';

const demoCategories = [
  ['Elektrik alətləri', 'elektrik-aletleri', 'Peşəkar və məişət üçün elektrik alətləri'],
  ['Ölçü cihazları', 'olcu-cihazlari', 'Dəqiq ölçmə və nəzarət cihazları'],
  ['Bağ və emalatxana', 'bag-ve-emalatxana', 'Ev, bağ və emalatxana üçün avadanlıqlar'],
  ['Aksesuarlar', 'aksesuarlar', 'Alətlər üçün tamamlayıcı hissə və aksesuarlar'],
  ['Hədiyyələr', 'hediyyeler', 'Hədiyyə üçün seçilmiş promo məhsullar və xüsusi təkliflər']
] as const;

const demoProducts = [
  { sku: 'DB-MIL-001', title: 'Milwaukee M18 zərbəli drel dəsti', slug: 'milwaukee-m18-zerbeli-drel-desti', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'elektrik-aletleri', image: 'milwaukee-brand-product.webp', price: 549, compareAt: 629, stock: 18, short: 'Güclü mühərrik, iki akkumulyator və daşıma çantası ilə peşəkar dəst.' },
  { sku: 'DB-DEW-002', title: 'DeWalt XR simsiz vintaçan', slug: 'dewalt-xr-simsiz-vintacan', brand: 'DeWalt', brandSlug: 'dewalt', category: 'elektrik-aletleri', image: 'dewolt-brand-product-2.webp', price: 389, compareAt: 449, stock: 24, short: 'Kompakt gövdə, yüksək fırlanma anı və uzunmüddətli XR batareya.' },
  { sku: 'DB-MAK-003', title: 'Makita peşəkar bucaq cilalayıcı', slug: 'makita-pesekar-bucaq-cilalayici', brand: 'Makita', brandSlug: 'makita', category: 'elektrik-aletleri', image: 'makitta-brand-product.webp', price: 279, compareAt: 319, stock: 15, short: 'Metal və daş səthlər üçün təhlükəsiz, balanslı və məhsuldar cilalayıcı.' },
  { sku: 'DB-BOS-004', title: 'Bosch Professional alət dəsti', slug: 'bosch-professional-alet-desti', brand: 'Bosch', brandSlug: 'bosch', category: 'elektrik-aletleri', image: 'bosch-brand-product-2.webp', price: 699, compareAt: 789, stock: 9, short: 'Gündəlik peşəkar işlər üçün seçilmiş alətlərdən ibarət universal dəst.' },
  { sku: 'DB-FES-005', title: 'Festool dəqiq kəsim mişarı', slug: 'festool-deqiq-kesim-misari', brand: 'Festool', brandSlug: 'festool', category: 'bag-ve-emalatxana', image: 'festool-brand-product.webp', price: 1199, compareAt: 1349, stock: 6, short: 'Təmiz və dəqiq kəsim üçün bələdçi relsli premium emalatxana mişarı.' },
  { sku: 'DB-MET-006', title: 'Metabo universal emalatxana dəsti', slug: 'metabo-universal-emalatxana-desti', brand: 'Metabo', brandSlug: 'metabo', category: 'bag-ve-emalatxana', image: 'melabo-brand-product.webp', price: 459, compareAt: 519, stock: 12, short: 'Təmir və montaj işləri üçün dayanıqlı, rahat və funksional alət seçimi.' },
  { sku: 'DB-JET-007', title: 'JET masaüstü ağac dəzgahı', slug: 'jet-masaustu-agac-dezgahi', brand: 'JET', brandSlug: 'jet', category: 'bag-ve-emalatxana', image: 'jet-brand-product.webp', price: 949, compareAt: 1099, stock: 5, short: 'Kiçik emalatxanalar üçün stabil konstruksiyalı dəqiq ağac emalı dəzgahı.' },
  { sku: 'DB-MAX-008', title: 'MAX pnevmatik mismar tapançası', slug: 'max-pnevmatik-mismar-tapancasi', brand: 'MAX', brandSlug: 'max', category: 'elektrik-aletleri', image: 'max-brand-product.webp', price: 429, compareAt: 479, stock: 11, short: 'Sürətli montaj, erqonomik tutuş və ardıcıl işləmə üçün peşəkar model.' },
  { sku: 'DB-MIL-009', title: 'Milwaukee yüksək torklu zərbəli açar', slug: 'milwaukee-yuksek-torklu-zerbeli-acar', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'elektrik-aletleri', image: 'impact-wrenches.webp', price: 619, compareAt: 699, stock: 14, short: 'Avtomobil və ağır montaj işləri üçün yüksək tork və ağıllı idarəetmə.' },
  { sku: 'DB-BOS-010', title: 'Bosch yaşıl lazer səviyyəölçən', slug: 'bosch-yasil-lazer-seviyyeolcen', brand: 'Bosch', brandSlug: 'bosch', category: 'olcu-cihazlari', image: 'laser-levels.webp', price: 239, compareAt: 279, stock: 21, short: 'Parlaq yaşıl şüa, avtomatik nivelirləmə və rahat tripod bağlantısı.' },
  { sku: 'DB-MAK-011', title: 'Makita akkumulyatorlu dairəvi mişar', slug: 'makita-akkumulyatorlu-dairevi-misar', brand: 'Makita', brandSlug: 'makita', category: 'bag-ve-emalatxana', image: 'saws.webp', price: 489, compareAt: 559, stock: 10, short: 'Kabelsiz işləmə rahatlığı və müxtəlif materiallarda təmiz kəsim.' },
  { sku: 'DB-DEW-012', title: 'DeWalt orbital zımpara cihazı', slug: 'dewalt-orbital-zimpara-cihazi', brand: 'DeWalt', brandSlug: 'dewalt', category: 'aksesuarlar', image: 'sanders.webp', price: 219, compareAt: 259, stock: 19, short: 'Aşağı vibrasiya və effektiv toz toplama ilə hamar səth nəticəsi.' },
  { sku: 'DB-KLE-013', title: 'Klein Tools elektrikçi alət dəsti', slug: 'klein-tools-elektrikci-alet-desti', brand: 'Klein Tools', brandSlug: 'klein-tools', category: 'aksesuarlar', image: 'hand-tools.webp', price: 329, compareAt: 379, stock: 13, short: 'Elektrik montajı üçün təhlükəsiz və rahat əsas əl alətləri dəsti.' },
  { sku: 'DB-STA-014', title: 'Stabila maqnitli su tərəzisi', slug: 'stabila-maqnitli-su-terezisi', brand: 'Stabila', brandSlug: 'stabila', category: 'olcu-cihazlari', image: 'levels.webp', price: 149, compareAt: 179, stock: 22, short: 'Güclü maqnit, aydın göstərici və dayanıqlı gövdə ilə dəqiq ölçmə.' },
  { sku: 'DB-RIK-015', title: 'RIKON dəzgahüstü qazma dəzgahı', slug: 'rikon-dezgahustu-qazma-dezgahi', brand: 'RIKON', brandSlug: 'rikon', category: 'bag-ve-emalatxana', image: 'drills.webp', price: 799, compareAt: 899, stock: 7, short: 'Emalatxanada sabit, təhlükəsiz və dəqiq qazma əməliyyatları üçün dəzgah.' },
  { sku: 'DB-ROL-016', title: 'Rolair səssiz hava kompressoru', slug: 'rolair-sessiz-hava-kompressoru', brand: 'Rolair', brandSlug: 'rolair', category: 'bag-ve-emalatxana', image: 'air-compressors.webp', price: 729, compareAt: 829, stock: 8, short: 'Aşağı səs səviyyəsi və stabil hava təzyiqi ilə emalatxana kompressoru.' },
  { sku: 'DB-TOU-017', title: 'ToughBuilt modul alət çantası', slug: 'toughbuilt-modul-alet-cantasi', brand: 'ToughBuilt', brandSlug: 'toughbuilt', category: 'aksesuarlar', image: 'Tool-Accessories-1.webp', price: 189, compareAt: 229, stock: 27, short: 'Modul bölmələr və möhkəm material ilə alətlərin rahat daşınması.' },
  { sku: 'DB-TRI-018', title: 'Triton dəqiq frez aləti', slug: 'triton-deqiq-frez-aleti', brand: 'Triton', brandSlug: 'triton', category: 'bag-ve-emalatxana', image: 'power-tools.webp', price: 579, compareAt: 649, stock: 9, short: 'Ağac emalında nəzarətli sürət və dəqiq frezləmə üçün peşəkar alət.' },
  { sku: 'DB-STN-019', title: 'Stanley çəkic və toxmaq dəsti', slug: 'stanley-cekic-ve-toxmaq-desti', brand: 'Stanley', brandSlug: 'stanley', category: 'aksesuarlar', image: 'hammers-mallets.webp', price: 119, compareAt: 149, stock: 31, short: 'Təmir və montaj işləri üçün balanslı, möhkəm çəkic və toxmaq seçimi.' },
  { sku: 'DB-MIL-020', title: 'Milwaukee Shockwave burğu dəsti', slug: 'milwaukee-shockwave-burgu-desti', brand: 'Milwaukee', brandSlug: 'milwaukee', category: 'aksesuarlar', image: 'drill-bits.webp', price: 169, compareAt: 199, stock: 25, short: 'Zərbəli alətlər üçün uzunömürlü və çoxölçülü peşəkar burğu dəsti.' }
] as const;

async function seed(): Promise<void> {
  const passwordHash = await hashPassword(env.BOOTSTRAP_ADMIN_PASSWORD);

  await withTransaction(async (client) => {
    const storeResult = await client.query<{ id: string }>(`
      INSERT INTO stores (code, name, primary_domain)
      VALUES ($1, 'Gündəlik Bakı', 'dailybaku.az')
      ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [env.DEFAULT_STORE_CODE]);
    const storeId = storeResult.rows[0]!.id;

    for (const permission of PERMISSIONS) {
      await client.query(`
        INSERT INTO permissions (code, description)
        VALUES ($1, $2)
        ON CONFLICT (code) DO NOTHING
      `, [permission, permission]);
    }

    for (const [roleCode, permissions] of Object.entries(ROLE_PERMISSIONS)) {
      const roleResult = await client.query<{ id: string }>(`
        INSERT INTO roles (code, name, description)
        VALUES ($1, $2, $3)
        ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name
        RETURNING id
      `, [roleCode, roleCode.replaceAll('_', ' '), `${roleCode} system role`]);
      const roleId = roleResult.rows[0]!.id;

      for (const permission of permissions) {
        await client.query(`
          INSERT INTO role_permissions (role_id, permission_id)
          SELECT $1, id FROM permissions WHERE code = $2
          ON CONFLICT DO NOTHING
        `, [roleId, permission]);
      }
    }

    const userResult = await client.query<{ id: string }>(`
      INSERT INTO users (email, password_hash, first_name, last_name, email_verified_at)
      VALUES ($1, $2, 'Super', 'Admin', now())
      ON CONFLICT (email) DO UPDATE
        SET password_hash = CASE
          WHEN users.last_login_at IS NULL THEN EXCLUDED.password_hash
          ELSE users.password_hash
        END
      RETURNING id
    `, [env.BOOTSTRAP_ADMIN_EMAIL, passwordHash]);

    await client.query(`
      INSERT INTO user_roles (user_id, role_id, store_id)
      SELECT $1, id, $2 FROM roles WHERE code = 'super_admin'
      ON CONFLICT DO NOTHING
    `, [userResult.rows[0]!.id, storeId]);

    const menuResult = await client.query<{ id: string }>(`
      INSERT INTO navigation_menus (store_id, code, name)
      VALUES ($1, 'main', 'Əsas menyu')
      ON CONFLICT (store_id, code, locale) DO UPDATE SET name = EXCLUDED.name
      RETURNING id
    `, [storeId]);
    const menuId = menuResult.rows[0]!.id;

    const topItems = [
      ['Mağaza', '/magaza/'], ['Endirimlər', '/endirimler/'], ['Kuponlar', '/kuponlar/'],
      ['Kampaniyalar', '/kampaniyalar/'], ['Jurnal və Blog', '/jurnal/'],
      ['Bakı Club', '/baki-club/'], ['Elanlar', '/elanlar/'], ['Biznes üçün', '/biznes/']
    ];
    for (const [position, item] of topItems.entries()) {
      await client.query(`
        UPDATE navigation_items
        SET label=$2, position=$4, is_visible=true
        WHERE menu_id=$1 AND parent_id IS NULL AND url=$3;
        INSERT INTO navigation_items (menu_id, label, url, position)
        SELECT $1, $2, $3, $4
        WHERE NOT EXISTS (
          SELECT 1 FROM navigation_items WHERE menu_id = $1 AND parent_id IS NULL AND url = $3
        )
      `, [menuId, item![0], item![1], position]);
    }

    const categoryIds = new Map<string, string>();
    for (const [position, [name, slug, description]] of demoCategories.entries()) {
      const result = await client.query<{ id: string }>(`
        INSERT INTO categories (store_id, name, slug, description, position, status, seo_title, seo_description)
        VALUES ($1, $2, $3, $4, $5, 'active', $6, $7)
        ON CONFLICT (store_id, slug) DO UPDATE
          SET name=EXCLUDED.name, description=EXCLUDED.description, position=EXCLUDED.position, status='active'
        RETURNING id
      `, [storeId, name, slug, description, position, `${name} | Gündəlik Bakı`, `${description}. Gündəlik Bakıda sərfəli seçimləri kəşf edin.`]);
      categoryIds.set(slug, result.rows[0]!.id);
    }

    const vendorResult = await client.query<{ id: string }>(`
      INSERT INTO vendors (store_id, display_name, legal_name, slug, email, phone, description, commission_rate, status, approved_at)
      VALUES ($1, 'Baku Pro Market', 'Baku Pro Market MMC', 'baku-pro-market', 'satis@bakupromarket.az', '+994 50 264 54 00',
        'Gündəlik Bakı demo kataloqu üçün təsdiqlənmiş peşəkar alət satıcısı.', 12, 'active', now())
      ON CONFLICT (store_id, slug) DO UPDATE SET
        display_name=EXCLUDED.display_name, legal_name=EXCLUDED.legal_name, description=EXCLUDED.description,
        commission_rate=EXCLUDED.commission_rate, status='active', approved_at=coalesce(vendors.approved_at, now())
      RETURNING id
    `, [storeId]);
    const vendorId = vendorResult.rows[0]!.id;

    const warehouseResult = await client.query<{ id: string }>(`
      INSERT INTO warehouses (store_id, vendor_id, name, code, address, status)
      VALUES ($1, NULL, 'Bakı əsas anbarı', 'DEMO-BAKU-01', $2, 'active')
      ON CONFLICT (store_id, code) DO UPDATE SET vendor_id=NULL, name=EXCLUDED.name, status='active'
      RETURNING id
    `, [storeId, JSON.stringify({ city: 'Bakı', district: 'Nərimanov', address: 'Ağa Neymətulla küçəsi 24' })]);
    const warehouseId = warehouseResult.rows[0]!.id;

    const brandIds = new Map<string, string>();
    const seededProducts: Array<{ productId: string; variantId: string; title: string; sku: string; price: number }> = [];
    for (const [productIndex, item] of demoProducts.entries()) {
      let brandId = brandIds.get(item.brandSlug);
      if (!brandId) {
        const brandResult = await client.query<{ id: string }>(`
          INSERT INTO brands (store_id, name, slug, description, status, seo_title, seo_description)
          VALUES ($1, $2, $3, $4, 'active', $5, $6)
          ON CONFLICT (store_id, slug) DO UPDATE SET name=EXCLUDED.name, status='active'
          RETURNING id
        `, [storeId, item.brand, item.brandSlug, `${item.brand} məhsullarının rəsmi demo vitrini.`, `${item.brand} məhsulları | Gündəlik Bakı`, `${item.brand} alətləri, qiymətlər və kampaniyalar.`]);
        brandId = brandResult.rows[0]!.id;
        brandIds.set(item.brandSlug, brandId);
      }

      const mediaResult = await client.query<{ id: string }>(`
        INSERT INTO media_assets (store_id, vendor_id, uploaded_by, storage_key, public_url, mime_type, byte_size, alt_text, title, metadata)
        VALUES ($1, $2, $3, $4, $5, 'image/webp', 1, $6, $7, $8)
        ON CONFLICT (storage_key) DO UPDATE SET public_url=EXCLUDED.public_url, alt_text=EXCLUDED.alt_text, title=EXCLUDED.title
        RETURNING id
      `, [storeId, vendorId, userResult.rows[0]!.id, `demo/products/${item.image}`, `/assets/wp-content/uploads/${item.image}`, `${item.title} — məhsul şəkli`, item.title, JSON.stringify({ demo: true, source: 'theme-export' })]);

      const productResult = await client.query<{ id: string }>(`
        INSERT INTO products (vendor_id, brand_id, sku, name, description, product_type, status, attributes, created_by, reviewed_by, reviewed_at)
        VALUES ($1, $2, $3, $4, $5, 'physical', 'published', $6, $7, $7, now())
        ON CONFLICT (vendor_id, sku) DO UPDATE SET
          brand_id=EXCLUDED.brand_id, name=EXCLUDED.name, description=EXCLUDED.description,
          status='published', attributes=EXCLUDED.attributes, deleted_at=NULL
        RETURNING id
      `, [vendorId, brandId, item.sku, item.title, item.short, JSON.stringify({ zəmanət: '12 ay', çatdırılma: 'Bakı daxili 1 gün', demo: true }), userResult.rows[0]!.id]);
      const productId = productResult.rows[0]!.id;

      await client.query(`
        INSERT INTO product_listings (store_id, product_id, locale, title, slug, short_description, description, price,
          compare_at_price, currency, status, seo_title, seo_description, canonical_url, schema_data, published_at,
          is_featured, is_popular, is_top_pick, display_position, merchandising_badge)
        VALUES ($1, $2, 'az-AZ', $3, $4, $5, $6, $7, $8, 'AZN', 'published', $9, $10, $11, $12, now(), true, true, true, $13, $14)
        ON CONFLICT (store_id, product_id, locale) DO UPDATE SET
          title=EXCLUDED.title, slug=EXCLUDED.slug, short_description=EXCLUDED.short_description,
          description=EXCLUDED.description, price=EXCLUDED.price, compare_at_price=EXCLUDED.compare_at_price,
          status='published', seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description,
          canonical_url=EXCLUDED.canonical_url, schema_data=EXCLUDED.schema_data, published_at=coalesce(product_listings.published_at, now()),
          is_featured=true,is_popular=true,is_top_pick=true,display_position=EXCLUDED.display_position,merchandising_badge=EXCLUDED.merchandising_badge
      `, [storeId, productId, item.title, item.slug, item.short, `${item.short} Məhsul stokdadır, təhlükəsiz sifariş və sürətli çatdırılma mümkündür.`, item.price, item.compareAt, `${item.title} — qiymət və sifariş`, `${item.title}. Xüsusiyyətləri, aktual qiyməti və Gündəlik Bakı kampaniyasını yoxlayın.`, `/mehsul/${item.slug}/`, JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: item.title, sku: item.sku, offers: { '@type': 'Offer', price: item.price, priceCurrency: 'AZN', availability: 'https://schema.org/InStock' } }),productIndex,productIndex===3||productIndex===13?'hot':productIndex===7||productIndex===17?'new':[0,6,10,15].includes(productIndex)?'recommended':[1,8].includes(productIndex)?'sale':'none']);

      await client.query(`
        INSERT INTO product_categories (product_id, category_id, is_primary)
        VALUES ($1, $2, true)
        ON CONFLICT (product_id, category_id) DO UPDATE SET is_primary=true
      `, [productId, categoryIds.get(item.category)]);
      if ([0, 1, 3, 6, 7, 8, 10, 13, 15, 17].includes(productIndex)) {
        await client.query(`
          INSERT INTO product_categories (product_id, category_id, is_primary)
          VALUES ($1, $2, false)
          ON CONFLICT (product_id, category_id) DO NOTHING
        `, [productId, categoryIds.get('hediyyeler')]);
      }
      await client.query(`
        INSERT INTO product_media (product_id, media_asset_id, position, is_primary)
        VALUES ($1, $2, 0, true)
        ON CONFLICT (product_id, media_asset_id) DO UPDATE SET position=0, is_primary=true
      `, [productId, mediaResult.rows[0]!.id]);
      const variantResult = await client.query<{ id: string }>(`
        INSERT INTO product_variants (product_id, sku, title, option_values, status)
        VALUES ($1, $2, 'Standart', '{}', 'active')
        ON CONFLICT (product_id, sku) DO UPDATE SET title='Standart', status='active'
        RETURNING id
      `, [productId, item.sku]);
      await client.query(`
        INSERT INTO inventory (variant_id, warehouse_id, quantity, reserved, reorder_level)
        VALUES ($1, $2, $3, 0, 5)
        ON CONFLICT (variant_id, warehouse_id) DO UPDATE SET quantity=EXCLUDED.quantity, reorder_level=EXCLUDED.reorder_level
      `, [variantResult.rows[0]!.id, warehouseId, item.stock]);
      seededProducts.push({ productId, variantId: variantResult.rows[0]!.id, title: item.title, sku: item.sku, price: item.price });
    }

    const campaignResult = await client.query<{ id: string }>(`
      INSERT INTO campaigns (store_id, vendor_id, name, slug, description, campaign_type, status, starts_at, ends_at, budget, goals, targeting, created_by)
      VALUES ($1, $2, 'Yay Super Endirimləri', 'yay-super-endirimleri', 'Seçilmiş məhsullarda 20%-dək demo kampaniyası.',
        'seasonal', 'active', now() - interval '7 days', now() + interval '90 days', 5000, $3, $4, $5)
      ON CONFLICT (store_id, slug) DO UPDATE SET status='active', starts_at=EXCLUDED.starts_at, ends_at=EXCLUDED.ends_at,
        description=EXCLUDED.description, vendor_id=EXCLUDED.vendor_id
      RETURNING id
    `, [storeId, vendorId, JSON.stringify({ conversions: 250, revenue: 25000 }), JSON.stringify({ city: 'Bakı', audience: 'home-improvement' }), userResult.rows[0]!.id]);

    await client.query(`
      INSERT INTO coupons (store_id, vendor_id, campaign_id, name, code_prefix, discount_type, discount_value,
        minimum_order, quantity_limit, per_user_limit, starts_at, expires_at, status, rules)
      SELECT $1, $2, $3, 'İlk sifarişə 10% endirim', 'BAKU10', 'percentage', 10, 100, 500, 1,
        now() - interval '1 day', now() + interval '90 days', 'active', $4
      WHERE NOT EXISTS (SELECT 1 FROM coupons WHERE store_id=$1 AND name='İlk sifarişə 10% endirim')
    `, [storeId, vendorId, campaignResult.rows[0]!.id, JSON.stringify({ firstOrderOnly: true })]);

    await client.query(`
      INSERT INTO qr_codes (store_id, vendor_id, campaign_id, code, name, qr_type, target_url, per_user_limit,
        scan_count, starts_at, expires_at, status, rules, created_by)
      VALUES ($1, $2, $3, 'DB-DEMO-CLUB', 'Gündəlik Bakı Club demo QR', 'store', $4, 3, 126,
        now() - interval '7 days', now() + interval '90 days', 'active', '{}', $5)
      ON CONFLICT (code) DO UPDATE SET status='active', expires_at=EXCLUDED.expires_at, target_url=EXCLUDED.target_url
    `, [storeId, vendorId, campaignResult.rows[0]!.id, `${env.PUBLIC_ORIGIN}/baki-club/`, userResult.rows[0]!.id]);

    const demoOrders = [
      ['demo-order-001', 'Aysel Məmmədova', 'aysel@example.az', '+994 50 264 54 00', 'pending', 0],
      ['demo-order-002', 'Murad Əliyev', 'murad@example.az', '+994 50 264 54 00', 'processing', 2],
      ['demo-order-003', 'Nigar Həsənli', 'nigar@example.az', '+994 50 264 54 00', 'delivered', 6]
    ] as const;
    for (const [index, [idempotencyKey, customerName, email, phone, status, daysAgo]] of demoOrders.entries()) {
      const product = seededProducts[index]!;
      const orderResult = await client.query<{ id: string }>(`
        INSERT INTO orders (store_id, customer_email, customer_phone, customer_name, status, payment_status, currency,
          subtotal, discount_total, shipping_total, tax_total, grand_total, shipping_address, billing_address,
          customer_note, idempotency_key, placed_at)
        VALUES ($1, $2, $3, $4, $5::order_status, $6::payment_status, 'AZN', $7, 0, 0, 0, $7, $8, $8,
          'Demo sifariş — müştəri təqdimatı üçün', $9, now() - ($10 * interval '1 day'))
        ON CONFLICT (store_id, idempotency_key) DO UPDATE SET status=EXCLUDED.status, payment_status=EXCLUDED.payment_status
        RETURNING id
      `, [storeId, email, phone, customerName, status, status === 'pending' ? 'pending' : 'paid', product.price, JSON.stringify({ city: 'Bakı', district: 'Nərimanov', addressLine1: 'Demo ünvan 12' }), idempotencyKey, daysAgo]);
      const orderId = orderResult.rows[0]!.id;
      const vendorOrderResult = await client.query<{ id: string }>(`
        INSERT INTO vendor_orders (order_id, vendor_id, status, subtotal, commission_total, payout_total)
        VALUES ($1, $2, $3::order_status, $4, $5, $6)
        ON CONFLICT (order_id, vendor_id) DO UPDATE SET status=EXCLUDED.status, subtotal=EXCLUDED.subtotal,
          commission_total=EXCLUDED.commission_total, payout_total=EXCLUDED.payout_total
        RETURNING id
      `, [orderId, vendorId, status, product.price, product.price * 0.12, product.price * 0.88]);
      await client.query('DELETE FROM order_items WHERE order_id=$1', [orderId]);
      await client.query(`
        INSERT INTO order_items (order_id, vendor_order_id, vendor_id, product_id, variant_id, product_name, sku,
          quantity, unit_price, discount_total, line_total, snapshot)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 1, $8, 0, $8, $9)
      `, [orderId, vendorOrderResult.rows[0]!.id, vendorId, product.productId, product.variantId, product.title, product.sku, product.price, JSON.stringify({ demo: true, title: product.title })]);
    }

    const postCategoryResult = await client.query<{ id: string }>(`
      INSERT INTO post_categories (store_id, name, slug, description, seo_title, seo_description)
      VALUES ($1, 'Alış-veriş bələdçisi', 'alis-veris-beledcisi', 'Məhsul seçimi və sərfəli alış-veriş üçün faydalı bələdçilər.',
        'Alış-veriş bələdçisi | Gündəlik Bakı', 'Məhsul seçimi, endirim və kampaniyalardan düzgün istifadə üçün məsləhətlər.')
      ON CONFLICT (store_id, slug) DO UPDATE SET name=EXCLUDED.name, description=EXCLUDED.description
      RETURNING id
    `, [storeId]);
    const postCategoryId = postCategoryResult.rows[0]!.id;

    const demoPosts = [
      {
        type: 'guide',
        title: '2026-cı ildə düzgün elektrik aləti necə seçilməlidir?',
        slug: 'duzgun-elektrik-aleti-nece-secilmelidir',
        excerpt: 'Güc, batareya, zəmanət və istifadə məqsədinə görə düzgün alət seçmək üçün praktiki bələdçi.',
        keyword: 'elektrik aləti seçimi',
        blocks: [
          { type: 'heading', data: { text: 'İstifadə məqsədini müəyyənləşdirin' } },
          { type: 'paragraph', data: { text: 'Ev təmiri, emalatxana və peşəkar tikinti işləri fərqli güc və davamlılıq tələb edir. Məhsulu yalnız qiymətə görə deyil, iş yükünə görə seçin.' } },
          { type: 'heading', data: { text: 'Batareya ekosisteminə diqqət edin' } },
          { type: 'paragraph', data: { text: 'Eyni markanın uyğun batareyalarından istifadə edən alətlər uzun müddətdə xərci azaldır və işi sürətləndirir.' } }
        ]
      },
      {
        type: 'guide',
        title: 'Endirim kampaniyasında ağıllı alış-verişin 7 qaydası',
        slug: 'endirim-kampaniyasinda-agilli-alis-veris',
        excerpt: 'Real endirimi müəyyənləşdirmək, kuponlardan istifadə etmək və büdcəni qorumaq üçün yeddi sadə qayda.',
        keyword: 'endirim kampaniyaları',
        blocks: [
          { type: 'heading', data: { text: 'Qiymət tarixçəsini müqayisə edin' } },
          { type: 'paragraph', data: { text: 'Kampaniya etiketindən əvvəl məhsulun əvvəlki və cari qiymətini, çatdırılma xərcini və zəmanət şərtlərini birlikdə yoxlayın.' } },
          { type: 'heading', data: { text: 'Kupon şərtlərini oxuyun' } },
          { type: 'paragraph', data: { text: 'Minimum sifariş məbləği, istifadə müddəti və satıcı məhdudiyyəti kuponun real faydasını müəyyən edir.' } }
        ]
      },
      {
        type: 'brand_story',
        title: 'Baku Pro Market: yerli satıcının rəqəmsal inkişaf hekayəsi',
        slug: 'baku-pro-market-reqemsal-inkisaf-hekayesi',
        excerpt: 'Yerli satış təcrübəsinin məhsul kataloqu, kampaniya və ölçülə bilən rəqəmsal kanallarla inkişaf hekayəsi.',
        keyword: 'yerli brend hekayəsi',
        blocks: [
          { type: 'heading', data: { text: 'Fiziki vitrindən rəqəmsal kataloqa' } },
          { type: 'paragraph', data: { text: 'Baku Pro Market məhsul məlumatlarını, stok və qiymətləri vahid CMS daxilində idarə edərək müştəriyə daha sürətli xidmət göstərməyə başladı.' } },
          { type: 'heading', data: { text: 'Ölçülə bilən kampaniyalar' } },
          { type: 'paragraph', data: { text: 'Gündəlik Bakı kampaniya və QR analitikası hansı təkliflərin real satış yaratdığını izləməyə imkan verdi.' } }
        ]
      },
      {
        type: 'guide',
        title: 'Yay fürsətlərini qaçırmamaq üçün praktik alış-veriş planı',
        slug: 'yay-fursetleri-alis-veris-plani',
        excerpt: 'Mövsümi təklifləri düzgün vaxtda müqayisə etmək və büdcəni qorumaq üçün sadə plan.',
        keyword: 'yay fürsətləri',
        blocks: [
          { type: 'heading', data: { text: 'Prioritet siyahısı hazırlayın' } },
          { type: 'paragraph', data: { text: 'Ehtiyacları əvvəlcədən sıralamaq kampaniya zamanı impulsiv xərclərin qarşısını alır və həqiqi endirimləri seçməyi asanlaşdırır.' } }
        ]
      },
      {
        type: 'news',
        title: 'Gündəlik Bakı jurnalının yeni rəqəmsal buraxılışı yayımlandı',
        slug: 'daily-baku-yeni-reqemsal-buraxilis',
        excerpt: 'Şəhər, alış-veriş və yerli brend hekayələri yeni rəqəmsal buraxılışda bir araya gəldi.',
        keyword: 'Gündəlik Bakı jurnalı',
        blocks: [
          { type: 'heading', data: { text: 'Yeni buraxılış artıq onlayndır' } },
          { type: 'paragraph', data: { text: 'Oxucular aktual şəhər yeniliklərini, alış-veriş bələdçilərini və yerli biznes hekayələrini vahid buraxılışda izləyə bilərlər.' } }
        ]
      },
      {
        type: 'brand_story',
        title: 'Yerli brendlər rəqəmsal vitrində necə fərqlənə bilər?',
        slug: 'yerli-brendler-reqemsal-vitrin',
        excerpt: 'Düzgün məhsul məlumatı, vizual dil və ölçülə bilən kampaniya ilə rəqəmsal vitrində fərqlənməyin yolları.',
        keyword: 'yerli brendlər',
        blocks: [
          { type: 'heading', data: { text: 'Etibar yaradan məhsul təqdimatı' } },
          { type: 'paragraph', data: { text: 'Aydın foto, düzgün xüsusiyyətlər və real stok məlumatı yerli brendin müştəri qarşısında etibarını artırır.' } }
        ]
      },
      {
        type: 'news',
        title: 'Bakı Club üzvləri üçün yeni hədiyyə imkanları',
        slug: 'baki-club-yeni-hediyyeler',
        excerpt: 'Bakı Club üzvləri yeni kampaniyalarda xal toplayaraq seçilmiş hədiyyələr əldə edə bilərlər.',
        keyword: 'Bakı Club hədiyyələri',
        blocks: [
          { type: 'heading', data: { text: 'Xalları hədiyyəyə çevirin' } },
          { type: 'paragraph', data: { text: 'Aktiv kampaniyalar və QR imkanları üzvlərə gündəlik alış-verişdən əlavə fayda qazanmağa kömək edir.' } }
        ]
      },
      {
        type: 'article',
        title: 'Ayın ən çox oxunan alış-veriş və şəhər hekayələri',
        slug: 'ayin-en-cox-oxunan-hekayeleri',
        excerpt: 'Ay ərzində oxucuların ən çox maraq göstərdiyi bələdçi, kampaniya və şəhər hekayələrinin xülasəsi.',
        keyword: 'ayın ən çox oxunanları',
        blocks: [
          { type: 'heading', data: { text: 'Oxucuların seçimi' } },
          { type: 'paragraph', data: { text: 'Praktik alış-veriş məsləhətləri, yerli brend təcrübələri və yeni kampaniyalar bu ayın ən çox oxunan mövzuları oldu.' } }
        ]
      }
    ] as const;
    const postImageUrls: Record<string,string> = {
      'duzgun-elektrik-aleti-nece-secilmelidir':'/assets/images/categories/jurnal/alis-veris-meslehetleri.jpg',
      'endirim-kampaniyasinda-agilli-alis-veris':'/assets/images/categories/kampaniyalar/movsumi-endirimler.jpg',
      'baku-pro-market-reqemsal-inkisaf-hekayesi':'/assets/images/categories/jurnal/brend-hekayeleri.jpg',
      'yay-fursetleri-alis-veris-plani':'/assets/images/categories/endirimler.jpg',
      'daily-baku-yeni-reqemsal-buraxilis':'/assets/images/categories/jurnal/son-buraxilis.jpg',
      'yerli-brendler-reqemsal-vitrin':'/assets/images/categories/biznes/brend-vitrini.jpg',
      'baki-club-yeni-hediyyeler':'/assets/images/categories/baki-club/giveawayler.jpg',
      'ayin-en-cox-oxunan-hekayeleri':'/assets/images/categories/jurnal/arxiv.jpg'
    };
    const seededPostIds: string[] = [];
    for (const post of demoPosts) {
      const postMedia=await client.query<{id:string}>(`
        INSERT INTO media_assets(store_id,uploaded_by,storage_key,public_url,mime_type,byte_size,alt_text,title,metadata)
        VALUES($1,$2,$3,$4,'image/jpeg',1,$5,$6,$7)
        ON CONFLICT(storage_key) DO UPDATE SET public_url=EXCLUDED.public_url,alt_text=EXCLUDED.alt_text,title=EXCLUDED.title
        RETURNING id
      `,[storeId,userResult.rows[0]!.id,`seed/posts/${post.slug}.jpg`,postImageUrls[post.slug],`${post.title} — Gündəlik Bakı yeniliyi`,post.title,JSON.stringify({seeded:true,source:'theme-export'})]);
      const result = await client.query<{ id: string }>(`
        INSERT INTO posts (store_id, category_id, featured_asset_id, locale, post_type, title, slug, excerpt, content, status,
          seo_title, seo_description, robots_directive, schema_data, author_id, reviewed_by, published_at)
        VALUES ($1, $2, $3, 'az-AZ', $4, $5, $6, $7, $8, 'published', $9, $10, 'index,follow', $11, $12, $12, now())
        ON CONFLICT (store_id, locale, slug) DO UPDATE SET title=EXCLUDED.title, excerpt=EXCLUDED.excerpt,
          content=EXCLUDED.content, status='published', seo_title=EXCLUDED.seo_title,
          seo_description=EXCLUDED.seo_description, featured_asset_id=coalesce(posts.featured_asset_id,EXCLUDED.featured_asset_id),deleted_at=NULL, published_at=coalesce(posts.published_at,now())
        RETURNING id
      `, [storeId, postCategoryId,postMedia.rows[0]!.id, post.type, post.title, post.slug, post.excerpt, JSON.stringify(post.blocks), `${post.title} | Gündəlik Bakı`, `${post.excerpt} Gündəlik Bakı jurnalında ətraflı oxuyun.`, JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: post.title, keywords: post.keyword }), userResult.rows[0]!.id]);
      seededPostIds.push(result.rows[0]!.id);
    }

    const aboutPageResult = await client.query<{ id: string }>(`
      INSERT INTO pages (store_id, locale, title, slug, excerpt, content, template, status, seo_title,
        seo_description, robots_directive, schema_data, author_id, reviewed_by, published_at)
      VALUES ($1, 'az-AZ', 'Gündəlik Bakı haqqında', 'haqqimizda', 'Gündəlik Bakı şəhərin rəqəmsal fürsətlər platformasıdır.', $2,
        'about', 'published', 'Gündəlik Bakı haqqında', 'Gündəlik Bakı missiyası, platformanın imkanları və şəhər ekosistemi.',
        'index,follow', $3, $4, $4, now())
      ON CONFLICT (store_id, locale, slug) DO UPDATE SET content=EXCLUDED.content, status='published',
        seo_title=EXCLUDED.seo_title, seo_description=EXCLUDED.seo_description, deleted_at=NULL
      RETURNING id
    `, [storeId, JSON.stringify([{ type: 'heading', data: { text: 'Şəhərin fürsətlərini birləşdiririk' } }, { type: 'paragraph', data: { text: 'Gündəlik Bakı istifadəçiləri etibarlı biznes, məhsul, kampaniya və faydalı kontentlə əlaqələndirir.' } }]), JSON.stringify({ '@context': 'https://schema.org', '@type': 'AboutPage' }), userResult.rows[0]!.id]);

    const clusterResult = await client.query<{ id: string }>(`
      INSERT INTO seo_clusters (store_id, name, primary_keyword, search_intent, pillar_page_id, target_audience, status, created_by)
      VALUES ($1, 'Bakı alış-veriş ekosistemi', 'Bakıda alış-veriş', 'local', $2,
        'Bakıda məhsul, endirim və etibarlı biznes axtaran istifadəçilər', 'active', $3)
      ON CONFLICT (store_id, primary_keyword) DO UPDATE SET pillar_page_id=EXCLUDED.pillar_page_id,
        target_audience=EXCLUDED.target_audience, status='active'
      RETURNING id
    `, [storeId, aboutPageResult.rows[0]!.id, userResult.rows[0]!.id]);
    for (const [position, postId] of seededPostIds.entries()) {
      await client.query(`
        INSERT INTO seo_cluster_members (cluster_id, post_id, target_keyword, supporting_keywords, planned_internal_links, position)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (cluster_id, page_id, post_id) DO UPDATE SET target_keyword=EXCLUDED.target_keyword,
          supporting_keywords=EXCLUDED.supporting_keywords, planned_internal_links=EXCLUDED.planned_internal_links, position=EXCLUDED.position
      `, [clusterResult.rows[0]!.id, postId, demoPosts[position]!.keyword, [`${demoPosts[position]!.keyword} Bakı`, 'Gündəlik Bakı'], JSON.stringify([{ anchor: 'Gündəlik Bakı mağaza', url: '/magaza/' }]), position]);
    }

    const demoListings = [
      ['Peşəkar təmir və montaj xidməti', 'pesekar-temir-ve-montaj-xidmeti', 'service', 'Bakı daxilində elektrik, montaj və xırda təmir işləri.', 80],
      ['Az istifadə olunmuş alət dəsti', 'az-istifade-olunmus-alet-desti', 'product', 'Ev təmiri üçün komplekt, yaxşı vəziyyətdə alət dəsti.', 240],
      ['Nərimanovda kiçik emalatxana icarəsi', 'nerimanovda-emalatxana-icaresi', 'property', 'Avadanlıqlı, rahat girişli və təhlükəsiz emalatxana sahəsi.', 650]
    ] as const;
    for (const [title, slug, category, description, price] of demoListings) {
      await client.query(`
        INSERT INTO classified_listings (store_id, user_id, vendor_id, category, title, slug, description, price,
          currency, contact_data, location_data, status, expires_at, reviewed_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'AZN', $9, $10, 'published', now()+interval '90 days', $2)
        ON CONFLICT (store_id, slug) DO UPDATE SET title=EXCLUDED.title, description=EXCLUDED.description,
          price=EXCLUDED.price, status='published', expires_at=EXCLUDED.expires_at, deleted_at=NULL
      `, [storeId, userResult.rows[0]!.id, vendorId, category, title, slug, description, price, JSON.stringify({ phone: '+994 50 264 54 00', email: 'elan@dailybaku.az' }), JSON.stringify({ city: 'Bakı' })]);
    }
  });

  console.log(`Seed completed. ${demoProducts.length} demo products added. Bootstrap admin: ${env.BOOTSTRAP_ADMIN_EMAIL}`);
}

seed()
  .then(closePool)
  .catch(async (error) => {
    console.error(error);
    await closePool();
    process.exitCode = 1;
  });
