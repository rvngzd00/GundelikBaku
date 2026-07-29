const readCart = () => window.DailyBakuCommerce?.readCart() || [];
const writeCart = (items) => window.DailyBakuCommerce?.writeCart(items);
const formatMoney = (value) => new Intl.NumberFormat('az-AZ', { style: 'currency', currency: 'AZN' }).format(Number(value));
const escapeHtml = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);

function updateCartCount() {
  window.DailyBakuCommerce?.syncUI();
}

function toast(message) {
  const element = document.querySelector('.page-toast');
  if (!element) return;
  element.textContent = message;
  element.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => element.classList.remove('show'), 2200);
}

function readWishlist() {
  return new Set((window.DailyBakuCommerce?.readWishlist() || []).map((item) => item.slug));
}

function synchronizeWishlistButtons() {
  window.DailyBakuCommerce?.syncUI();
}

function safeImageUrl(value) {
  try {
    const url = new URL(value || '/assets/wp-content/uploads/other-cat.webp', location.origin);
    if (url.origin !== location.origin && url.protocol !== 'https:') throw new Error('Unsafe media URL');
    return url.href;
  } catch {
    return '/assets/wp-content/uploads/other-cat.webp';
  }
}

function whatsappUrl(title) {
  return `https://wa.me/994502645400?text=${encodeURIComponent(`${title} haqqında məlumat almaq istəyirəm`)}`;
}

function brandLogoUrl(brand = '') {
  const normalized = String(brand).toLocaleLowerCase('az-AZ');
  const logos = [
    ['milwaukee', '/assets/wp-content/uploads/milwaukee-logo.webp'],
    ['dewalt', '/assets/wp-content/uploads/dewolt-logo.webp'],
    ['makita', '/assets/wp-content/uploads/makita-logo.webp'],
    ['bosch', '/assets/wp-content/uploads/bosch-logo.webp'],
    ['festool', '/assets/wp-content/uploads/festool-logo.webp'],
    ['metabo', '/assets/wp-content/uploads/melabo-logo.webp'],
    ['jet', '/assets/wp-content/uploads/jet-logo.webp'],
    ['max', '/assets/wp-content/uploads/max-logo.webp']
  ];
  return logos.find(([name]) => normalized.includes(name))?.[1] || '';
}

function additionalValue(value) {
  if (Array.isArray(value)) return value.map(additionalValue).filter(Boolean).join(', ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, item]) => `${key}: ${additionalValue(item)}`).join(', ');
  if (typeof value === 'boolean') return value ? 'Bəli' : 'Xeyr';
  return String(value ?? '').trim();
}

function additionalInformation(product) {
  const attributes = product.attributes && typeof product.attributes === 'object' && !Array.isArray(product.attributes)
    ? Object.entries(product.attributes)
    : [];
  const rows = [
    ['SKU', product.sku],
    ['Brend', product.brand],
    ['Satıcı', product.vendor],
    ['Məhsul növü', product.productType],
    ['Stok', Number.isFinite(Number(product.stock)) ? `${Number(product.stock)} ədəd` : ''],
    ...attributes
  ].filter(([, value]) => additionalValue(value));
  const description = product.description || product.shortDescription || '';
  return `${description ? `<p>${escapeHtml(description)}</p>` : ''}
    <dl>${rows.map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(additionalValue(value))}</dd></div>`).join('')}</dl>
    <a href="/mehsul/${encodeURIComponent(product.slug)}/">Məhsul səhifəsinə keç</a>`;
}

function quickViewDialog() {
  let dialog = document.querySelector('.db-quick-view-dialog');
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.className = 'db-quick-view-dialog';
  dialog.setAttribute('aria-labelledby', 'db-quick-view-title');
  dialog.setAttribute('aria-modal', 'true');
  dialog.innerHTML = `<button class="db-quick-view-close" type="button" aria-label="Pəncərəni bağla">×</button>
    <div class="db-quick-view-layout">
      <div class="db-quick-view-image"><img class="db-quick-view-product-image" src="" alt="" width="520" height="520"></div>
      <div class="db-quick-view-copy">
        <p class="db-quick-view-recommended"><span aria-hidden="true">✓</span>TÖVSİYƏ OLUNUR!</p>
        <h2 id="db-quick-view-title"></h2>
        <div class="db-quick-view-brand-card">
          <span class="db-quick-view-brand-logo"><img src="" alt="" hidden><b></b></span>
          <span class="db-quick-view-brand-copy"><strong></strong><small>Brend</small></span>
        </div>
        <p class="db-quick-view-sku"><span aria-hidden="true"></span>SKU: <b></b></p>
        <div class="db-quick-view-additional">
          <button type="button" aria-expanded="false" aria-controls="db-quick-view-additional-panel"><span aria-hidden="true">i</span><b>Əlavə məlumat</b><i aria-hidden="true"></i></button>
          <div id="db-quick-view-additional-panel" hidden></div>
        </div>
        <div class="db-quick-view-price"><strong></strong><del></del></div>
        <div class="db-quick-view-quantity" role="group" aria-label="Məhsul sayı">
          <button type="button" data-quick-view-quantity="-1" aria-label="Sayı azalt">−</button>
          <output class="db-quick-view-quantity-value" aria-live="polite">1</output>
          <button type="button" data-quick-view-quantity="1" aria-label="Sayı artır">+</button>
        </div>
        <button class="db-quick-view-cart db-add-cart" type="button"><span class="db-cart-icon" aria-hidden="true"></span><b>SƏBƏTƏ AT</b></button>
      </div>
    </div>`;
  document.body.append(dialog);
  dialog.querySelector('.db-quick-view-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => document.documentElement.classList.remove('db-quick-view-open'));
  dialog.querySelector('.db-quick-view-additional > button').addEventListener('click', (event) => {
    const toggle = event.currentTarget;
    const panel = dialog.querySelector('#db-quick-view-additional-panel');
    const expanded = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!expanded));
    panel.hidden = expanded;
  });
  dialog.querySelectorAll('[data-quick-view-quantity]').forEach((control) => {
    control.addEventListener('click', () => {
      const output = dialog.querySelector('.db-quick-view-quantity-value');
      output.value = String(Math.max(1, Math.min(99, Number(output.value || output.textContent || 1) + Number(control.dataset.quickViewQuantity))));
      output.textContent = output.value;
    });
  });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog) dialog.close();
  });
  return dialog;
}

function openQuickView(button) {
  try {
    const product = JSON.parse(button.dataset.quickView);
    const dialog = quickViewDialog();
    const image = dialog.querySelector('.db-quick-view-product-image');
    image.src = safeImageUrl(product.image);
    image.alt = `${product.title} — məhsul şəkli`;
    dialog.querySelector('h2').textContent = product.title;
    const logo = dialog.querySelector('.db-quick-view-brand-logo img');
    const logoFallback = dialog.querySelector('.db-quick-view-brand-logo b');
    const logoUrl = brandLogoUrl(product.brand);
    logo.hidden = !logoUrl;
    logoFallback.hidden = Boolean(logoUrl);
    if (logoUrl) {
      logo.src = logoUrl;
      logo.alt = `${product.brand} loqosu`;
    }
    logoFallback.textContent = product.brand;
    dialog.querySelector('.db-quick-view-brand-copy strong').textContent = product.brand;
    dialog.querySelector('.db-quick-view-sku b').textContent = product.sku || product.slug.split('-').slice(0, 3).join('-').toUpperCase();
    dialog.querySelector('#db-quick-view-additional-panel').innerHTML = additionalInformation(product);
    const additionalToggle = dialog.querySelector('.db-quick-view-additional > button');
    additionalToggle.setAttribute('aria-expanded', 'false');
    dialog.querySelector('#db-quick-view-additional-panel').hidden = true;
    dialog.querySelector('.db-quick-view-price strong').textContent = formatMoney(product.price);
    const comparePrice = dialog.querySelector('.db-quick-view-price del');
    comparePrice.textContent = Number(product.compareAt) > Number(product.price) ? formatMoney(product.compareAt) : '';
    const cartButton = dialog.querySelector('.db-add-cart');
    cartButton.dataset.addCart = JSON.stringify({
      listingId: product.listingId,
      variantId: product.variantId,
      slug: product.slug,
      title: product.title,
      price: product.price,
      compareAt: product.compareAt,
      image: product.image,
      sku: product.sku,
      brand: product.brand,
      vendor: product.vendor,
      description: product.description,
      shortDescription: product.shortDescription
    });
    cartButton.setAttribute('aria-label', `${product.title} məhsulunu səbətə əlavə et`);
    window.DailyBakuCommerce?.syncUI();
    const quantity = dialog.querySelector('.db-quick-view-quantity-value');
    quantity.value = '1';
    quantity.textContent = '1';
    if (!dialog.open) {
      document.documentElement.classList.add('db-quick-view-open');
      dialog.showModal();
    }
  } catch {
    toast('Sürətli baxışı açmaq mümkün olmadı');
  }
}

const cartDetailRequests = new Set();
const cartTrashIcon = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 14H7L6 7m4 4v6m4-6v6"/></svg>';

function hydrateCartDetails(items) {
  items.filter((item) => item.slug && (!item.description || !item.compareAt) && !cartDetailRequests.has(item.slug)).forEach((item) => {
    cartDetailRequests.add(item.slug);
    fetch(`/api/v1/public/products/${encodeURIComponent(item.slug)}`, {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' }
    }).then((response) => {
      if (!response.ok) throw new Error('Məhsul məlumatı tapılmadı');
      return response.json();
    }).then(({ data }) => {
      const current = readCart();
      const target = current.find((entry) => entry.slug === item.slug);
      if (!target || !data) return;
      target.listingId ||= data.id;
      target.variantId ||= data.variants?.[0]?.id;
      target.compareAt = Number(data.compare_at_price || target.compareAt || 0);
      target.description = String(data.short_description || data.description || target.description || '');
      target.shortDescription = String(data.short_description || '');
      target.sku = String(data.sku || target.sku || '');
      target.brand = String(data.brand_name || target.brand || '');
      writeCart(current);
    }).catch(() => {
      // The saved cart remains usable even if a product detail request fails.
    });
  });
}

function checkoutForm(total) {
  return `<form class="page-checkout-form db-cart-checkout-form" data-checkout-form hidden>
    <div class="page-section-title"><div><p>TƏHLÜKƏSİZ SİFARİŞ</p><h2>Çatdırılma məlumatları</h2></div></div>
    <div class="page-form-grid">
      <label>Ad və soyad<input name="customerName" autocomplete="name" minlength="2" maxlength="200" required></label>
      <label>Telefon<input name="customerPhone" type="tel" autocomplete="tel" minlength="7" maxlength="40" placeholder="+994 50 264 54 00" required></label>
      <label>E-poçt<input name="customerEmail" type="email" autocomplete="email" required></label>
      <label>Şəhər<input name="city" autocomplete="address-level2" value="Bakı" minlength="2" maxlength="120" required></label>
      <label class="page-form-wide">Ünvan<input name="addressLine1" autocomplete="street-address" minlength="5" maxlength="300" required></label>
      <label class="page-form-wide">Sifariş qeydi <span>(istəyə bağlı)</span><textarea name="customerNote" maxlength="1000" rows="3"></textarea></label>
    </div>
    <label class="page-terms"><input name="terms" type="checkbox" required> <span><a href="/istifade-sertleri/">İstifadə şərtləri</a> və <a href="/mexfilik/">məxfilik siyasəti</a> ilə razıyam.</span></label>
    <button class="page-checkout-button" type="submit">SİFARİŞİ TƏSDİQLƏ — ${formatMoney(total)}</button>
    <p class="page-form-status" data-checkout-status role="status" aria-live="polite"></p>
  </form>`;
}

function cartProductRow(item) {
  const quantity = Math.max(1, Number(item.quantity || 1));
  const compareAt = Number(item.compareAt || 0);
  const unitPrice = Number(item.price || 0);
  const lineTotal = unitPrice * quantity;
  const saving = Math.max(0, (compareAt - unitPrice) * quantity);
  const description = item.shortDescription || item.description || 'Keyfiyyətli, etibarlı və gündəlik istifadə üçün uyğun məhsul.';
  return `<article class="db-cart-product">
    <a class="db-cart-product-media" href="/mehsul/${encodeURIComponent(item.slug)}/">
      <img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.title)}" width="132" height="132">
    </a>
    <div class="db-cart-product-details">
      <h2><a href="/mehsul/${encodeURIComponent(item.slug)}/">${escapeHtml(item.title)}</a></h2>
      <div class="db-cart-product-unit-price">${compareAt > unitPrice ? `<del>${formatMoney(compareAt)}</del>` : ''}<strong>${formatMoney(unitPrice)}</strong></div>
      <p>${escapeHtml(description)}</p>
      <div class="db-cart-product-quantity" role="group" aria-label="${escapeHtml(item.title)} məhsulunun sayı">
        <button type="button" data-cart-quantity="${escapeHtml(item.slug)}" data-delta="-1" aria-label="Sayı azalt">−</button>
        <output aria-live="polite">${quantity}</output>
        <button type="button" data-cart-quantity="${escapeHtml(item.slug)}" data-delta="1" aria-label="Sayı artır">+</button>
      </div>
    </div>
    <div class="db-cart-product-total">
      <div><strong>${formatMoney(lineTotal)}</strong>
        <button type="button" data-remove-cart="${escapeHtml(item.slug)}" aria-label="${escapeHtml(item.title)} məhsulunu səbətdən sil">${cartTrashIcon}</button>
      </div>
      ${saving > 0 ? `<span>${formatMoney(saving)} qənaət etdiniz</span>` : ''}
    </div>
  </article>`;
}

function renderCart() {
  const container = document.querySelector('[data-cart-page]');
  if (!container) return;
  const items = readCart();
  if (!items.length) {
    container.innerHTML = '<section class="page-empty"><div class="page-empty-icon">DB</div><h2>Səbətiniz boşdur</h2><p>Mağazadakı məhsullara baxaraq alış-verişə başlaya bilərsiniz.</p><a class="page-primary" href="/magaza/">Mağazaya bax</a></section>';
    return;
  }
  const total = items.reduce((sum, item) => sum + Number(item.price) * Number(item.quantity || 1), 0);
  container.innerHTML = `<div class="db-cart-page-layout">
    <section class="db-cart-products" aria-label="Səbətdəki məhsullar">
      <div class="db-cart-products-head" aria-hidden="true"><span>Məhsul</span><span>Məlumat</span><span>Cəmi</span></div>
      <div class="db-cart-products-list">${items.map(cartProductRow).join('')}</div>
    </section>
    <aside class="db-cart-summary">
      <h2>SƏBƏT CƏMİ</h2>
      <details class="db-cart-coupon"><summary>Kuponlar <span aria-hidden="true">⌄</span></summary><p>Aktiv kupon kodu ödəniş mərhələsində tətbiq edilə bilər.</p></details>
      <div class="db-cart-summary-row"><span>Ara cəm</span><strong>${formatMoney(total)}</strong></div>
      <div class="db-cart-delivery-row">
        <span>Çatdırılma</span>
        <label><i aria-hidden="true"></i><span>Sabit tarif:<small>Bütün sifarişlər üçün sabit çatdırılma</small></span><strong>Pulsuz</strong></label>
      </div>
      <div class="db-cart-estimated"><span>Təxmini yekun</span><strong>${formatMoney(total)}</strong></div>
      <button class="db-cart-checkout-trigger" type="button" data-open-checkout>SİFARİŞİ TAMAMLA</button>
    </aside>
  </div>${checkoutForm(total)}`;
  hydrateCartDetails(items);
}

async function resolveCheckoutItems(items) {
  return Promise.all(items.map(async (item) => {
    if (item.listingId && item.variantId) return { listingId: item.listingId, variantId: item.variantId, quantity: Number(item.quantity || 1) };
    const response = await fetch(`/api/v1/public/products/${encodeURIComponent(item.slug)}`, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`${item.title} artıq satışda deyil.`);
    const { data } = await response.json();
    const variantId = data?.variants?.[0]?.id;
    if (!data?.id || !variantId) throw new Error(`${item.title} üçün aktiv variant tapılmadı.`);
    return { listingId: data.id, variantId, quantity: Number(item.quantity || 1) };
  }));
}

async function submitCheckout(form) {
  const button = form.querySelector('button[type="submit"]');
  const status = form.querySelector('[data-checkout-status]');
  const items = readCart();
  if (!items.length) return renderCart();
  button.disabled = true;
  button.textContent = 'Sifariş yaradılır…';
  status.textContent = '';
  try {
    const fields = new FormData(form);
    const checkoutItems = await resolveCheckoutItems(items);
    const customerName = String(fields.get('customerName') || '').trim();
    const customerPhone = String(fields.get('customerPhone') || '').trim();
    const payload = {
      customerName,
      customerPhone,
      customerEmail: String(fields.get('customerEmail') || '').trim(),
      customerNote: String(fields.get('customerNote') || '').trim(),
      shippingAddress: { recipientName: customerName, phone: customerPhone, countryCode: 'AZ', city: String(fields.get('city') || '').trim(), addressLine1: String(fields.get('addressLine1') || '').trim() },
      items: checkoutItems
    };
    const response = await fetch('/api/v1/checkout/', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Idempotency-Key': crypto.randomUUID() }, body: JSON.stringify(payload) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result?.error?.message || result?.message || 'Sifarişi yaratmaq mümkün olmadı.');
    writeCart([]);
    const order = result.data;
    document.querySelector('[data-cart-page]').innerHTML = `<section class="page-order-success"><div>✓</div><p>SİFARİŞ QƏBUL EDİLDİ</p><h2>Təşəkkür edirik!</h2><span>Sifariş nömrəniz: <strong>${escapeHtml(order.orderNumber)}</strong></span><small>Operatorumuz sifarişi təsdiqləmək üçün sizinlə əlaqə saxlayacaq.</small><a class="page-primary" href="/magaza/">Alış-verişə davam et</a></section>`;
    toast('Sifariş uğurla yaradıldı');
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Sifarişi yaratmaq mümkün olmadı.';
    button.disabled = false;
    button.textContent = 'Yenidən cəhd et';
  }
}

function accountProductCard(item, { removable = false } = {}) {
  const product = {
    listingId: item.listingId,
    variantId: item.variantId,
    slug: item.slug,
    title: item.title,
    price: Number(item.price || 0),
    image: item.image || '/assets/wp-content/uploads/other-cat.webp'
  };
  const payload = escapeHtml(JSON.stringify(product));
  const brand = item.brand || item.vendor || 'Gündəlik Bakı';
  const sku = item.sku || String(item.slug || '').split('-').slice(0, 3).join('-').toUpperCase();
  const cartButton = item.slug
    ? `<button class="db-account-product-cart db-add-cart" type="button" data-add-cart="${payload}" aria-label="${escapeHtml(item.title)} səbətə əlavə et"><span class="db-cart-icon" aria-hidden="true"></span></button>`
    : '';
  return `<article class="db-account-product-card">
    ${removable ? `<button class="db-account-product-remove" type="button" data-remove-wishlist="${escapeHtml(item.slug)}" aria-label="${escapeHtml(item.title)} məhsulunu seçilmişlərdən çıxar"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m7 7 10 10M17 7 7 17"/></svg></button>` : ''}
    <a class="db-account-product-media db-account-product-link" href="/mehsul/${encodeURIComponent(item.slug || '')}/"><img src="${escapeHtml(item.image || '/assets/wp-content/uploads/other-cat.webp')}" alt="${escapeHtml(item.title)}" width="250" height="190" loading="lazy"></a>
    <span class="db-account-product-brand">${escapeHtml(brand)}</span>
    <p class="db-account-product-meta">SKU: ${escapeHtml(sku)}</p>
    <h2><a class="db-account-product-link" href="/mehsul/${encodeURIComponent(item.slug || '')}/">${escapeHtml(item.title)}</a></h2>
    <div class="db-account-product-bottom"><strong class="db-account-product-price">${formatMoney(item.price)}</strong>${cartButton}</div>
  </article>`;
}

function accountEmpty(message, withButton = false) {
  return `<div class="db-account-empty">${escapeHtml(message)}${withButton ? '<a class="page-primary" href="/magaza/">Məhsullara bax</a>' : ''}</div>`;
}

function renderAccountWishlist() {
  const container = document.querySelector('[data-account-wishlist]');
  if (!container) return;
  const products = window.DailyBakuCommerce?.readWishlist() || [];
  container.innerHTML = products.length
    ? `<div class="db-account-product-grid">${products.map((item) => accountProductCard(item, { removable: true })).join('')}</div>`
    : accountEmpty('Seçilmişlər siyahınız hazırda boşdur.', true);
  window.DailyBakuCommerce?.syncUI();
}

function renderAccountOrders(serverState) {
  const orders = serverState?.orders;
  if (!Array.isArray(orders)) return;
  const containers = [document.querySelector('[data-account-orders]')];
  const statusLabels = {
    pending: 'Gözləyir',
    confirmed: 'Təsdiqlənib',
    processing: 'Hazırlanır',
    shipped: 'Göndərilib',
    delivered: 'Çatdırılıb',
    cancelled: 'Ləğv edilib',
    refunded: 'Geri ödənilib'
  };
  containers.forEach((container) => {
    if (!container) return;
    if (!orders.length) {
      container.innerHTML = accountEmpty('Hələ heç bir sifariş verilməyib.', true);
      return;
    }
    container.innerHTML = orders.map((order) => {
      const date = new Intl.DateTimeFormat('az-AZ', { dateStyle: 'medium' }).format(new Date(order.placedAt));
      const localizedStatus = statusLabels[order.status] || order.status;
      const heading = `Sifariş №${order.orderNumber}`;
      const items = Array.isArray(order.items) ? order.items : [];
      return `<section class="db-account-order">
        <div class="db-account-order-head"><strong>${escapeHtml(heading)}</strong><span>${escapeHtml(date)} · ${escapeHtml(localizedStatus)} · ${formatMoney(order.grandTotal)}</span></div>
        ${items.length ? `<div class="db-account-product-grid">${items.map((item) => accountProductCard(item)).join('')}</div>` : accountEmpty('Bu sifarişdə göstəriləcək məhsul yoxdur.')}
      </section>`;
    }).join('');
    window.DailyBakuCommerce?.syncUI();
  });
}

function fillForm(form, values) {
  if (!form || !values) return;
  Object.entries(values).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field && 'value' in field && value !== null && value !== undefined) field.value = String(value);
  });
}

function renderAccountProfile(serverState) {
  const profile = serverState?.profile;
  if (!profile) return;
  const displayName = profile.displayName || profile.firstName || 'Qonaq';
  document.querySelectorAll('[data-account-name]').forEach((element) => { element.textContent = displayName; });
  const form = document.querySelector('[data-account-profile-form]');
  fillForm(form, profile);
  if (form && !profile.authenticated) {
    form.querySelectorAll('input[type="password"]').forEach((input) => {
      input.disabled = true;
      input.placeholder = 'Şifrə dəyişmək üçün hesaba daxil olun';
    });
  }
}

function renderAccountAddresses(serverState) {
  if (!Array.isArray(serverState?.addresses)) return;
  ['billing', 'shipping'].forEach((type) => {
    const address = serverState.addresses.find((item) => item.addressType === type);
    const summary = document.querySelector(`[data-account-address-summary="${type}"]`);
    const toggle = document.querySelector(`[data-account-address-toggle="${type}"]`);
    const form = document.querySelector(`[data-account-address-form="${type}"]`);
    if (address) {
      if (summary) summary.textContent = [address.recipientName, address.phone, address.city, address.district, address.addressLine1, address.postalCode].filter(Boolean).join(', ');
      if (toggle) toggle.textContent = type === 'billing' ? 'Ödəniş ünvanını redaktə et' : 'Çatdırılma ünvanını redaktə et';
      fillForm(form, address);
    }
  });
}

function renderAccount(serverState = window.DailyBakuCommerce?.getServerState()) {
  renderAccountWishlist();
  renderAccountOrders(serverState);
  renderAccountProfile(serverState);
  renderAccountAddresses(serverState);
}

async function submitAccountProfile(form) {
  const status = form.querySelector('.db-account-form-status');
  const button = form.querySelector('button[type="submit"]');
  const fields = Object.fromEntries(new FormData(form));
  if (fields.newPassword && fields.newPassword !== fields.confirmPassword) {
    status.textContent = 'Yeni şifrələr uyğun gəlmir.';
    return;
  }
  delete fields.confirmPassword;
  button.disabled = true;
  status.textContent = 'Məlumatlar yadda saxlanılır…';
  try {
    const profile = await window.DailyBakuCommerce.saveProfile(fields);
    renderAccountProfile({ profile });
    status.textContent = 'Dəyişikliklər yadda saxlanıldı.';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Məlumatları saxlamaq mümkün olmadı.';
  } finally {
    button.disabled = false;
  }
}

async function submitAccountAddress(form) {
  const type = form.dataset.accountAddressForm;
  const status = form.querySelector('.db-account-form-status');
  const button = form.querySelector('button[type="submit"]');
  const payload = Object.fromEntries(new FormData(form));
  button.disabled = true;
  status.textContent = 'Ünvan yadda saxlanılır…';
  try {
    const addresses = await window.DailyBakuCommerce.saveAddress(type, payload);
    const server = { ...(window.DailyBakuCommerce.getServerState() || {}), addresses };
    renderAccountAddresses(server);
    form.hidden = true;
    status.textContent = '';
  } catch (error) {
    status.textContent = error instanceof Error ? error.message : 'Ünvanı saxlamaq mümkün olmadı.';
  } finally {
    button.disabled = false;
  }
}

const pageMenuTimers = new WeakMap();
const pageMenuReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

function resetPageDrillDown(navigation, animateReturn = false) {
  const root = navigation?.querySelector('.page-navigation-root');
  if (!root) return;
  const activeTimer = pageMenuTimers.get(root);
  if (activeTimer) window.clearTimeout(activeTimer);
  root.classList.remove('is-drilled', 'is-returning');
  root.querySelectorAll(':scope > .page-navigation-item').forEach((entry) => {
    const submenu = entry.querySelector(':scope > .page-submenu');
    entry.classList.remove('is-open', 'is-closing');
    entry.querySelector(':scope > a')?.setAttribute('aria-expanded', 'false');
    if (submenu) {
      submenu.hidden = true;
      submenu.setAttribute('aria-hidden', 'true');
    }
    if (entry.contains(document.activeElement)) document.activeElement?.blur();
  });
  if (animateReturn && !pageMenuReducedMotion.matches) {
    root.classList.add('is-returning');
    const timer = window.setTimeout(() => root.classList.remove('is-returning'), 280);
    pageMenuTimers.set(root, timer);
  }
}

function selectPageMenuTab(navigation, selectedTab) {
  navigation.dataset.mobileMenuTab = selectedTab;
  navigation.querySelectorAll('[data-page-menu-tab]').forEach((button) => {
    const selected = button.dataset.pageMenuTab === selectedTab;
    button.classList.toggle('is-active', selected);
    button.setAttribute('aria-selected', String(selected));
  });
  resetPageDrillDown(navigation);
}

document.addEventListener('click', (event) => {
  const navigationParent = event.target.closest('.page-navigation-item > a');
  if (navigationParent && window.matchMedia('(max-width: 1023px)').matches) {
    const navigation = navigationParent.closest('.page-navigation');
    if (navigation?.dataset.mobileMenuTab === 'navigation') {
      const item = navigationParent.closest('.page-navigation-item');
      const root = item?.parentElement;
      if (item && root?.classList.contains('page-navigation-root') && item.querySelector(':scope > .page-submenu')) {
        event.preventDefault();
        if (item.classList.contains('is-closing')) return;
        const returning = item.classList.contains('is-open');
        if (returning) {
          navigationParent.setAttribute('aria-expanded', 'false');
          item.classList.add('is-closing');
          const timer = window.setTimeout(() => resetPageDrillDown(navigation, true), pageMenuReducedMotion.matches ? 0 : 210);
          pageMenuTimers.set(root, timer);
        } else {
          resetPageDrillDown(navigation);
          const submenu = item.querySelector(':scope > .page-submenu');
          root.classList.add('is-drilled');
          item.classList.add('is-open');
          navigationParent.setAttribute('aria-expanded', 'true');
          if (submenu) {
            submenu.hidden = false;
            submenu.setAttribute('aria-hidden', 'false');
          }
        }
      }
    }
  }
  const menuTab = event.target.closest('[data-page-menu-tab]');
  if (menuTab) {
    const navigation = menuTab.closest('.page-navigation');
    selectPageMenuTab(navigation, menuTab.dataset.pageMenuTab);
  }
  const menu = event.target.closest('.page-menu-toggle');
  if (menu) {
    const navigation = document.querySelector('.page-navigation');
    const open = navigation.classList.toggle('open');
    menu.setAttribute('aria-expanded', String(open));
    if (open) selectPageMenuTab(navigation, 'navigation');
  }
  const mobileSearch = event.target.closest('[data-mobile-search]');
  if (mobileSearch) {
    event.preventDefault();
    const form = document.querySelector('.page-search');
    const open = form.classList.toggle('is-mobile-open');
    if (open) form.querySelector('input')?.focus();
  }
  const quickViewButton = event.target.closest('[data-quick-view]');
  if (quickViewButton) openQuickView(quickViewButton);
  const remove = event.target.closest('[data-remove-cart]');
  if (remove) {
    writeCart(readCart().filter((item) => item.slug !== remove.dataset.removeCart));
    toast('Məhsul səbətdən silindi');
    return;
  }
  const quantity = event.target.closest('[data-cart-quantity]');
  if (quantity) {
    const cart = readCart();
    const item = cart.find((entry) => entry.slug === quantity.dataset.cartQuantity);
    if (item) {
      item.quantity = Math.max(1, Math.min(99, Number(item.quantity || 1) + Number(quantity.dataset.delta || 0)));
      writeCart(cart);
    }
    return;
  }
  const checkoutTrigger = event.target.closest('[data-open-checkout]');
  if (checkoutTrigger) {
    const form = document.querySelector('[data-checkout-form]');
    if (form) {
      form.hidden = false;
      form.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
      window.setTimeout(() => form.querySelector('input')?.focus(), 350);
    }
    return;
  }
  const removeWishlist = event.target.closest('[data-remove-wishlist]');
  if (removeWishlist) {
    window.DailyBakuCommerce?.removeWishlist(removeWishlist.dataset.removeWishlist);
    renderAccountWishlist();
    toast('Məhsul seçilmişlərdən çıxarıldı');
  }
  const addressToggle = event.target.closest('[data-account-address-toggle]');
  if (addressToggle) {
    const form = document.querySelector(`[data-account-address-form="${addressToggle.dataset.accountAddressToggle}"]`);
    if (form) {
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('input:not([type="hidden"])')?.focus();
    }
  }
  const logout = event.target.closest('[data-account-logout]');
  if (logout) {
    event.preventDefault();
    void Promise.resolve(window.DailyBakuCommerce?.logout()).finally(() => window.location.assign('/'));
  }
});

document.addEventListener('submit', (event) => {
  const form = event.target.closest('[data-checkout-form]');
  if (form) {
    event.preventDefault();
    void submitCheckout(form);
    return;
  }
  const profile = event.target.closest('[data-account-profile-form]');
  if (profile) {
    event.preventDefault();
    void submitAccountProfile(profile);
    return;
  }
  const address = event.target.closest('[data-account-address-form]');
  if (address) {
    event.preventDefault();
    void submitAccountAddress(address);
  }
});

document.addEventListener('dailybaku:customer-state', (event) => renderAccount(event.detail));
document.addEventListener('dailybaku:commerce-change', () => {
  renderCart();
  renderAccountWishlist();
});
updateCartCount();
synchronizeWishlistButtons();
renderCart();
renderAccount();
