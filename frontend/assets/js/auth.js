(() => {
  'use strict';

  function csrfToken() {
    const part = document.cookie.split('; ').find((item) => item.startsWith('db_csrf=') || item.startsWith('__Host-db_csrf='));
    return part ? decodeURIComponent(part.slice(part.indexOf('=') + 1)) : '';
  }

  async function authApi(path, payload, method = 'POST') {
    const token = csrfToken();
    const response = await fetch(`/api/v1/auth${path}`, {
      method,
      credentials: 'same-origin',
      headers: {
        Accept: 'application/json',
        ...(payload ? { 'Content-Type': 'application/json' } : {}),
        ...(token && method !== 'GET' ? { 'X-CSRF-Token': token } : {})
      },
      ...(payload ? { body: JSON.stringify(payload) } : {})
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body?.error?.details?.[0]?.message || body?.error?.message || 'Əməliyyatı yerinə yetirmək mümkün olmadı.');
    return body.data;
  }

  function setBusy(form, busy, busyLabel = 'Gözləyin…') {
    const button = form.querySelector('button[type="submit"],input[type="submit"]');
    if (!button) return;
    if (!button.dataset.originalLabel) button.dataset.originalLabel = 'value' in button ? button.value : button.textContent;
    button.disabled = busy;
    if ('value' in button) button.value = busy ? busyLabel : button.dataset.originalLabel;
    else button.textContent = busy ? busyLabel : button.dataset.originalLabel;
  }

  function statusTarget(form) {
    let status = form.querySelector('.db-auth-status');
    if (!status) {
      status = document.createElement('p');
      status.className = 'db-auth-status';
      status.setAttribute('role', 'status');
      status.setAttribute('aria-live', 'polite');
      form.append(status);
    }
    return status;
  }

  const AZ_PHONE_PATTERN = /^\+994 \d{2} \d{3} \d{2} \d{2}$/;
  const AZ_PHONE_ERROR = 'Telefon nömrəsini +994 12 345 67 89 formatında tam daxil edin.';

  function formatAzerbaijanPhone(value) {
    let digits = String(value || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.startsWith('994')) digits = digits.slice(3);
    if (digits.startsWith('0')) digits = digits.slice(1);
    digits = digits.slice(0, 9);
    if (!digits) return '';

    const groups = [digits.slice(0, 2), digits.slice(2, 5), digits.slice(5, 7), digits.slice(7, 9)].filter(Boolean);
    return `+994 ${groups.join(' ')}`;
  }

  function validateAzerbaijanPhone(field) {
    const valid = !field.value || AZ_PHONE_PATTERN.test(field.value);
    field.setCustomValidity(valid ? '' : AZ_PHONE_ERROR);
    return valid;
  }

  function initializePhoneField(field) {
    if (field.dataset.azPhoneReady) return;
    field.dataset.azPhoneReady = 'true';
    field.inputMode = 'numeric';
    field.maxLength = 17;
    field.placeholder = '+994 12 345 67 89';
    field.title = AZ_PHONE_ERROR;
    if (field.value) field.value = formatAzerbaijanPhone(field.value);
    validateAzerbaijanPhone(field);

    field.addEventListener('keydown', (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey || event.key.length !== 1) return;
      if (!/\d/.test(event.key)) event.preventDefault();
    });
    field.addEventListener('input', () => {
      field.value = formatAzerbaijanPhone(field.value);
      validateAzerbaijanPhone(field);
      field.setSelectionRange(field.value.length, field.value.length);
    });
    field.addEventListener('blur', () => validateAzerbaijanPhone(field));
  }

  function initializeHeaderLoginForms() {
    document.querySelectorAll('.et__login form').forEach((form) => {
      form.dataset.authForm = 'login';
      form.noValidate = true;
      const email = form.querySelector('[name="log"],[name="email"]');
      const password = form.querySelector('[name="pwd"],[name="password"]');
      if (email) {
        email.name = 'email';
        email.required = true;
      }
      if (password) {
        password.name = 'password';
        password.required = true;
        password.minLength = 8;
      }
      const submit = form.querySelector('input[type="submit"]');
      if (submit) submit.value = 'DAXİL OL';
      statusTarget(form);
    });
  }

  async function completeAuthentication(preferredPath = '/hesabim/') {
    await window.DailyBakuCommerce?.refreshCustomerState?.();
    let destination = preferredPath;
    try {
      const actor = await authApi('/me', null, 'GET');
      if (actor?.roles?.some((role) => role === 'vendor_owner' || role === 'vendor_staff')) destination = '/satici-paneli/';
      else if (actor?.permissions?.includes('dashboard.read')) destination = '/admin/';
    } catch {
      // The customer session can still continue even if the actor summary is unavailable.
    }
    window.location.assign(destination);
  }

  async function submitAuthForm(form) {
    if (!form.reportValidity()) return;
    const type = form.dataset.authForm;
    const values = Object.fromEntries(new FormData(form));
    const status = statusTarget(form);
    status.classList.remove('is-error', 'is-success');
    status.textContent = '';
    if (values.password && values.confirmPassword && values.password !== values.confirmPassword) {
      status.textContent = 'Şifrələr uyğun gəlmir.';
      status.classList.add('is-error');
      return;
    }
    delete values.confirmPassword;
    delete values.terms;
    delete values.remember;
    setBusy(form, true);
    try {
      if (type === 'login') {
        await authApi('/login', values);
        status.textContent = 'Uğurla daxil oldunuz. Yönləndirilirsiniz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'register') {
        if (!values.phone) delete values.phone;
        await authApi('/register', values);
        status.textContent = 'Hesabınız yaradıldı. Yönləndirilirsiniz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'forgot-password') {
        const result = await authApi('/forgot-password', values);
        status.innerHTML = `E-poçt sistemdə mövcuddursa, bərpa keçidi göndərildi.${result?.previewUrl ? ` <a href="${result.previewUrl}">Test keçidini aç</a>` : ''}`;
        status.classList.add('is-success');
        form.reset();
      } else if (type === 'reset-password') {
        await authApi('/reset-password', values);
        status.textContent = 'Şifrəniz yeniləndi. Hesabınıza daxil olursunuz…';
        status.classList.add('is-success');
        await completeAuthentication('/hesabim/');
      } else if (type === 'accept-invite') {
        await authApi('/accept-invite', values);
        status.textContent = 'Hesab aktivləşdirildi. İdarəetmə paneli açılır…';
        status.classList.add('is-success');
        await completeAuthentication('/admin/');
      }
    } catch (error) {
      status.textContent = error instanceof Error ? error.message : 'Əməliyyatı yerinə yetirmək mümkün olmadı.';
      status.classList.add('is-error');
    } finally {
      setBusy(form, false);
    }
  }

  async function initializeTokenForm(form) {
    const token = new URLSearchParams(location.search).get('token') || '';
    const field = form.elements.namedItem('token');
    const copy = form.querySelector('[data-auth-token-copy]');
    if (field && 'value' in field) field.value = token;
    if (!token) {
      if (copy) copy.textContent = 'Təhlükəsiz keçid tapılmadı.';
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
      return;
    }
    try {
      const detail = await authApi(`/action-token/${encodeURIComponent(token)}`, null, 'GET');
      if (copy) copy.textContent = `${detail.firstName} ${detail.lastName} · ${detail.email}`;
    } catch (error) {
      if (copy) copy.textContent = error instanceof Error ? error.message : 'Keçid etibarsızdır.';
      form.querySelector('button[type="submit"]')?.setAttribute('disabled', '');
    }
  }

  function updateAuthUI(server) {
    const authenticated = Boolean(server?.profile?.authenticated);
    const displayName = server?.profile?.displayName || server?.profile?.firstName || 'Hesabım';
    document.querySelectorAll('[data-auth-link]').forEach((link) => {
      link.href = authenticated ? '/hesabim/' : '/giris/';
      const label = link.querySelector('span');
      if (label && link.classList.contains('page-login')) label.textContent = authenticated ? 'Hesabım' : 'Daxil ol';
    });
    document.documentElement.classList.toggle('db-authenticated', authenticated);
    document.documentElement.classList.toggle('db-guest', !authenticated);
    document.querySelectorAll('[data-account-logout]').forEach((button) => { button.hidden = !authenticated; });
    document.querySelectorAll('.logged-out.info-wrap .info').forEach((info) => {
      const lines=info.querySelectorAll('span');
      if(lines[0])lines[0].textContent=authenticated?`Salam, ${displayName}`:'Salam, qonaq';
      if(lines[1])lines[1].textContent=authenticated?'Hesab və sifarişlərinizi idarə edin':'Daha yaxşı təcrübə üçün daxil olun';
    });
    document.querySelectorAll('.et__login').forEach((widget)=>{
      widget.querySelector('.my-account-text')?.replaceChildren(document.createTextNode('Hesabım'));
      if(authenticated){
        widget.querySelector('.login-text')?.replaceChildren(document.createTextNode(displayName));
        const content=widget.querySelector('.widget_reglog .logged-out');
        if(content&&!content.dataset.authenticated){content.dataset.authenticated='true';content.innerHTML=`<h4>${displayName}</h4><div class="form-links"><a href="/hesabim/">İdarə paneli</a><a href="/hesabim/sifarisler/">Sifarişlər</a><a href="/hesabim/secilmisler/">Seçilmişlər</a><button type="button" data-account-logout>Çıxış</button></div>`;}
      }
    });
  }

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('[data-auth-form]');
    if (form) {
      event.preventDefault();
      void submitAuthForm(form);
      return;
    }
    const legacy = event.target.closest('.et__login form');
    if (legacy) {
      event.preventDefault();
      if (!legacy.reportValidity()) return;
      const email = legacy.querySelector('[name="log"],[name="email"]')?.value?.trim() || '';
      const password = legacy.querySelector('[name="pwd"],[name="password"]')?.value || '';
      const status = statusTarget(legacy);
      setBusy(legacy, true);
      authApi('/login', { email, password }).then(() => completeAuthentication('/hesabim/')).catch((error) => {
        status.textContent = error instanceof Error ? error.message : 'Daxil olmaq mümkün olmadı.';
        status.classList.add('is-error');
      }).finally(() => setBusy(legacy, false));
    }
  });

  document.addEventListener('click',(event)=>{
    const logout=event.target.closest('[data-account-logout]');
    if(!logout)return;
    event.preventDefault();logout.disabled=true;
    void Promise.resolve(window.DailyBakuCommerce?.logout?.()).finally(()=>window.location.assign('/'));
  });

  document.addEventListener('dailybaku:customer-state', (event) => updateAuthUI(event.detail));
  initializeHeaderLoginForms();
  document.querySelectorAll('[data-az-phone]').forEach(initializePhoneField);
  document.querySelectorAll('[data-auth-form="reset-password"],[data-auth-form="accept-invite"]').forEach((form) => void initializeTokenForm(form));
})();
