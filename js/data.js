/* ==========================================================
   STALKER — Data & Core Services
   Clean database mode: ready for user's real locations
   ========================================================== */

const LOCATIONS = [];
const SUBMISSIONS = [];

const DIFFICULTY_LABELS = {
  1: 'Лёгкий',
  2: 'Умеренный',
  3: 'Средний',
  4: 'Сложный',
  5: 'Экстрем',
};

const TYPE_LABELS = {
  bunker:     'Бункер',
  abandoned:  'Заброшка',
  underground: 'Подземка',
};

// API helper
const API = {
  baseUrl: '/api',

  async request(path, options = {}) {
    const token = localStorage.getItem('stalker_token');
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const url = path.startsWith('/api') ? path : (this.baseUrl + path);
    const res = await fetch(url, { ...options, headers });
    
    let data;
    try {
      data = await res.json();
    } catch (e) {
      if (!res.ok) {
        throw new Error(`Ошибка сервера (${res.status}). Попробуйте позже.`);
      }
      throw new Error('Некорректный ответ сервера');
    }

    if (!res.ok) throw new Error(data.error || 'Ошибка сервера');
    return data;
  },

  get(path)         { return this.request(path); },
  post(path, body)  { return this.request(path, { method: 'POST',   body: JSON.stringify(body) }); },
  put(path, body)   { return this.request(path, { method: 'PUT',    body: JSON.stringify(body) }); },
  del(path)         { return this.request(path, { method: 'DELETE' }); },
};

// Auth state
const Auth = {
  getUser()  { try { return JSON.parse(localStorage.getItem('stalker_user')); } catch { return null; } },
  getToken() { return localStorage.getItem('stalker_token'); },
  isLoggedIn(){ return !!this.getToken(); },
  isAdmin()  { const u = this.getUser(); return u && u.role === 'admin'; },

  async login(username, password, lat = null, lng = null) {
    const data = await API.post('/auth/login', { username, password, lat, lng });
    localStorage.setItem('stalker_token', data.token);
    localStorage.setItem('stalker_user',  JSON.stringify(data.user));
    return data.user;
  },

  async register(username, password, email, callsign, phone, code, lat = null, lng = null) {
    const data = await API.post('/auth/register', { username, password, email, callsign, phone, code, lat, lng });
    if (data && data.token) {
      localStorage.setItem('stalker_token', data.token);
      localStorage.setItem('stalker_user',  JSON.stringify(data.user));
    }
    return data;
  },

  async syncLocation() {
    if (!this.isLoggedIn() || this.isAdmin()) return;
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          try {
            await API.post('/user/location', {
              lat: pos.coords.latitude,
              lng: pos.coords.longitude
            });
          } catch (e) { /* ignore */ }
        },
        () => {},
        { enableHighAccuracy: false, timeout: 5000 }
      );
    }
  },

  logout() {
    localStorage.removeItem('stalker_token');
    localStorage.removeItem('stalker_user');
    window.location.href = '/auth.html';
  },
};

// Toast notifications
const Toast = {
  container: null,

  init() {
    this.container = document.getElementById('toast-container');
    if (!this.container) {
      this.container = document.createElement('div');
      this.container.id = 'toast-container';
      document.body.appendChild(this.container);
    }
  },

  show(message, type = 'default', duration = 3500) {
    if (!this.container) this.init();
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    this.container.appendChild(el);

    setTimeout(() => {
      el.classList.add('removing');
      setTimeout(() => el.remove(), 250);
    }, duration);
  },

  success(msg) { this.show(msg, 'success'); },
  error(msg)   { this.show(msg, 'error'); },
  warning(msg) { this.show(msg, 'warning'); },
  info(msg)    { this.show(msg, 'info'); },
};

Toast.init();

/* ── Global Navigation & Mobile Drawer ───────────────────── */
function initGlobalNav() {
  const burgerBtn = document.getElementById('burger-toggle-btn');
  const drawer = document.getElementById('mobile-nav-drawer');
  const backdrop = document.getElementById('mobile-drawer-backdrop');
  const closeBtn = document.getElementById('mobile-drawer-close');

  function openDrawer() {
    if (drawer) drawer.classList.add('open');
    if (backdrop) backdrop.classList.add('active');
    if (burgerBtn) burgerBtn.classList.add('open');
    document.body.style.overflow = 'hidden';
  }

  function closeDrawer() {
    if (drawer) drawer.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    if (burgerBtn) burgerBtn.classList.remove('open');
    document.body.style.overflow = '';
  }

  if (burgerBtn) {
    burgerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (drawer && drawer.classList.contains('open')) {
        closeDrawer();
      } else {
        openDrawer();
      }
    });
  }

  if (closeBtn) closeBtn.addEventListener('click', closeDrawer);
  if (backdrop) backdrop.addEventListener('click', closeDrawer);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeDrawer();
  });

  // Highlight active link in mobile drawer based on URL
  const path = window.location.pathname;
  const links = {
    '/': 'mob-nav-map',
    '/index.html': 'mob-nav-map',
    '/catalog.html': 'mob-nav-catalog',
    '/submit.html': 'mob-nav-submit',
    '/admin.html': 'mob-nav-admin'
  };
  Object.values(links).forEach(id => {
    const el = document.getElementById(id);
    if (el) el.classList.remove('active');
  });
  const currentLinkId = links[path] || (path.includes('catalog') ? 'mob-nav-catalog' : (path.includes('submit') ? 'mob-nav-submit' : (path.includes('admin') ? 'mob-nav-admin' : 'mob-nav-map')));
  const activeEl = document.getElementById(currentLinkId);
  if (activeEl) activeEl.classList.add('active');

  // Render User Profile & Auth in mobile drawer
  const user = Auth.getUser();
  const drawerUser = document.getElementById('mobile-drawer-user');
  const drawerFooter = document.getElementById('mobile-drawer-footer');
  const mobAdminLink = document.getElementById('mob-nav-admin');
  const navAdminLink = document.getElementById('nav-admin');

  if (user) {
    if (mobAdminLink && user.role === 'admin') mobAdminLink.style.display = 'flex';
    if (navAdminLink && user.role === 'admin') navAdminLink.style.display = 'flex';

    if (drawerUser) {
      drawerUser.innerHTML = `
        <div style="display:flex; align-items:center; gap:12px;">
          <div class="avatar-btn" style="width:42px; height:42px; font-size:16px; font-weight:700; flex-shrink:0;">
            ${(user.callsign || user.username || 'U')[0].toUpperCase()}
          </div>
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:15px; color:var(--text-primary); text-overflow:ellipsis; overflow:hidden; white-space:nowrap;">
              ${user.callsign || user.username}
            </div>
            <div style="font-size:12px; color:var(--text-tertiary); margin-top:2px;">
              ${user.role === 'admin' ? '<span style="color:#60A5FA;">🛡 Администратор СБ</span>' : '🧭 Следопыт'}
            </div>
          </div>
        </div>
      `;
    }

    if (drawerFooter) {
      drawerFooter.innerHTML = `
        <button class="btn btn-secondary btn-block" id="mob-btn-logout" style="display:flex; align-items:center; justify-content:center; gap:8px;">
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Выйти из системы
        </button>
      `;
      const mobLogout = document.getElementById('mob-btn-logout');
      if (mobLogout) mobLogout.addEventListener('click', () => Auth.logout());
    }
  } else {
    if (drawerUser) {
      drawerUser.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div style="font-size:11px; color:var(--text-tertiary); text-transform:uppercase; letter-spacing:0.06em; font-weight:700;">Вход в сеть STALKER</div>
          <div style="display:flex; gap:8px;">
            <a href="/auth.html" class="btn btn-secondary btn-sm" style="flex:1; text-align:center; justify-content:center;">Войти</a>
            <a href="/auth.html?mode=register" class="btn btn-primary btn-sm" style="flex:1; text-align:center; justify-content:center;">Регистрация</a>
          </div>
        </div>
      `;
    }
    if (drawerFooter) {
      drawerFooter.innerHTML = `
        <div style="font-size:11px; color:var(--text-tertiary); text-align:center;">STALKER Recon System · Uzbekistan</div>
      `;
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initGlobalNav);
} else {
  initGlobalNav();
}

/* ── Auth Guard ──────────────────────────────────────────── */
(function authGuard() {
  // Pages that require authentication
  const PROTECTED_PATHS = ['/', '/index.html', '/catalog.html', '/submit.html', '/admin.html', '/location.html'];

  const pathname = window.location.pathname;
  // Normalize: /index.html and / are the same
  const isProtected = PROTECTED_PATHS.some(p => pathname === p || pathname.startsWith(p + '?'));

  if (isProtected && !Auth.isLoggedIn()) {
    // Redirect to auth, preserving intended destination
    window.location.replace('/auth.html');
  }

  // Admin-only guard for admin.html
  if ((pathname === '/admin.html') && Auth.isLoggedIn() && !Auth.isAdmin()) {
    window.location.replace('/');
  }
})();

/* ── Location Guard (Minimalist Geolocation Handler) ──────── */
const LocationGuard = {
  coords: null,
  isVerified: false,

  check() {
    if (!('geolocation' in navigator)) {
      this.showBlocker('Ваш браузер или устройство не поддерживает геолокацию.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        this.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        this.isVerified = true;
        this.hideBlocker();

        if (Auth.isLoggedIn() && !Auth.isAdmin()) {
          API.post('/user/location', this.coords).catch(() => {});
        }
      },
      (err) => {
        this.coords = null;
        this.isVerified = false;
        let msg = 'Для отображения вашего положения на карте и поиска объектов разрешите доступ к местоположению.';
        if (err.code === err.PERMISSION_DENIED) {
          msg = 'Доступ к местоположению отклонён или заблокирован в браузере. Разрешите доступ в настройках страницы.';
        }
        this.showBlocker(msg);
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
    );
  },

  showBlocker(reasonText) {
    if (document.getElementById('location-guard-overlay')) {
      const msgEl = document.getElementById('location-guard-reason');
      if (msgEl) {
        msgEl.style.display = 'block';
        msgEl.textContent = reasonText;
      }
      return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'location-guard-overlay';
    overlay.className = 'location-guard-overlay';

    const isAdmin = Auth.isAdmin();
    const isTelegram = /Telegram/i.test(navigator.userAgent);

    overlay.innerHTML = `
      <div class="location-guard-card">
        <button class="location-guard-close-btn" id="btn-location-guard-close" aria-label="Закрыть">✕</button>
        
        <div class="location-guard-icon-wrap">
          <div class="location-guard-icon-circle">
            <svg width="28" height="28" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <path d="M12 2a8 8 0 0 0-8 8c0 5.25 8 12 8 12s8-6.75 8-12a8 8 0 0 0-8-8z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
          </div>
        </div>

        <div class="location-guard-badge">📍 Геолокация</div>
        
        <h2 class="location-guard-title">Доступ к геопозиции</h2>
        
        <p class="location-guard-desc">
          Для работы карты и навигации по объектам разрешите браузеру доступ к вашему местоположению.
        </p>

        <div class="location-guard-status" id="location-guard-reason" style="${reasonText ? '' : 'display:none;'}">
          ${reasonText || ''}
        </div>

        <div class="location-guard-actions">
          <button class="btn btn-primary location-guard-btn" id="btn-location-guard-request">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
            <span>Предоставить доступ</span>
          </button>

          <button class="btn btn-secondary location-guard-btn" id="btn-location-guard-open-browser" style="display:${isTelegram ? 'flex' : 'none'};">
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="10"/>
              <line x1="2" y1="12" x2="22" y2="12"/>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
            </svg>
            <span>Открыть в основном браузере (Chrome)</span>
          </button>
        </div>

        ${isAdmin ? `
          <div style="margin-top:12px;">
            <button type="button" id="btn-admin-bypass-loc" style="background:none; border:none; color:var(--text-tertiary); font-size:11px; cursor:pointer; text-decoration:underline;">
              🛡️ Продолжить без GPS (Администратор)
            </button>
          </div>
        ` : ''}

        <div class="location-guard-help">
          <div class="help-title">💡 Если окно разрешения не появилось:</div>
          <ol class="help-steps">
            <li>Вверху экрана нажмите на <b>значок 🔒 или меню ⋮</b> в строке адреса.</li>
            <li>В разделе <b>«Разрешения»</b> включите <b>«Местоположение»</b>.</li>
            <li>Затем нажмите кнопку «Предоставить доступ» снова или обновите страницу.</li>
          </ol>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    document.body.classList.add('location-guard-active');

    // Close button handler
    const closeBtn = overlay.querySelector('#btn-location-guard-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        this.hideBlocker();
      });
    }

    // Open in external browser for Telegram webviews
    const openExtBtn = overlay.querySelector('#btn-location-guard-open-browser');
    if (openExtBtn) {
      openExtBtn.addEventListener('click', () => {
        window.open(window.location.href, '_system');
      });
    }

    // Request permission button
    const reqBtn = overlay.querySelector('#btn-location-guard-request');
    if (reqBtn) {
      reqBtn.addEventListener('click', () => {
        reqBtn.disabled = true;
        reqBtn.innerHTML = `<span>Запрос разрешения у браузера...</span>`;
        
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            Toast.success('Геопозиция определена! Добро пожаловать.');
            this.coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            this.isVerified = true;
            this.hideBlocker();
            if (Auth.isLoggedIn() && !Auth.isAdmin()) {
              API.post('/user/location', this.coords).catch(() => {});
            }
          },
          (err) => {
            reqBtn.disabled = false;
            reqBtn.innerHTML = `
              <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <polygon points="3 11 22 2 13 21 11 13 3 11"/>
              </svg>
              <span>Повторить запрос разрешения</span>
            `;
            
            const reasonEl = document.getElementById('location-guard-reason');
            if (reasonEl) {
              reasonEl.style.display = 'block';
              if (err.code === err.PERMISSION_DENIED) {
                reasonEl.innerHTML = '⚠️ Доступ заблокирован браузером. Нажмите на значок 🔒 или меню ⋮ в строке адреса вверху экрана ➔ включите «Местоположение» и нажмите снова.';
              } else {
                reasonEl.innerHTML = 'Не удалось получить координаты. Проверьте, включена ли служба геолокации в настройках телефона.';
              }
            }
            
            const openBrowserBtn = document.getElementById('btn-location-guard-open-browser');
            if (openBrowserBtn) {
              openBrowserBtn.style.display = 'flex';
            }
          },
          { enableHighAccuracy: false, timeout: 15000, maximumAge: 0 }
        );
      });
    }

    if (isAdmin) {
      const bypassBtn = overlay.querySelector('#btn-admin-bypass-loc');
      if (bypassBtn) {
        bypassBtn.addEventListener('click', (e) => {
          e.preventDefault();
          this.hideBlocker();
          Toast.info('Режим СБ: допуск без передачи координат');
        });
      }
    }
  },

  hideBlocker() {
    const overlay = document.getElementById('location-guard-overlay');
    if (overlay) {
      overlay.classList.add('fade-out');
      setTimeout(() => {
        overlay.remove();
        document.body.classList.remove('location-guard-active');
      }, 250);
    }
  }
};

// Automatically enforce location check on protected pages
function initLocationGuard() {
  if (Auth.isLoggedIn() && window.location.pathname !== '/auth.html') {
    LocationGuard.check();
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initLocationGuard);
} else {
  initLocationGuard();
}
