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
    localStorage.setItem('stalker_token', data.token);
    localStorage.setItem('stalker_user',  JSON.stringify(data.user));
    return data.user;
  },

  async syncLocation() {
    if (!this.isLoggedIn()) return;
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
  info(msg)    { this.show(msg, 'info'); },
};

Toast.init();
