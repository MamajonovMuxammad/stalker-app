/* ==========================================================
   STALKER — Map Sidebar Controller v2
   ========================================================== */

let allLocations = [];
let activeFilter = 'all';
let sidebarSearch = '';

async function loadSidebarLocations() {
  const listEl = document.getElementById('sidebar-list');
  if (!listEl) return;

  try {
    const data = await API.get('/locations');
    allLocations = data;
  } catch (err) {
    console.warn('API error, using mock data:', err);
    allLocations = typeof LOCATIONS !== 'undefined' ? LOCATIONS : [];
  }

  renderSidebar();
  renderMapMarkers(allLocations);

  // Hash focus
  const hash = window.location.hash.replace('#', '');
  if (hash) setTimeout(() => focusLocation(hash), 400);
}

function renderSidebar() {
  const listEl = document.getElementById('sidebar-list');
  const countEl = document.getElementById('sidebar-count');

  const query = sidebarSearch.toLowerCase().trim();
  const filtered = allLocations.filter(item => {
    const matchType = activeFilter === 'all' || item.type === activeFilter;
    const matchSearch = !query ||
      item.name.toLowerCase().includes(query) ||
      item.region.toLowerCase().includes(query);
    return matchType && matchSearch;
  });

  if (countEl) {
    countEl.textContent = filtered.length;
  }

  if (!listEl) return;

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Ничего не найдено</div>
        <div class="empty-state-desc">Попробуйте изменить поиск или фильтр</div>
      </div>
    `;
    renderMapMarkers([]);
    return;
  }

  listEl.innerHTML = filtered.map(loc => {
    const photo = (loc.photos && loc.photos.length > 0)
      ? loc.photos[0]
      : 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=200';

    const diffColors = { 1: 'var(--success)', 2: 'var(--success)', 3: 'var(--warning)', 4: 'var(--danger)', 5: 'var(--danger)' };
    const diffColor = diffColors[loc.difficulty] || 'var(--text-tertiary)';

    return `
      <div class="sidebar-location-item" data-id="${loc.id}" onclick="handleLocationCardClick('${loc.id}')">
        <img class="sidebar-location-thumb" src="${photo}" alt="${loc.name}" loading="lazy"
          onerror="this.style.background='var(--bg-active)'; this.src='';" />
        <div class="sidebar-location-info">
          <div class="sidebar-location-name">${loc.name}</div>
          <div class="sidebar-location-sub">${loc.region} · ${TYPE_LABELS[loc.type] || loc.type}</div>
        </div>
        <div style="font-size:var(--text-xs); font-weight:700; color:${diffColor}; flex-shrink:0;">${loc.difficulty}★</div>
      </div>
    `;
  }).join('');

  renderMapMarkers(filtered);
}

function handleLocationCardClick(locId) {
  focusLocation(locId);
  // highlight active
  document.querySelectorAll('.sidebar-location-item').forEach(el => el.classList.remove('active'));
  const item = document.querySelector(`.sidebar-location-item[data-id="${locId}"]`);
  if (item) item.classList.add('active');
}

function setupFilterEvents() {
  // Sidebar filter chips
  document.querySelectorAll('#sidebar-filters .chip').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#sidebar-filters .chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeFilter = btn.dataset.filter || 'all';
      renderSidebar();
    });
  });

  // Sidebar search
  const searchInput = document.getElementById('sidebar-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      sidebarSearch = e.target.value;
      renderSidebar();
    });
  }
}

function renderNavAuth() {
  const user = Auth.getUser();
  const loginBtn   = document.getElementById('btn-login');
  const registerBtn = document.getElementById('btn-register');
  const dropdown   = document.getElementById('user-dropdown');
  const adminLink  = document.getElementById('nav-admin');

  if (user) {
    if (loginBtn)    loginBtn.style.display = 'none';
    if (registerBtn) registerBtn.style.display = 'none';
    if (dropdown)    dropdown.style.display = 'flex';

    const letter = document.getElementById('avatar-letter');
    if (letter) letter.textContent = (user.callsign || user.username).charAt(0).toUpperCase();

    const menuName = document.getElementById('menu-username');
    const menuRole = document.getElementById('menu-role');
    if (menuName) menuName.textContent = user.callsign || user.username;
    if (menuRole) menuRole.textContent = user.role === 'admin' ? 'Администратор' : 'Следопыт';

    if (adminLink && user.role === 'admin') adminLink.style.display = 'flex';
  } else {
    if (loginBtn)    loginBtn.style.display = 'flex';
    if (registerBtn) registerBtn.style.display = 'flex';
    if (dropdown)    dropdown.style.display = 'none';
  }

  // Dropdown toggle
  const trigger = document.getElementById('avatar-trigger');
  const dropdownEl = document.getElementById('user-dropdown');
  if (trigger && dropdownEl) {
    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdownEl.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdownEl.classList.remove('open'));
  }

  // Logout
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Auth.logout());
  }
}

function renderUserProfile() {
  // For sidebar footer
  const userEl = document.getElementById('sidebar-user-block');
  if (!userEl) return;

  const user = Auth.getUser();
  if (user) {
    userEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:var(--sp-3); width:100%;">
        <div class="avatar-btn" style="width:32px; height:32px; font-size:var(--text-xs);">
          ${(user.callsign || user.username).charAt(0).toUpperCase()}
        </div>
        <div style="flex:1; min-width:0;">
          <div style="font-size:var(--text-sm); font-weight:600; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${user.callsign || user.username}
          </div>
          <div style="font-size:var(--text-xs); color:var(--text-tertiary);">${user.role === 'admin' ? 'Администратор' : 'Следопыт'}</div>
        </div>
        <a href="/submit.html" class="btn btn-primary btn-sm" style="flex-shrink:0;">+ Добавить</a>
      </div>
    `;
  } else {
    userEl.innerHTML = `
      <div style="display:flex; align-items:center; gap:var(--sp-3); width:100%;">
        <a href="/auth.html" class="btn btn-secondary btn-sm" style="flex:1;">Войти</a>
        <a href="/auth.html" class="btn btn-primary btn-sm" style="flex:1;">Регистрация</a>
      </div>
    `;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initMap();
  setupFilterEvents();
  renderNavAuth();
  renderUserProfile();
  loadSidebarLocations();
});
