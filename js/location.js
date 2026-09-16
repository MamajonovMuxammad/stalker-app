/* ==========================================================
   STALKER — Location Detail Page Controller v2.2
   Admin edit/delete capabilities + custom icon/colors
   ========================================================== */

let currentLocationData = null;

const TYPE_LABELS_LOC = {
  bunker:      'Бункер',
  abandoned:   'Заброшка',
  underground: 'Подземка',
};

const DIFF_LABELS = {
  1: 'Лёгкий',
  2: 'Умеренный',
  3: 'Средний',
  4: 'Сложный',
  5: 'Экстремальный',
};

const DIFF_COLORS = {
  1: 'var(--success)', 2: 'var(--success)',
  3: 'var(--warning)',
  4: 'var(--danger)',  5: 'var(--danger)',
};

/* ── Nav Auth ────────────────────────────────────────────── */
function setupNavAuth() {
  const user = Auth.getUser();
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

  const trigger = document.getElementById('avatar-trigger');
  const dropdownEl = document.getElementById('user-dropdown');
  if (trigger && dropdownEl) {
    trigger.addEventListener('click', e => {
      e.stopPropagation();
      dropdownEl.classList.toggle('open');
    });
    document.addEventListener('click', () => dropdownEl.classList.remove('open'));
  }
  const logoutBtn = document.getElementById('btn-logout');
  if (logoutBtn) logoutBtn.addEventListener('click', () => Auth.logout());
}

/* ── Load & Render ───────────────────────────────────────── */
async function loadLocation() {
  const params = new URLSearchParams(window.location.search);
  const locId = params.get('id');

  const loadingEl = document.getElementById('location-loading');
  const errorEl   = document.getElementById('location-error');
  const contentEl = document.getElementById('location-content');

  if (!locId) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl)   errorEl.style.display   = 'flex';
    return;
  }

  try {
    const loc = await API.get(`/locations/${locId}`);
    currentLocationData = loc;
    if (loadingEl) loadingEl.style.display = 'none';
    renderLocation(loc);
    if (contentEl) contentEl.style.display = 'block';
    document.title = `${loc.name} — STALKER`;
    const titleEl = document.getElementById('page-title');
    if (titleEl) titleEl.textContent = `${loc.name} — STALKER`;
  } catch (e) {
    if (loadingEl) loadingEl.style.display = 'none';
    if (errorEl)   errorEl.style.display   = 'flex';
  }
}

function renderLocation(loc) {
  const contentEl = document.getElementById('location-content');
  if (!contentEl) return;

  const user = Auth.getUser();
  const isAdmin = user && user.role === 'admin';

  const lat = loc.lat ?? (loc.coords && loc.coords[0]);
  const lng = loc.lng ?? (loc.coords && loc.coords[1]);
  const typeLabel = TYPE_LABELS_LOC[loc.type] || loc.type;
  const diffLabel = DIFF_LABELS[loc.difficulty] || loc.difficulty;
  const diffColor = DIFF_COLORS[loc.difficulty] || 'var(--text-tertiary)';
  const photos = loc.photos || [];
  const tags = loc.tags || [];

  // Breadcrumb
  const breadcrumb = `
    <div style="display:flex;align-items:center;gap:var(--sp-2);margin-bottom:var(--sp-6);font-size:var(--text-sm);">
      <a href="/" style="color:var(--text-tertiary);text-decoration:none;display:flex;align-items:center;gap:4px;">
        <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        Карта
      </a>
      <span style="color:var(--text-tertiary);">›</span>
      <a href="/catalog.html" style="color:var(--text-tertiary);text-decoration:none;">Каталог</a>
      <span style="color:var(--text-tertiary);">›</span>
      <span style="color:var(--text-secondary);">${loc.name}</span>
    </div>`;

  // Hero image / photo gallery
  const heroHtml = photos.length > 0 ? `
    <div style="position:relative;margin-bottom:var(--sp-8);">
      <img id="loc-hero" src="${photos[0]}" alt="${loc.name}" class="location-hero"
        onerror="this.style.display='none'">
      ${photos.length > 1 ? `
        <div style="display:flex;gap:var(--sp-2);margin-top:var(--sp-3);overflow-x:auto;padding-bottom:var(--sp-1);">
          ${photos.map((p, i) => `
            <img src="${p}" alt="Фото ${i+1}" onclick="document.getElementById('loc-hero').src='${p}'"
              style="width:80px;height:56px;object-fit:cover;border-radius:6px;cursor:pointer;flex-shrink:0;
                border:2px solid ${i === 0 ? 'var(--accent)' : 'transparent'};transition:border-color 0.15s;"
              onerror="this.style.display='none'">
          `).join('')}
        </div>` : ''}
    </div>` : '';

  // Admin Controls Bar
  const adminBarHtml = isAdmin ? `
    <div style="display:flex;gap:var(--sp-2);margin-bottom:var(--sp-5);padding:var(--sp-3) var(--sp-4);background:var(--bg-elevated);border:1px solid var(--accent);border-radius:10px;align-items:center;">
      <span style="font-size:var(--text-xs);font-weight:700;color:var(--accent);text-transform:uppercase;letter-spacing:0.06em;">Панель Администратора:</span>
      <div style="margin-left:auto;display:flex;gap:var(--sp-2);">
        <button class="btn btn-secondary btn-sm" onclick="openEditModal()">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          Редактировать
        </button>
        <button class="btn btn-danger btn-sm" onclick="deleteLocation('${loc.id}')">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Удалить
        </button>
      </div>
    </div>
  ` : '';

  // Meta info sidebar
  const metaRows = [
    { icon: '📍', label: 'Регион', value: loc.region },
    { icon: '🏷️', label: 'Тип', value: typeLabel },
    { icon: '⚠️', label: 'Сложность', value: `<span style="color:${diffColor};font-weight:700;">${loc.difficulty}★ ${diffLabel}</span>` },
    lat ? { icon: '🗺️', label: 'Координаты', value: `${Number(lat).toFixed(5)}, ${Number(lng).toFixed(5)}` } : null,
    loc.inventory ? { icon: '📁', label: 'Инвентарный №', value: `<code style="font-size:var(--text-xs);color:var(--accent);">${loc.inventory}</code>` } : null,
    loc.date_added ? { icon: '📅', label: 'Добавлено', value: loc.date_added } : null,
    { icon: '👁', label: 'Просмотры', value: `${loc.visits || 0}` },
  ].filter(Boolean);

  // Mini map
  const miniMapHtml = (lat && lng) ? `
    <div class="card" style="overflow:hidden;margin-top:var(--sp-4);">
      <div style="padding:var(--sp-4);border-bottom:1px solid var(--border);">
        <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-tertiary);letter-spacing:0.06em;text-transform:uppercase;">Расположение</div>
      </div>
      <div id="loc-mini-map" style="height:200px;"></div>
      <div style="padding:var(--sp-3) var(--sp-4);">
        <a href="https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}&zoom=16" target="_blank" rel="noopener"
          class="btn btn-ghost btn-sm btn-block">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
          Открыть на OpenStreetMap
        </a>
      </div>
    </div>` : '';

  contentEl.innerHTML = `
    ${breadcrumb}
    ${adminBarHtml}
    ${heroHtml}

    <div class="location-layout">
      <!-- Main content -->
      <div>
        <div style="display:flex;align-items:flex-start;gap:var(--sp-4);margin-bottom:var(--sp-6);flex-wrap:wrap;">
          <div style="flex:1;">
            <div style="display:flex;align-items:center;gap:var(--sp-3);margin-bottom:var(--sp-2);">
              <span class="badge" style="font-size:var(--text-xs);">${typeLabel}</span>
              <span class="badge ${loc.difficulty >= 4 ? 'danger' : loc.difficulty === 3 ? 'warning' : 'success'}">${loc.difficulty}★</span>
            </div>
            <h1 style="font-size:var(--text-3xl);font-weight:800;letter-spacing:-0.02em;line-height:1.15;margin-bottom:var(--sp-2);">${loc.name}</h1>
            <div style="font-size:var(--text-sm);color:var(--text-tertiary);">${loc.region}</div>
          </div>
          <button onclick="toggleBookmark('${loc.id}')" id="bm-btn-${loc.id}"
            class="btn btn-secondary btn-sm" style="flex-shrink:0;" title="Сохранить в закладки">
            <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>
            Сохранить
          </button>
        </div>

        ${loc.description ? `
          <div class="card card-body" style="margin-bottom:var(--sp-6);">
            <h2 style="font-size:var(--text-md);font-weight:700;margin-bottom:var(--sp-4);">Описание</h2>
            <p style="font-size:var(--text-base);color:var(--text-secondary);line-height:1.75;white-space:pre-wrap;">${loc.description}</p>
          </div>` : ''}

        ${loc.access ? `
          <div class="card card-body" style="margin-bottom:var(--sp-6);">
            <h2 style="font-size:var(--text-md);font-weight:700;margin-bottom:var(--sp-4);">Способ доступа</h2>
            <p style="font-size:var(--text-base);color:var(--text-secondary);line-height:1.75;white-space:pre-wrap;">${loc.access}</p>
          </div>` : ''}

        ${tags.length > 0 ? `
          <div style="display:flex;flex-wrap:wrap;gap:var(--sp-2);margin-bottom:var(--sp-6);">
            ${tags.map(t => `<span class="badge accent">${t.trim()}</span>`).join('')}
          </div>` : ''}
      </div>

      <!-- Sidebar meta -->
      <div class="location-meta-card">
        <div class="card">
          <div style="padding:var(--sp-4) var(--sp-5);border-bottom:1px solid var(--border);">
            <div style="font-size:var(--text-xs);font-weight:700;color:var(--text-tertiary);letter-spacing:0.06em;text-transform:uppercase;">Досье объекта</div>
          </div>
          <div style="padding:0 var(--sp-2);">
            ${metaRows.map(r => `
              <div class="meta-row">
                <div class="meta-icon">${r.icon}</div>
                <div class="meta-content">
                  <div class="meta-label">${r.label}</div>
                  <div class="meta-value">${r.value}</div>
                </div>
              </div>`).join('')}
          </div>
        </div>
        ${miniMapHtml}
      </div>
    </div>`;

  // Init mini-map after render
  if (lat && lng) {
    setTimeout(() => {
      const miniMap = L.map('loc-mini-map', {
        center: [lat, lng],
        zoom: 15,
        zoomControl: false,
        dragging: false,
        scrollWheelZoom: false,
        attributionControl: false,
      });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(miniMap);
      L.marker([lat, lng]).addTo(miniMap);
    }, 100);
  }
}

/* ── Admin Edit & Delete Actions ─────────────────────────── */
window.openEditModal = function() {
  if (!currentLocationData) return;
  const loc = currentLocationData;
  const lat = loc.lat ?? (loc.coords && loc.coords[0]) ?? '';
  const lng = loc.lng ?? (loc.coords && loc.coords[1]) ?? '';

  document.getElementById('edit-name').value = loc.name || '';
  document.getElementById('edit-type').value = loc.type || 'bunker';
  document.getElementById('edit-region').value = loc.region || '';
  document.getElementById('edit-lat').value = lat;
  document.getElementById('edit-lng').value = lng;
  document.getElementById('edit-icon').value = loc.icon || 'bunker';
  document.getElementById('edit-color').value = loc.color || '#2563EB';
  document.getElementById('edit-difficulty').value = loc.difficulty || 3;
  document.getElementById('edit-description').value = loc.description || '';
  document.getElementById('edit-access').value = loc.access || '';

  const modal = document.getElementById('edit-loc-modal');
  if (modal) modal.classList.add('open');
};

window.closeEditModal = function() {
  const modal = document.getElementById('edit-loc-modal');
  if (modal) modal.classList.remove('open');
};

window.saveLocationEdit = async function() {
  if (!currentLocationData) return;
  const locId = currentLocationData.id;

  const name = document.getElementById('edit-name').value.trim();
  const type = document.getElementById('edit-type').value;
  const region = document.getElementById('edit-region').value.trim();
  const lat = parseFloat(document.getElementById('edit-lat').value);
  const lng = parseFloat(document.getElementById('edit-lng').value);
  const icon = document.getElementById('edit-icon').value;
  const color = document.getElementById('edit-color').value;
  const difficulty = parseInt(document.getElementById('edit-difficulty').value || '3');
  const description = document.getElementById('edit-description').value.trim();
  const access = document.getElementById('edit-access').value.trim();

  if (!name || !region) {
    Toast.error('Название и регион обязательны');
    return;
  }

  const btn = document.getElementById('btn-save-loc-edit');
  if (btn) { btn.disabled = true; btn.textContent = 'Сохранение...'; }

  try {
    await API.put(`/admin/locations/${locId}`, {
      name, type, region, lat, lng, icon, color, difficulty, description, access,
      photos: currentLocationData.photos || []
    });
    Toast.success('Объект успешно обновлён');
    closeEditModal();
    loadLocation();
  } catch (err) {
    Toast.error(err.message || 'Ошибка обновления');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Сохранить изменения'; }
  }
};

window.deleteLocation = async function(locId) {
  if (!confirm('Вы уверены, что хотите удалить этот объект из архива? Действие необратимо.')) {
    return;
  }

  try {
    await API.del(`/admin/locations/${locId}`);
    Toast.success('Объект удалён');
    setTimeout(() => window.location.href = '/catalog.html', 800);
  } catch (err) {
    Toast.error(err.message || 'Ошибка при удалении');
  }
};

function toggleBookmark(locId) {
  let list = [];
  try { list = JSON.parse(localStorage.getItem('stalker_bookmarks') || '[]'); } catch { list = []; }
  const idx = list.indexOf(locId);
  const btn = document.getElementById(`bm-btn-${locId}`);
  if (idx > -1) {
    list.splice(idx, 1);
    localStorage.setItem('stalker_bookmarks', JSON.stringify(list));
    if (btn) btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Сохранить`;
    Toast.info('Удалено из закладок');
  } else {
    list.push(locId);
    localStorage.setItem('stalker_bookmarks', JSON.stringify(list));
    if (btn) btn.innerHTML = `<svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg> Сохранено`;
    Toast.success('Добавлено в закладки');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  setupNavAuth();
  loadLocation();
});
