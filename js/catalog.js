/* ==========================================================
   STALKER — Catalog Controller v2
   ========================================================== */

let catalogItems = [];
let activeCatalogFilter = 'all';
let searchQuery = '';

async function loadCatalog() {
  const grid = document.getElementById('catalog-grid');
  if (!grid) return;

  grid.innerHTML = `
    <div class="empty-state" style="grid-column:1/-1;">
      <div class="loading-spinner"></div>
    </div>
  `;

  try {
    const data = await API.get('/locations');
    catalogItems = data;
  } catch (e) {
    console.warn('API unavailable, using mock data:', e);
    catalogItems = typeof LOCATIONS !== 'undefined' ? LOCATIONS : [];
  }

  renderCatalog();
  setupNavAuth();
}

function renderCatalog() {
  const grid = document.getElementById('catalog-grid');
  const countEl = document.getElementById('catalog-count');
  if (!grid) return;

  const query = searchQuery.toLowerCase().trim();

  const filtered = catalogItems.filter(item => {
    const matchFilter = activeCatalogFilter === 'all' || item.type === activeCatalogFilter;
    const matchQuery = !query ||
      item.name.toLowerCase().includes(query) ||
      item.region.toLowerCase().includes(query) ||
      (item.inventory && item.inventory.toLowerCase().includes(query)) ||
      (item.tags && item.tags.some(t => t.toLowerCase().includes(query)));
    return matchFilter && matchQuery;
  });

  if (countEl) countEl.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="empty-state" style="grid-column: 1 / -1;">
        <div class="empty-state-icon">🔍</div>
        <div class="empty-state-title">Объекты не найдены</div>
        <div class="empty-state-desc">Попробуйте другой запрос или сбросьте фильтр</div>
      </div>
    `;
    return;
  }

  const typeIcons = {
    bunker: '🏗️',
    abandoned: '🏭',
    underground: '🚇'
  };

  const diffColors = {
    1: 'var(--success)',
    2: 'var(--success)',
    3: 'var(--warning)',
    4: 'var(--danger)',
    5: 'var(--danger)'
  };

  grid.innerHTML = filtered.map(item => {
    const photo = (item.photos && item.photos.length > 0)
      ? item.photos[0]
      : 'https://images.unsplash.com/photo-1578662996442-48f60103fc96?w=600';

    const typeLabel = TYPE_LABELS[item.type] || item.type;
    const icon = typeIcons[item.type] || '📍';
    const isBookmarked = checkBookmark(item.id);
    const diffColor = diffColors[item.difficulty] || 'var(--text-tertiary)';

    return `
      <article class="card location-card card-interactive" data-id="${item.id}">
        <div class="location-card-image" style="position:relative; overflow:hidden;">
          <img
            src="${photo}"
            alt="${item.name}"
            loading="lazy"
            class="location-card-image"
            onerror="this.parentElement.style.background='var(--bg-active)';"
            style="width:100%; height:100%; object-fit:cover; display:block;"
          />
          <div style="position:absolute; top:var(--sp-3); right:var(--sp-3);">
            <span class="badge" style="background:rgba(10,10,10,0.8); color:${diffColor}; border-color:${diffColor}; backdrop-filter:blur(8px);">
              ${item.difficulty}★
            </span>
          </div>
          <div style="position:absolute; top:var(--sp-3); left:var(--sp-3);">
            <span class="badge" style="background:rgba(10,10,10,0.8); backdrop-filter:blur(8px);">${icon} ${typeLabel}</span>
          </div>
        </div>

        <div class="location-card-body">
          <div class="location-card-meta">
            <svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
            ${item.region}
            ${item.inventory ? `<span>·</span> <span style="font-family:monospace;">${item.inventory}</span>` : ''}
          </div>
          <h2 class="location-card-title">${item.name}</h2>
          <p class="location-card-desc">${item.description || 'Описание отсутствует.'}</p>
        </div>

        <div class="location-card-footer">
          <span style="font-size:var(--text-xs); color:var(--text-tertiary); font-family:monospace;">
            ${item.coords ? `${item.coords[0].toFixed(4)}°N, ${item.coords[1].toFixed(4)}°E` : '—'}
          </span>
          <div style="display:flex; gap:var(--sp-2);">
            <button
              class="btn btn-ghost btn-sm btn-icon"
              onclick="event.stopPropagation(); toggleBookmark('${item.id}')"
              id="bm-btn-${item.id}"
              title="${isBookmarked ? 'Убрать из закладок' : 'В закладки'}"
              style="font-size:14px;"
            >${isBookmarked ? '🔖' : '♡'}</button>
            <a href="/location.html?id=${item.id}" class="btn btn-primary btn-sm" onclick="event.stopPropagation();">Открыть</a>
          </div>
        </div>
      </article>
    `;
  }).join('');
}

function checkBookmark(locId) {
  try {
    const list = JSON.parse(localStorage.getItem('stalker_bookmarks') || '[]');
    return list.includes(locId);
  } catch {
    return false;
  }
}

function toggleBookmark(locId) {
  let list = [];
  try {
    list = JSON.parse(localStorage.getItem('stalker_bookmarks') || '[]');
  } catch {
    list = [];
  }

  const idx = list.indexOf(locId);
  const btn = document.getElementById(`bm-btn-${locId}`);

  if (idx > -1) {
    list.splice(idx, 1);
    localStorage.setItem('stalker_bookmarks', JSON.stringify(list));
    if (btn) btn.textContent = '♡';
    if (typeof Toast !== 'undefined') Toast.info('Удалено из закладок');
  } else {
    list.push(locId);
    localStorage.setItem('stalker_bookmarks', JSON.stringify(list));
    if (btn) btn.textContent = '🔖';
    if (typeof Toast !== 'undefined') Toast.success('Добавлено в закладки');
  }
}

function setupNavAuth() {
  const user = typeof Auth !== 'undefined' ? Auth.getUser() : null;
  const loginBtn    = document.getElementById('btn-login');
  const registerBtn = document.getElementById('btn-register');
  const dropdown    = document.getElementById('user-dropdown');
  const adminLink   = document.getElementById('nav-admin');

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

  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => Auth.logout());
  }
}

document.addEventListener('DOMContentLoaded', () => {
  loadCatalog();

  // Filter chips
  document.querySelectorAll('#catalog-chip-filters .chip').forEach(chip => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#catalog-chip-filters .chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      activeCatalogFilter = chip.dataset.filter || 'all';
      renderCatalog();
    });
  });

  // Search input
  const searchInput = document.getElementById('catalog-search');
  if (searchInput) {
    let timer;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        searchQuery = e.target.value;
        renderCatalog();
      }, 150);
    });
  }
});
