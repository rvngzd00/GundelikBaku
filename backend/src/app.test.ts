import assert from 'node:assert/strict';
import test, { after } from 'node:test';

process.env['LOG_LEVEL'] = 'silent';

after(async () => {
  const { closePool } = await import('./db/pool.js');
  await closePool();
});

test('admin və statik frontend faylları ümumi API rate limitinə düşmür', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const admin = await app.inject({ method: 'GET', url: '/admin/' });
    assert.equal(admin.statusCode, 200);
    assert.match(admin.headers['content-type'] ?? '', /^text\/html/);

    for (let index = 0; index < 320; index += 1) {
      const asset = await app.inject({ method: 'GET', url: '/assets/css/kirki-styles.css' });
      assert.equal(asset.statusCode, 200);
      assert.match(asset.headers['content-type'] ?? '', /^text\/css/);
    }
  } finally {
    await app.close();
  }
});

test('WordPress compatibility endpoint URL-encoded sorğunu qəbul edir', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const response = await app.inject({
      method: 'POST',
      url: '/api/wp-compat?wc-ajax=get_refreshed_fragments',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      payload: 'action=get_refreshed_fragments'
    });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), { success: true, data: [], fragments: {} });
  } finally {
    await app.close();
  }
});

test('public web səhifələri HTML və canonical metadata ilə render olunur', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const home = await app.inject({ method: 'GET', url: '/' });
    assert.equal(home.statusCode, 200);
    assert.match(home.body, /<title>Gündəlik Bakı/);
    assert.match(home.body, /property="og:site_name" content="Gündəlik Bakı"/);
    assert.match(home.body, /"@type":"WebSite","name":"Gündəlik Bakı"/);
    assert.doesNotMatch(home.body.replaceAll('Gündəlik Bakı Poçtu-Daily Baku Mail', ''), /Daily\s+Baku/i);
    assert.match(home.body, /Copyright © 2026 Gündəlik Bakı Poçtu-Daily Baku Mail/);
    assert.match(home.body, /"Gündəlik Bakı" Panorama Reklam MMC nin satış platformasıdır/);
    assert.match(home.body, /VÖEN 2007614681/);
    assert.match(home.body, /tel:\+994502645400/);
    assert.doesNotMatch(home.body, /37499833889|tel:55555555/);

    const page = await app.inject({ method: 'GET', url: '/baki-club/' });
    assert.equal(page.statusCode, 200);
    assert.match(page.headers['content-type'] ?? '', /^text\/html/);
    assert.match(page.body, /<h1>Bakı Club/);
    assert.match(page.body, /property="og:site_name" content="Gündəlik Bakı"/);
    assert.match(page.body, /"@type":"WebSite","name":"Gündəlik Bakı"/);
    assert.doesNotMatch(page.body.replaceAll('Gündəlik Bakı Poçtu-Daily Baku Mail', ''), /Daily\s+Baku/i);
    assert.match(page.body, /Copyright © 2026 Gündəlik Bakı Poçtu-Daily Baku Mail/);
    assert.match(page.body, /"Gündəlik Bakı" Panorama Reklam MMC nin satış platformasıdır/);
    assert.match(page.body, /VÖEN 2007614681/);
    assert.match(page.body, /tel:\+994502645400/);
    assert.match(page.body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:3000\/baki-club\/">/);
    assert.match(page.body, /class="page-category-list"/);
    assert.match(page.body, /href="\/baki-club\/xal-qazanma\/"/);
    assert.match(page.body, /class="page-submenu"/);
    assert.doesNotMatch(page.body, />Ana səhifə<\/a><\/li>/);

    const redirect = await app.inject({ method: 'GET', url: '/baki-club' });
    assert.equal(redirect.statusCode, 308);
    assert.equal(redirect.headers.location, '/baki-club/');

    const child = await app.inject({ method: 'GET', url: '/baki-club/xal-qazanma/' });
    assert.equal(child.statusCode, 200);
    assert.match(child.body, /<h1>Xal Qazanma<\/h1>/);
    assert.match(child.body, /<link rel="canonical" href="http:\/\/127\.0\.0\.1:3000\/baki-club\/xal-qazanma\/">/);
    assert.match(child.body, /href="\/baki-club\/xal-qazanma\/" aria-current="page"/);
    assert.match(child.body, /"@type":"BreadcrumbList"/);

    const childRedirect = await app.inject({ method: 'GET', url: '/baki-club/xal-qazanma' });
    assert.equal(childRedirect.statusCode, 308);
    assert.equal(childRedirect.headers.location, '/baki-club/xal-qazanma/');

    const unknownChild = await app.inject({ method: 'GET', url: '/baki-club/movcud-deyil/' });
    assert.equal(unknownChild.statusCode, 404);

    const search = await app.inject({ method: 'GET', url: '/api/v1/public/search?q=milwaukee&limit=5' });
    assert.equal(search.statusCode, 200);
    const searchBody = search.json();
    assert.ok(Array.isArray(searchBody.data.products));
    assert.ok(searchBody.data.products.length <= 5);
    assert.equal(searchBody.meta.query, 'milwaukee');

    const productSlug = searchBody.data.products[0]?.slug;
    assert.ok(productSlug);
    const product = await app.inject({ method: 'GET', url: `/mehsul/${productSlug}/` });
    assert.equal(product.statusCode, 200);
    assert.match(product.body, /data-product-page/);
    assert.match(product.body, /class="db-product-mobile-nav"/);
    assert.match(product.body, /id="product-additional-information"/);
    assert.match(product.body, /id="related-products"/);
    assert.match(product.body, /data-product-sticky-buy/);
    assert.match(product.body, /data-review-form/);
    assert.match(product.body, /data-product-copy-sku/);
    assert.doesNotMatch(product.body, /data-product-compare/);
    assert.match(product.body, /https:\/\/wa\.me\/994502645400/);
    assert.doesNotMatch(product.body, /37499833889/);
    assert.match(product.body, /src="\/assets\/js\/product\.js"/);
    assert.match(product.body, /src="\/assets\/js\/mobile-panels\.js"/);

    const authorName = `Codex test ${Date.now()}`;
    const createdReview = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      payload: {
        rating: 5,
        authorName,
        email: '',
        title: 'Test rəyi',
        body: 'Məhsul rəy sisteminin işləməsini yoxlayan avtomatik test rəyidir.'
      }
    });
    assert.equal(createdReview.statusCode, 200);
    const reviewBody = createdReview.json();
    assert.equal(reviewBody.data.review.author_name, authorName);
    assert.equal(reviewBody.data.review.rating, 5);
    assert.ok(reviewBody.data.summary.count >= 1);

    const reviews = await app.inject({ method: 'GET', url: `/api/v1/public/products/${productSlug}/reviews` });
    assert.equal(reviews.statusCode, 200);
    assert.ok(reviews.json().data.reviews.some((review: { id: string }) => review.id === reviewBody.data.review.id));

    const customerCookie = String(createdReview.headers['set-cookie']).split(';', 1)[0];
    const updatedReview = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: customerCookie },
      payload: {
        rating: 4,
        authorName,
        email: '',
        title: 'Yenilənmiş test rəyi',
        body: 'Eyni müştərinin rəyi təkrar yaranmadan uğurla yenilənməlidir.'
      }
    });
    assert.equal(updatedReview.statusCode, 200);
    assert.equal(updatedReview.json().data.review.id, reviewBody.data.review.id);
    assert.equal(updatedReview.json().data.review.rating, 4);
    const { pool } = await import('./db/pool.js');
    await pool.query('DELETE FROM product_reviews WHERE id=$1', [reviewBody.data.review.id]);

    const searchPage = await app.inject({ method: 'GET', url: '/magaza/?axtaris=milwaukee' });
    assert.equal(searchPage.statusCode, 200);
    assert.match(searchPage.body, /“milwaukee” üçün nəticələr/);
    assert.match(searchPage.body, /name="robots" content="noindex,follow"/);
  } finally {
    await app.close();
  }
});

test('rəy limiti müştəri sessiyalarını bir-birindən ayırır', async () => {
  const { buildApp } = await import('./app.js');
  const { pool } = await import('./db/pool.js');
  const app = await buildApp();
  const reviewIds = new Set<string>();

  try {
    const search = await app.inject({ method: 'GET', url: '/api/v1/public/search?q=milwaukee&limit=1' });
    const productSlug = search.json().data.products[0]?.slug;
    assert.ok(productSlug);

    const sessionA = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    const sessionB = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    const cookieA = String(sessionA.headers['set-cookie']).split(';', 1)[0];
    const cookieB = String(sessionB.headers['set-cookie']).split(';', 1)[0];
    assert.notEqual(cookieA, cookieB);

    const payload = {
      rating: 5,
      authorName: 'Limit testi A',
      email: '',
      title: 'Sessiya limiti',
      body: 'Rəy limitinin ayrı müştəri sessiyası üzrə işləməsini yoxlayan testdir.'
    };

    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: `/api/v1/customer/products/${productSlug}/reviews`,
        headers: { cookie: cookieA },
        payload
      });
      assert.equal(response.statusCode, 200);
      reviewIds.add(response.json().data.review.id);
    }

    const limited = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: cookieA },
      payload
    });
    assert.equal(limited.statusCode, 429);
    assert.equal(limited.json().code, 'REVIEW_RATE_LIMITED');
    assert.match(limited.json().message, /Ardıcıl çox sayda rəy/);

    const otherCustomer = await app.inject({
      method: 'POST',
      url: `/api/v1/customer/products/${productSlug}/reviews`,
      headers: { cookie: cookieB },
      payload: { ...payload, authorName: 'Limit testi B' }
    });
    assert.equal(otherCustomer.statusCode, 200);
    reviewIds.add(otherCustomer.json().data.review.id);
  } finally {
    if (reviewIds.size) {
      await pool.query('DELETE FROM product_reviews WHERE id=ANY($1::uuid[])', [[...reviewIds]]);
    }
    await app.close();
  }
});

test('customer account səhifələri və anonim state API-si işləyir', async () => {
  const { buildApp } = await import('./app.js');
  const app = await buildApp();

  try {
    const account = await app.inject({ method: 'GET', url: '/hesabim/secilmisler/' });
    assert.equal(account.statusCode, 200);
    assert.equal(account.headers['cache-control'], 'private, no-store');
    assert.match(account.body, /data-account-wishlist/);
    assert.match(account.body, /href="\/hesabim\/sifarisler\/"/);
    assert.match(account.body, /src="\/assets\/js\/commerce\.js"/);
    assert.match(account.body, /data-wishlist-count/);
    assert.match(account.body, />Ana səhifə<\/a>/);
    assert.match(account.body, />Seçilmişlər<\/a>/);
    assert.doesNotMatch(account.body, />History</);
    assert.doesNotMatch(account.body, /href="\/hesabim\/tarixce\/"/);

    const removedHistory = await app.inject({ method: 'GET', url: '/hesabim/tarixce/' });
    assert.equal(removedHistory.statusCode, 302);
    assert.equal(removedHistory.headers.location, '/hesabim/sifarisler/');

    const cartPage = await app.inject({ method: 'GET', url: '/sebet/' });
    assert.equal(cartPage.statusCode, 200);
    assert.match(cartPage.body, /data-cart-page/);
    assert.match(cartPage.body, /data-mini-cart-toggle/);
    assert.match(cartPage.body, />Səbət<\/span>/);

    const state = await app.inject({ method: 'GET', url: '/api/v1/customer/state' });
    assert.equal(state.statusCode, 200);
    assert.match(state.headers['cache-control'] ?? '', /no-store/);
    assert.ok(state.headers['set-cookie']);
    const body = state.json();
    assert.ok(Array.isArray(body.data.cart));
    assert.ok(Array.isArray(body.data.wishlist));
    assert.ok(Array.isArray(body.data.orders));
  } finally {
    await app.close();
  }
});

test('mega menu ağacı sənəddəki 7 əsas və 34 alt kateqoriyanı əhatə edir', async () => {
  const { navigationPaths, navigationSections } = await import('./web/navigation.js');
  assert.equal(navigationSections.length, 7);
  assert.equal(navigationSections.reduce((total, section) => total + section.children.length, 0), 34);
  assert.equal(navigationPaths.length, 41);
  assert.equal(new Set(navigationPaths).size, navigationPaths.length);
  const categoryImages = navigationSections.flatMap((section) => {
    assert.equal(section.image, `/assets/images/categories/${section.slug}.jpg`);
    for (const child of section.children) {
      assert.equal(child.image, `/assets/images/categories/${section.slug}/${child.slug}.jpg`);
    }
    return [section.image, ...section.children.map((child) => child.image)];
  });
  assert.equal(categoryImages.length, 41);
  assert.equal(new Set(categoryImages).size, categoryImages.length);
});
