import { env } from '../config/env.js';
import { navigationSections, type NavigationSection } from './navigation.js';

export type ProductView = {
  id?: string;
  variant_id?: string | null;
  sku?: string | null;
  title: string;
  slug: string;
  short_description?: string | null;
  description?: string | null;
  attributes?: Record<string, unknown> | null;
  product_type?: string | null;
  stock?: string | number | null;
  price: string | number;
  compare_at_price?: string | number | null;
  currency?: string;
  image_url?: string | null;
  alt_text?: string | null;
  brand_name?: string | null;
  vendor_name?: string | null;
};

type LayoutOptions = {
  title: string;
  description: string;
  path: string;
  active?: string;
  content: string;
  schema?: Record<string, unknown> | Array<Record<string, unknown>>;
  robots?: string;
  image?: string | null;
  ogType?: 'website' | 'product' | 'article';
};

export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  })[character]!);
}

export function safeJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c').replaceAll('>', '\\u003e').replaceAll('&', '\\u0026');
}

export function money(value: string | number, currency = 'AZN'): string {
  return new Intl.NumberFormat('az-AZ', { style: 'currency', currency }).format(Number(value));
}

export function productCard(product: ProductView): string {
  const price = Number(product.price);
  const compareAt = Number(product.compare_at_price ?? 0);
  const image = product.image_url || '/assets/wp-content/uploads/other-cat.webp';
  const item = safeJson({
    listingId: product.id,
    variantId: product.variant_id,
    slug: product.slug,
    title: product.title,
    price,
    compareAt,
    image,
    sku: product.sku,
    brand: product.brand_name,
    vendor: product.vendor_name,
    description: product.description,
    shortDescription: product.short_description
  });
  const detailUrl = `/mehsul/${encodeURIComponent(product.slug)}/`;
  const brand = product.brand_name || product.vendor_name || 'Gündəlik Bakı';
  const sku = product.sku || product.slug.split('-').slice(0, 3).join('-').toUpperCase();
  const compactMoney = (value: number) => `${new Intl.NumberFormat('az-AZ', { maximumFractionDigits: 0 }).format(value)} ₼`;
  const quickView = safeJson({
    listingId: product.id,
    variantId: product.variant_id,
    slug: product.slug,
    title: product.title,
    brand,
    vendor: product.vendor_name || '',
    sku,
    description: product.description || product.short_description || '',
    shortDescription: product.short_description || '',
    attributes: product.attributes || {},
    productType: product.product_type || '',
    stock: Number(product.stock ?? 0),
    price,
    compareAt,
    image
  });
  const whatsappMessage = encodeURIComponent(`Salam, ${product.title} məhsulu haqqında məlumat almaq istəyirəm: ${originSafe(detailUrl)}`);
  return `<article class="db-product-card" itemscope itemtype="https://schema.org/Product">
    <div class="db-product-media">
      <div class="db-product-actions" aria-label="Məhsul əməliyyatları">
        <button class="db-product-action db-product-wishlist" type="button" data-wishlist="${escapeHtml(product.slug)}" aria-label="Seçilmişlərə əlavə et" aria-pressed="false"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Seçilmişlərə əlavə et</span></button>
        <button class="db-product-action db-product-quick-view" type="button" data-quick-view="${escapeHtml(quickView)}" aria-label="Sürətli baxış"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">Sürətli baxış</span></button>
        <a class="db-product-action db-product-whatsapp" href="https://wa.me/994502645400?text=${whatsappMessage}" target="_blank" rel="noopener noreferrer" aria-label="WhatsApp ilə soruş"><span class="db-action-icon" aria-hidden="true"></span><span class="db-action-tooltip">WhatsApp</span></a>
      </div>
      <a href="${detailUrl}" aria-label="${escapeHtml(product.title)}">
        <img src="${escapeHtml(image)}" alt="${escapeHtml(product.alt_text || `${product.title} — məhsul şəkli`)}" width="420" height="390" loading="lazy" decoding="async" itemprop="image">
      </a>
    </div>
    <div class="db-product-content">
      <p class="db-product-sku">SKU: ${escapeHtml(sku)}</p>
      <h3 itemprop="name"><a href="${detailUrl}">${escapeHtml(product.title)}</a></h3>
      <div class="db-product-bottom" itemprop="offers" itemscope itemtype="https://schema.org/Offer">
        <div class="db-product-price"><strong itemprop="price" content="${price}">${compactMoney(price)}</strong></div>
        <meta itemprop="priceCurrency" content="${escapeHtml(product.currency || 'AZN')}"><link itemprop="availability" href="https://schema.org/InStock">
        <button class="db-add-cart" type="button" data-add-cart="${escapeHtml(item)}" aria-label="${escapeHtml(product.title)} məhsulunu səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button>
      </div>
    </div>
  </article>`;
}

function originSafe(path: string): string {
  return `${env.PUBLIC_ORIGIN.replace(/\/$/, '')}${path}`;
}

export function breadcrumb(items: Array<[string, string?]>): string {
  const visible = items.map(([label, href], index) => href && index < items.length - 1
    ? `<a href="${escapeHtml(href)}">${escapeHtml(label)}</a><span aria-hidden="true">›</span>`
    : `<span aria-current="page">${escapeHtml(label)}</span>`).join('');
  return `<nav class="page-breadcrumb" aria-label="Səhifə yolu"><a href="/">Ana səhifə</a><span aria-hidden="true">›</span>${visible}</nav>`;
}

type AccountSection = 'dashboard' | 'wishlist' | 'orders' | 'addresses' | 'details';

const accountIcons: Record<AccountSection | 'logout', string> = {
  dashboard: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="7" r="4"/><path d="M4.5 21v-2.5a7.5 7.5 0 0 1 15 0V21Z"/></svg>',
  wishlist: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
  orders: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16l-1 14H5L4 7Z"/><path d="M9 10V5a3 3 0 0 1 6 0v5M8 14h.01M16 14h.01"/></svg>',
  addresses: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/><path d="M5 21h14"/></svg>',
  details: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="7" r="4"/><path d="M2 21v-2a7 7 0 0 1 10.5-6M15 19l5-5 2 2-5 5-3 1 1-3Z"/></svg>',
  logout: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2v10M5.6 5.6a9 9 0 1 0 12.8 0"/></svg>'
};

function accountNavigation(active: AccountSection): string {
  const links: Array<[AccountSection, string, string]> = [
    ['dashboard', 'İdarə paneli', '/hesabim/'],
    ['wishlist', 'Seçilmişlər', '/hesabim/secilmisler/'],
    ['orders', 'Sifarişlər', '/hesabim/sifarisler/'],
    ['addresses', 'Ünvanlar', '/hesabim/unvanlar/'],
    ['details', 'Hesab məlumatları', '/hesabim/hesab-melumatlari/']
  ];
  return `<nav class="db-account-navigation" aria-label="Hesabım">
    ${links.map(([key, label, href]) => `<a href="${href}"${active === key ? ' class="is-active" aria-current="page"' : ''}><span class="db-account-nav-icon">${accountIcons[key]}</span>${label}</a>`).join('')}
    <button type="button" data-account-logout><span class="db-account-nav-icon">${accountIcons.logout}</span>Çıxış</button>
  </nav>`;
}

export function accountShell(active: AccountSection, content: string): string {
  return `<section class="db-account-page"><div class="page-container">
    <nav class="page-breadcrumb" aria-label="Səhifə yolu"><a href="/">Ana səhifə</a><span aria-hidden="true">›</span><span aria-current="page">Hesabım</span></nav>
    <div class="db-account-layout">
      ${accountNavigation(active)}
      <div class="db-account-main" data-account-section="${active}">${content}</div>
    </div>
  </div></section>`;
}

export function categoryNavigation(section: NavigationSection, activeChildSlug?: string): string {
  const headingId = `${section.key}-categories-title`;
  const items = section.children.map((child) => {
    const active = child.slug === activeChildSlug;
    return `<li class="page-category-item">
      <a class="page-category-card${active ? ' is-active' : ''}" href="${escapeHtml(child.href)}"${active ? ' aria-current="page"' : ''}>
        <span class="page-category-image"><img src="${escapeHtml(child.image)}" alt="${escapeHtml(child.label)} kateqoriyası" width="168" height="168" loading="lazy" decoding="async"></span>
        <span class="page-category-label">${escapeHtml(child.label)}</span>
      </a>
    </li>`;
  }).join('');
  return `<section class="page-category-nav" aria-labelledby="${headingId}"><div class="page-container">
    <div class="page-category-heading"><p>KATEQORİYANI SEÇİN</p><h2 id="${headingId}">${escapeHtml(section.label)} bölmələri</h2></div>
    <ul class="page-category-list" role="list">${items}</ul>
  </div></section>`;
}

export function layout(options: LayoutOptions): string {
  const origin = env.PUBLIC_ORIGIN.replace(/\/$/, '');
  const canonical = `${origin}${options.path}`;
  const shareImage = options.image
    ? (options.image.startsWith('http://') || options.image.startsWith('https://') ? options.image : `${origin}${options.image.startsWith('/') ? '' : '/'}${options.image}`)
    : `${origin}/assets/wp-content/uploads/revslider/slider-1/slider-back.webp`;
  const schemas = Array.isArray(options.schema) ? options.schema : options.schema ? [options.schema] : [];
  const websiteSchema = { '@context': 'https://schema.org', '@type': 'WebSite', name: 'Gündəlik Bakı', url: origin, publisher: { '@type': 'Organization', name: 'Gündəlik Bakı', logo: { '@type': 'ImageObject', url: `${origin}/assets/images/categories/logoSite.png`, width: 1536, height: 1024 } }, potentialAction: { '@type': 'SearchAction', target: `${origin}/magaza/?axtaris={search_term_string}`, 'query-input': 'required name=search_term_string' } };
  const navigationHtml = navigationSections.map((section) => `<li class="page-navigation-item">
    <a href="${section.href}" aria-haspopup="true" aria-expanded="false"${options.active === section.key ? ' class="is-active-section"' : ''}${options.path === section.href ? ' aria-current="page"' : ''}><span>${escapeHtml(section.label)}</span><i class="page-nav-arrow" aria-hidden="true"></i></a>
    <ul class="page-submenu" aria-label="${escapeHtml(section.label)} alt kateqoriyaları">${section.children.map((child) => `<li><a href="${child.href}"${options.path === child.href ? ' aria-current="page"' : ''}>${escapeHtml(child.label)}</a></li>`).join('')}<li class="page-submenu-all"><a href="${section.href}">Hamısına bax <span aria-hidden="true">›</span></a></li></ul>
  </li>`).join('');
  const storeNavigationHtml = navigationSections[0].children.map((child) =>
    `<li><a href="${child.href}"${options.path === child.href ? ' aria-current="page"' : ''}><span class="page-mobile-menu-thumb"><img src="${child.image}" width="40" height="40" alt="" loading="lazy" decoding="async"></span><span>${escapeHtml(child.label)}</span></a></li>`
  ).join('');
  return `<!doctype html>
<html lang="az">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${escapeHtml(options.title)}</title>
  <meta name="description" content="${escapeHtml(options.description)}">
  <meta name="robots" content="${escapeHtml(options.robots || 'index,follow,max-image-preview:large')}">
  <link rel="canonical" href="${escapeHtml(canonical)}">
  <meta property="og:type" content="${options.ogType || 'website'}"><meta property="og:site_name" content="Gündəlik Bakı">
  <meta property="og:title" content="${escapeHtml(options.title)}"><meta property="og:description" content="${escapeHtml(options.description)}">
  <meta property="og:url" content="${escapeHtml(canonical)}"><meta property="og:image" content="${escapeHtml(shareImage)}">
  <meta property="og:image:alt" content="${escapeHtml(options.title)}">
  <meta name="twitter:card" content="summary_large_image">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/brand/favicon-32.png">
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/brand/icon-192.png">
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/brand/apple-touch-icon.png">
  <link rel="stylesheet" href="/assets/css/pages.css">
  <link rel="stylesheet" href="/assets/css/site.css">
  <link rel="stylesheet" href="/assets/css/commerce.css">
  <link rel="stylesheet" href="/assets/css/search.css">
  <link rel="stylesheet" href="/assets/css/account.css">
  <link rel="stylesheet" href="/assets/css/product.css">
  <link rel="stylesheet" href="/assets/css/mobile-panels.css">
  <script type="application/ld+json">${safeJson(websiteSchema)}</script>
  ${schemas.map((schema) => `<script type="application/ld+json">${safeJson(schema)}</script>`).join('\n')}
  <script src="/assets/js/commerce.js" defer></script>
  <script src="/assets/js/mobile-panels.js" defer></script>
  <script src="/assets/js/search.js" defer></script>
  <script src="/assets/js/pages.js" defer></script>
  <script src="/assets/js/product.js" defer></script>
</head>
<body id="top" data-page="${escapeHtml(options.active || '')}">
  <a class="page-skip" href="#main-content">Əsas məzmuna keç</a>
  <div class="page-topbar"><div class="page-container">
    <span class="page-topbar-item"><i class="page-shell-icon pin" aria-hidden="true"></i>Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan</span>
    <a class="page-topbar-item page-topbar-contact" href="/elaqe/"><i class="page-shell-icon mail" aria-hidden="true"></i>Əlaqə</a>
    <span class="page-topbar-item page-topbar-delivery"><i class="page-shell-icon truck" aria-hidden="true"></i>99 AZN-dən yuxarı pulsuz çatdırılma</span>
    <a class="page-login" href="/hesabim/"><i class="page-shell-icon user" aria-hidden="true"></i><span>Daxil ol</span></a>
  </div></div>
  <header class="page-header">
    <div class="page-container page-header-main">
      <a class="page-logo" href="/" aria-label="Gündəlik Bakı ana səhifə"><img src="/assets/images/categories/logoSite.png" width="220" height="68" alt="Gündəlik Bakı"></a>
      <form class="page-search" action="/magaza/" method="get" role="search" data-db-search><label class="sr-only" for="site-search">Məhsul axtarışı</label><i class="page-shell-icon search" aria-hidden="true"></i><input id="site-search" name="axtaris" type="search" placeholder="Nə axtarırsınız?"><button>Axtarış</button></form>
      <a class="page-support page-header-contact" href="tel:+994502645400"><i class="page-shell-icon phone" aria-hidden="true"></i><span><strong>+994 50 264 54 00</strong><small>Müştəri və biznes dəstəyi</small></span></a>
      <a class="page-live-chat page-header-contact" href="/elaqe/"><i class="page-shell-icon chat" aria-hidden="true"></i><span><strong>Canlı çat</strong><small>Mütəxəssislə danış</small></span></a>
      <a class="page-mobile-phone" href="tel:+994502645400" aria-label="Müştəri dəstəyinə zəng et"><i class="page-shell-icon phone" aria-hidden="true"></i></a>
      <a class="page-cart-link" href="/sebet/" data-mini-cart-toggle aria-label="Səbətimi aç"><i class="page-shell-icon cart" aria-hidden="true"></i><span data-cart-count>0</span></a>
      <button class="page-menu-toggle" type="button" aria-expanded="false" aria-controls="page-navigation" aria-label="Menyunu aç"><span></span><span></span><span></span></button>
    </div>
    <nav class="page-navigation" id="page-navigation" aria-label="Əsas menyu" data-mobile-menu-tab="navigation">
      <div class="page-mobile-menu-tabs" role="tablist" aria-label="Mobil menyu bölmələri">
        <button class="is-active" type="button" role="tab" aria-selected="true" data-page-menu-tab="navigation"><i aria-hidden="true"><span></span><span></span><span></span></i>Naviqasiya</button>
        <button type="button" role="tab" aria-selected="false" data-page-menu-tab="store">Mağaza</button>
      </div>
      <div class="page-container page-navigation-row"><ul class="page-store-navigation" aria-label="Mağaza kateqoriyaları">${storeNavigationHtml}</ul><ul class="page-navigation-root">${navigationHtml}</ul><a class="page-navigation-tools" href="/hesabim/secilmisler/" aria-label="Seçilmiş məhsullar"><i class="page-shell-icon heart" aria-hidden="true"></i><b data-wishlist-count>0</b></a></div>
    </nav>
  </header>
  <main id="main-content">${options.content}</main>
  <footer class="page-footer">
    <div class="page-container page-footer-main">
      <div class="page-footer-brand"><span class="page-footer-logo"><img src="/assets/images/categories/logoSite.png" width="261" height="81" alt="Gündəlik Bakı"></span><p>Gündəlik Bakı şəhərin fürsətlərini, rəqəmsal jurnalı və etibarlı biznesləri vahid platformada birləşdirir. Oxu. Skan et. Qazan.</p><div class="page-socials" aria-label="Sosial şəbəkələr"><a class="facebook" href="/elaqe/" aria-label="Facebook"></a><a class="instagram" href="#" aria-label="Instagram"></a><a class="linkedin" href="#" aria-label="LinkedIn"></a><a class="telegram" href="#" aria-label="Telegram"></a><a class="twitter" href="#" aria-label="X"></a><a class="whatsapp" href="/elaqe/" aria-label="WhatsApp"></a></div></div>
      <div class="page-footer-links">
        <section><h2>Platforma haqqında</h2><a href="/haqqimizda/">Biz kimik</a><a href="/baki-club/">Bakı Club</a><a href="/biznes/">Biznes üçün</a></section>
        <section><h2>Müştəri dəstəyi</h2><a href="/faq/">Tez-tez verilən suallar</a><a href="/elaqe/">Əlaqə</a><a href="/catdirilma/">Çatdırılma siyasəti</a><a href="/geri-qaytarma/">Geri qaytarma</a></section>
        <section><h2>Biznes əməkdaşlığı</h2><a href="/biznes/#reklam">Reklam portalı</a><a href="/biznes/#sponsorluq">Sponsorluq</a><a href="/biznes/#brend-vitrini">Brend olun</a></section>
        <section><h2>Sürətli keçidlər</h2><a href="/jurnal/">Son jurnal</a><a href="/magaza/">Kateqoriyalar</a><a href="/elanlar/">Elan yerləşdir</a></section>
      </div>
      <div class="page-footer-contact">
        <a href="/elaqe/"><i class="page-shell-icon pin" aria-hidden="true"></i><span>Cəfər Cabbarlı 33, AZ1065, Bakı/Azərbaycan</span></a>
        <a href="tel:+994502645400"><i class="page-shell-icon phone" aria-hidden="true"></i><span><strong>+994 50 264 54 00</strong><small>Müştəri və biznes dəstəyi</small></span></a>
        <div><i class="page-shell-icon clock" aria-hidden="true"></i><span>Bazar ertəsi – Cümə: 09:00 – 18:00<br>Şənbə: 10:00 – 15:00</span></div>
      </div>
    </div>
    <div class="page-footer-bottom"><div class="page-container page-footer-legal"><div class="db-footer-identity"><p>Copyright © 2026 Gündəlik Bakı Poçtu-Daily Baku Mail. Bütün hüquqlar qorunur.</p><p class="db-footer-company"><span>"Gündəlik Bakı" Panorama Reklam MMC nin satış platformasıdır.</span><span>VÖEN 2007614681</span></p></div><nav aria-label="Hüquqi keçidlər"><a href="/mexfilik/">Məxfilik siyasəti</a><a href="/geri-qaytarma/">Geri qaytarma siyasəti</a><a href="/istifade-sertleri/">İstifadə şərtləri</a></nav></div></div>
  </footer>
  <nav class="page-mobile-dashboard" aria-label="Mobil sürətli keçidlər">
    <a href="/hesabim/"><i class="page-shell-icon account" aria-hidden="true"></i><span>Hesab</span><b data-wishlist-count>0</b></a>
    <a href="/magaza/"><i class="page-shell-icon grid" aria-hidden="true"></i><span>Kateqoriyalar</span></a>
    <a href="/sebet/" data-mini-cart-toggle><i class="page-shell-icon cart" aria-hidden="true"></i><span>Səbət</span><b data-cart-count>0</b></a>
    <a href="#site-search" data-mobile-search><i class="page-shell-icon search" aria-hidden="true"></i><span>Axtarış</span></a>
    <a href="#top"><i class="page-shell-icon up" aria-hidden="true"></i><span>Yuxarı</span></a>
  </nav>
  <div class="page-toast" role="status" aria-live="polite"></div>
</body>
</html>`;
}

export function emptyState(title: string, text: string, href = '/magaza/', label = 'Mağazaya bax'): string {
  return `<section class="page-empty"><div class="page-empty-icon">DB</div><h2>${escapeHtml(title)}</h2><p>${escapeHtml(text)}</p><a class="page-primary" href="${href}">${escapeHtml(label)}</a></section>`;
}
