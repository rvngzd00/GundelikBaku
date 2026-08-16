(() => {
  'use strict';

  let categoryCache = [];
  let scheduled = false;
  const mobileStates = new WeakMap();
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const hrefFor = (category) => {
    const path = Array.isArray(category.path_slugs) && category.path_slugs.length
      ? category.path_slugs
      : [category.slug];
    return `/magaza/${path.filter(Boolean).map(encodeURIComponent).join('/')}/`;
  };

  const categoryTree = (categories) => {
    const active = categories.filter((item) => item?.id && item?.name && Number(item.depth) <= 2);
    const children = new Map();
    active.forEach((item) => {
      const parent = item.parent_id || '';
      if (!children.has(parent)) children.set(parent, []);
      children.get(parent).push(item);
    });
    return { roots: children.get('') || [], children };
  };

  const textLink = (category, className = '') => {
    const anchor = document.createElement('a');
    anchor.href = hrefFor(category);
    if (className) anchor.className = className;
    const label = document.createElement('span');
    label.className = className === 'mi-link' ? 'txt' : 'db-store-link-label';
    label.textContent = category.name;
    anchor.append(label);
    return anchor;
  };

  const flyoutList = (items, children, level, className) => {
    const list = document.createElement('ul');
    list.className = `${className} db-store-flyout db-store-level-${level}`;
    items.forEach((item) => {
      const nested = children.get(item.id) || [];
      const entry = document.createElement('li');
      entry.className = `db-store-flyout-item${nested.length ? ' has-children' : ''}`;
      const anchor = textLink(item, className === 'sub-menu' ? 'mi-link' : '');
      if (nested.length) {
        anchor.setAttribute('aria-haspopup', 'true');
        const arrow = document.createElement('i');
        arrow.className = 'db-store-menu-chevron';
        arrow.setAttribute('aria-hidden', 'true');
        anchor.append(arrow);
        entry.append(anchor, flyoutList(nested, children, level + 1, className));
      } else {
        entry.append(anchor);
      }
      list.append(entry);
    });
    return list;
  };

  const replaceDesktopMenu = (container, roots, children, indexMenu) => {
    if (!container) return;
    const storeAnchor = [...container.querySelectorAll(':scope > li > a')]
      .find((anchor) => new URL(anchor.href, location.origin).pathname === '/magaza/');
    const storeItem = storeAnchor?.parentElement;
    if (!storeItem) return;
    const current = storeItem.querySelector(':scope > .db-store-flyout');
    if (current?.dataset.taxonomyCount === String(categoryCache.length)) return;
    storeItem.querySelector(':scope > ul')?.remove();
    storeItem.classList.add('menu-item-has-children', 'db-store-menu-root');
    storeAnchor.setAttribute('aria-haspopup', 'true');
    const menu = flyoutList(roots, children, 0, indexMenu ? 'sub-menu' : 'page-submenu');
    menu.dataset.taxonomyCount = String(categoryCache.length);
    menu.setAttribute('aria-label', 'Mağaza ana və alt kateqoriyaları');
    storeItem.append(menu);
  };

  const categoryImage = (category) => {
    const shell = document.createElement('span');
    shell.className = 'db-mobile-taxonomy-image';
    const image = document.createElement('img');
    image.src = category.image_url || '/assets/wp-content/uploads/other-cat.webp';
    image.alt = '';
    image.width = 42;
    image.height = 42;
    image.loading = 'lazy';
    image.decoding = 'async';
    shell.append(image);
    return shell;
  };

  const taxonomyChevron = (back = false) => {
    const arrow = document.createElement('i');
    arrow.className = `db-mobile-taxonomy-chevron${back ? ' is-back' : ''}`;
    arrow.setAttribute('aria-hidden', 'true');
    return arrow;
  };

  const mobileEntry = (category, children, level) => {
    const nested = children.get(category.id) || [];
    const entry = document.createElement('li');
    entry.className = `db-mobile-taxonomy-entry db-mobile-taxonomy-level-${level}`;
    const control = nested.length || level === 0 ? document.createElement('button') : textLink(category);
    control.className = 'db-mobile-taxonomy-control';
    if (control instanceof HTMLButtonElement) {
      control.type = 'button';
      control.dataset.taxonomyOpen = category.id;
      control.setAttribute('aria-label', `${category.name} kateqoriyasını aç`);
    }
    if (level === 0) control.append(categoryImage(category));
    const label = control.querySelector('.db-store-link-label') || document.createElement('span');
    label.className = 'db-mobile-taxonomy-title';
    label.textContent = category.name;
    if (!label.parentElement) control.append(label);
    if (control instanceof HTMLButtonElement) control.append(taxonomyChevron());
    entry.append(control);
    return entry;
  };

  const renderMobileLevel = (container, state, parentId = '', direction = 'forward') => {
    const parent = parentId ? state.index.get(parentId) : null;
    const items = parentId ? state.children.get(parentId) || [] : state.roots;
    const level = parent ? Number(parent.depth) + 1 : 0;
    const fragment = document.createDocumentFragment();

    if (parent) {
      const heading = document.createElement('li');
      heading.className = 'db-mobile-taxonomy-heading';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'db-mobile-taxonomy-back';
      back.dataset.taxonomyBack = parent.parent_id || '';
      back.append(taxonomyChevron(true));
      const title = document.createElement('span');
      title.textContent = parent.name;
      back.append(title);
      heading.append(back);
      fragment.append(heading);

      const allEntry = document.createElement('li');
      allEntry.className = 'db-mobile-taxonomy-all-row';
      const all = textLink(parent);
      all.classList.add('db-mobile-taxonomy-all');
      all.querySelector('span').textContent = `${parent.name}: bütün məhsullar`;
      all.append(taxonomyChevron());
      allEntry.append(all);
      fragment.append(allEntry);
    }

    items.forEach((item) => fragment.append(mobileEntry(item, state.children, level)));
    if (!items.length) {
      const empty = document.createElement('li');
      empty.className = 'db-mobile-taxonomy-empty';
      empty.textContent = 'Bu kateqoriyada alt kateqoriya yoxdur.';
      fragment.append(empty);
    }

    container.replaceChildren(fragment);
    container.dataset.taxonomyLevel = String(level);
    container.classList.remove('db-taxonomy-forward', 'db-taxonomy-back');
    void container.offsetWidth;
    container.classList.add(direction === 'back' ? 'db-taxonomy-back' : 'db-taxonomy-forward');
    window.setTimeout(() => container.classList.remove('db-taxonomy-forward', 'db-taxonomy-back'), reducedMotion.matches ? 0 : 330);
    state.parentId = parentId;
  };

  const replaceMobileMenu = (container, roots, children) => {
    if (!container) return;
    const rendered = container.querySelector(':scope > .db-mobile-taxonomy-entry, :scope > .db-mobile-taxonomy-heading');
    if (rendered && container.dataset.taxonomyReady === 'true' && container.dataset.taxonomyCount === String(categoryCache.length)) return;
    container.classList.add('db-mobile-taxonomy');
    container.dataset.taxonomyCount = String(categoryCache.length);
    container.dataset.taxonomyReady = 'true';
    const state = { roots, children, index: new Map(categoryCache.map((item) => [item.id, item])), parentId: '' };
    mobileStates.set(container, state);
    if (!container.dataset.taxonomyEvents) {
      container.dataset.taxonomyEvents = 'true';
      container.addEventListener('click', (event) => {
        if (!(event.target instanceof Element)) return;
        const open = event.target.closest('[data-taxonomy-open]');
        const back = event.target.closest('[data-taxonomy-back]');
        if (!open && !back) return;
        event.preventDefault();
        const currentState = mobileStates.get(container);
        if (!currentState) return;
        renderMobileLevel(container, currentState, open?.dataset.taxonomyOpen || back?.dataset.taxonomyBack || '', back ? 'back' : 'forward');
      });
    }
    renderMobileLevel(container, state, '', 'back');
  };

  const resetMobileMenus = () => {
    document.querySelectorAll('.db-mobile-taxonomy').forEach((container) => {
      const state = mobileStates.get(container);
      if (state && state.parentId) renderMobileLevel(container, state, '', 'back');
    });
  };

  function render(categories = categoryCache) {
    if (!Array.isArray(categories) || !categories.length) return;
    categoryCache = categories;
    const { roots, children } = categoryTree(categoryCache);
    if (!roots.length) return;
    replaceDesktopMenu(document.querySelector('#menu-desktop-menu-with-categories'), roots, children, true);
    replaceDesktopMenu(document.querySelector('.page-navigation-root'), roots, children, false);
    replaceMobileMenu(document.querySelector('#menu-mobile-store'), roots, children);
    replaceMobileMenu(document.querySelector('.page-store-navigation'), roots, children);
  }

  function scheduleRender() {
    if (scheduled || !categoryCache.length) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      render();
    });
  }

  globalThis.DailyBakuCatalogNavigation = { render, get categories() { return categoryCache; } };
  new MutationObserver(scheduleRender).observe(document.body, { childList: true, subtree: true });
  document.addEventListener('click', (event) => {
    if (!(event.target instanceof Element)) return;
    const tab = event.target.closest('.mobile-tabset > .mobile-tab-item, [data-page-menu-tab]');
    if (tab && !String(tab.textContent || '').trim().includes('Mağaza')) resetMobileMenus();
  });

  fetch('/api/v1/public/home', { headers: { Accept: 'application/json' } })
    .then((response) => response.ok ? response.json() : Promise.reject(new Error('Kateqoriyalar yüklənmədi')))
    .then((payload) => render(payload?.data?.categories || []))
    .catch(() => { /* Statik naviqasiya şəbəkə xətasında işləməyə davam edir. */ });
})();
