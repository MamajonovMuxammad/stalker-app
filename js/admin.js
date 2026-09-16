/* ==========================================================
   STALKER — Admin / Moderation Panel v2.2
   Submissions moderation + Stalker Geolocation Radar
   ========================================================== */

let adminCurrentFilter = 'all';
let allSubmissions = [];
let allRadarUsers = [];
let rejectTargetId = null;
let radarMap = null;
let radarMarkersLayer = null;

/* ── Render Nav Auth ─────────────────────────────────────── */
function renderNavAuth() {
  const user = Auth.getUser();
  if (!user || user.role !== 'admin') {
    window.location.href = '/auth.html';
    return;
  }
  const letter = document.getElementById('avatar-letter');
  if (letter) letter.textContent = (user.callsign || user.username).charAt(0).toUpperCase();
  const menuName = document.getElementById('menu-username');
  const menuRole = document.getElementById('menu-role');
  if (menuName) menuName.textContent = user.callsign || user.username;
  if (menuRole) menuRole.textContent = 'Администратор';

  const adminCallsignEl = document.getElementById('admin-user-callsign');
  if (adminCallsignEl) adminCallsignEl.textContent = user.callsign || user.username;

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

/* ── Load Stats ──────────────────────────────────────────── */
async function loadStats() {
  try {
    const stats = await API.get('/admin/stats');
    const el = id => document.getElementById(id);
    if (el('stat-total-locs'))    el('stat-total-locs').textContent    = stats.total_locations    || 0;
    if (el('stat-pending-subs'))  el('stat-pending-subs').textContent  = stats.pending_submissions  || 0;
    if (el('stat-rejected-subs')) el('stat-rejected-subs').textContent = stats.rejected_submissions || 0;
    if (el('stat-users-count'))   el('stat-users-count').textContent   = stats.registered_stalkers  || 0;
  } catch (e) {
    console.warn('Stats load error', e);
  }
}

/* ── Load Submissions ────────────────────────────────────── */
async function loadSubmissions() {
  const listEl = document.getElementById('submissions-list');
  if (listEl) listEl.innerHTML = `<div class="empty-state"><div class="loading-spinner"></div></div>`;

  try {
    allSubmissions = await API.get('/submissions?status=all');
  } catch (e) {
    allSubmissions = [];
    if (listEl) listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">⚠️</div>
        <div class="empty-state-title">Ошибка загрузки</div>
        <div class="empty-state-desc">Не удалось получить данные с сервера</div>
      </div>`;
    return;
  }

  updateBadgeCounts();
  renderSubmissions();
}

function updateBadgeCounts() {
  const counts = { all: allSubmissions.length, pending: 0, approved: 0, rejected: 0 };
  allSubmissions.forEach(s => { if (counts[s.status] !== undefined) counts[s.status]++; });
  Object.keys(counts).forEach(k => {
    const el = document.getElementById(`count-${k}`);
    if (el) el.textContent = counts[k];
  });
}

/* ── Render Submissions ──────────────────────────────────── */
function renderSubmissions() {
  const listEl = document.getElementById('submissions-list');
  const radarContainer = document.getElementById('radar-container');
  const usersContainer = document.getElementById('users-container');
  const sectionTitle = document.getElementById('admin-section-title');
  const sectionSubtitle = document.getElementById('admin-section-subtitle');

  if (adminCurrentFilter === 'radar') {
    if (listEl) listEl.style.display = 'none';
    if (usersContainer) usersContainer.style.display = 'none';
    if (radarContainer) radarContainer.style.display = 'flex';
    if (sectionTitle) sectionTitle.textContent = '📡 Радар следопытов (LIVE)';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Интерактивная карта геопозиций пользователей в реальном времени';
    loadRadar();
    return;
  }

  if (adminCurrentFilter === 'users') {
    if (listEl) listEl.style.display = 'none';
    if (radarContainer) radarContainer.style.display = 'none';
    if (usersContainer) usersContainer.style.display = 'flex';
    if (sectionTitle) sectionTitle.textContent = '👥 Реестр сталкеров';
    if (sectionSubtitle) sectionSubtitle.textContent = 'Конфиденциальная база зарегистрированных аккаунтов, номеров и координат (🔒 Служба Безопасности)';
    loadUsersTable();
    return;
  }

  if (listEl) listEl.style.display = 'block';
  if (radarContainer) radarContainer.style.display = 'none';
  if (usersContainer) usersContainer.style.display = 'none';
  if (sectionTitle) sectionTitle.textContent = 'Заявки на модерацию';
  if (sectionSubtitle) sectionSubtitle.textContent = 'Верификация координат, фотоматериалов и принятие решений';

  if (!listEl) return;

  const filtered = adminCurrentFilter === 'all'
    ? allSubmissions
    : allSubmissions.filter(s => s.status === adminCurrentFilter);

  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📋</div>
        <div class="empty-state-title">Нет заявок</div>
        <div class="empty-state-desc">В этой категории пока ничего нет</div>
      </div>`;
    return;
  }

  const typeLabels = { bunker: 'Бункер', abandoned: 'Заброшка', underground: 'Подземка' };
  const statusMap = {
    pending:  { label: 'На рассмотрении', cls: 'warning' },
    approved: { label: 'Одобрено',        cls: 'success' },
    rejected: { label: 'Отклонено',       cls: 'danger'  },
  };

  listEl.innerHTML = filtered.map(sub => {
    const st = statusMap[sub.status] || { label: sub.status, cls: '' };
    const photo = sub.photos && sub.photos[0] ? sub.photos[0] : null;
    const coords = (sub.lat && sub.lng) ? `${sub.lat.toFixed(4)}, ${sub.lng.toFixed(4)}` : 'Не указаны';

    const actions = sub.status === 'pending' ? `
      <div style="display:flex;gap:var(--sp-2);flex-wrap:wrap;">
        <button class="btn btn-sm" onclick="approveSubmission('${sub.id}')"
          style="background:var(--success-dim);color:var(--success);border:1px solid var(--success);flex:1;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>
          Одобрить
        </button>
        <button class="btn btn-sm btn-danger" onclick="openRejectModal('${sub.id}')" style="flex:1;">
          <svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          Отклонить
        </button>
      </div>` : (sub.resolution ? `<div style="font-size:var(--text-xs);color:var(--text-tertiary);padding:var(--sp-2) var(--sp-3);background:var(--bg-base);border-radius:6px;line-height:1.5;">${sub.resolution}</div>` : '');

    return `
      <div class="card" style="margin-bottom:var(--sp-4);">
        ${photo ? `<img src="${photo}" alt="${sub.name}" style="width:100%;height:160px;object-fit:cover;" onerror="this.style.display='none'">` : ''}
        <div class="card-body" style="gap:var(--sp-3);display:flex;flex-direction:column;">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:var(--sp-3);">
            <div>
              <div style="font-size:var(--text-md);font-weight:700;color:var(--text-primary);margin-bottom:var(--sp-1);">${sub.name}</div>
              <div style="font-size:var(--text-xs);color:var(--text-tertiary);">
                ${sub.region} · ${typeLabels[sub.type] || sub.type} · Сложность: ${sub.difficulty}★
              </div>
            </div>
            <span class="badge ${st.cls}" style="flex-shrink:0;">${st.label}</span>
          </div>

          <div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--sp-2);font-size:var(--text-xs);">
            <div><span style="color:var(--text-tertiary);">Автор: </span><span style="color:var(--text-secondary);font-weight:600;">${sub.author}</span></div>
            <div><span style="color:var(--text-tertiary);">Дата: </span><span style="color:var(--text-secondary);">${sub.date}</span></div>
            <div style="grid-column:1/-1;"><span style="color:var(--text-tertiary);">Координаты: </span><span style="color:var(--text-secondary);">${coords}</span></div>
          </div>

          ${sub.description ? `<p style="font-size:var(--text-sm);color:var(--text-secondary);line-height:1.6;margin:0;">${sub.description.slice(0, 200)}${sub.description.length > 200 ? '...' : ''}</p>` : ''}
          ${actions}
        </div>
      </div>`;
  }).join('');
}

/* ── Radar & User Geolocation ────────────────────────────── */
async function loadRadar(focusCoords = null) {
  try {
    allRadarUsers = await API.get('/admin/radar');
    const countRadar = document.getElementById('count-radar');
    if (countRadar) countRadar.textContent = allRadarUsers.filter(u => u.coords).length;
    const countUsers = document.getElementById('count-users');
    if (countUsers) countUsers.textContent = allRadarUsers.length;
  } catch (e) {
    allRadarUsers = [];
    Toast.error('Не удалось загрузить данные радара');
    return;
  }

  initRadarMap(focusCoords);
}

function initRadarMap(focusCoords = null) {
  const mapEl = document.getElementById('radar-map');
  if (!mapEl) return;

  if (!radarMap) {
    radarMap = L.map('radar-map', {
      center: [41.3111, 69.2406],
      zoom: 11,
      zoomControl: true,
    });

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(radarMap);

    radarMarkersLayer = L.layerGroup().addTo(radarMap);
  }

  setTimeout(() => radarMap.invalidateSize(), 150);
  radarMarkersLayer.clearLayers();

  allRadarUsers.forEach(u => {
    if (u.coords && u.coords[0] && u.coords[1]) {
      const lat = u.coords[0];
      const lng = u.coords[1];
      const pulseSvg = `
        <div style="position:relative; width:28px; height:28px; cursor:pointer;">
          <div style="position:absolute; inset:0; border-radius:50%; background:var(--accent); opacity:0.6; animation: ping 1.8s cubic-bezier(0,0,0.2,1) infinite;"></div>
          <div style="position:absolute; inset:5px; border-radius:50%; background:#0B0F19; border:2.5px solid var(--accent); display:flex; align-items:center; justify-content:center; box-shadow:0 0 10px rgba(37,99,235,0.8);">
            <div style="width:6px; height:6px; border-radius:50%; background:#60A5FA;"></div>
          </div>
        </div>
      `;
      const icon = L.divIcon({
        html: pulseSvg,
        className: 'radar-user-icon',
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([lat, lng], { icon });

      const popupContent = `
        <div style="font-family:var(--font); min-width:220px; padding:6px 2px;">
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:8px;">
            <div style="width:32px; height:32px; border-radius:8px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:14px;">
              ${(u.callsign || u.username || 'S')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-weight:700; font-size:14px; color:#F8FAFC;">${u.callsign || u.username}</div>
              <div style="font-size:11px; color:#94A3B8;">@${u.username} · <span style="color:#10B981;">● Online</span></div>
            </div>
          </div>
          <div style="background:rgba(255,255,255,0.06); padding:8px; border-radius:6px; font-size:12px; display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
            <div><span style="color:#94A3B8;">Телефон (СБ):</span> <code style="color:#60A5FA; font-weight:700;">${u.phone}</code></div>
            <div><span style="color:#94A3B8;">Роль:</span> <b style="color:#F1F5F9;">${u.role === 'admin' ? 'Администратор' : 'Следопыт'}</b></div>
            <div><span style="color:#94A3B8;">Координаты:</span> <code style="color:#E2E8F0;">${lat.toFixed(5)}, ${lng.toFixed(5)}</code></div>
            <div><span style="color:#94A3B8;">Активность:</span> <span style="color:#CBD5E1;">${u.last_seen || 'Недавно'}</span></div>
          </div>
          <button class="btn btn-secondary btn-sm w-full" onclick="zoomToUser([${lat}, ${lng}])" style="padding:4px 8px; font-size:11px; justify-content:center;">
            🔍 Приблизить координаты
          </button>
        </div>
      `;

      marker.bindPopup(popupContent, { maxWidth: 280, minWidth: 220 });

      // Click on marker zooms in to user smoothly!
      marker.on('click', () => {
        radarMap.flyTo([lat, lng], 16, { animate: true, duration: 1.2 });
      });

      radarMarkersLayer.addLayer(marker);
    }
  });

  if (focusCoords && focusCoords[0] && focusCoords[1]) {
    radarMap.flyTo(focusCoords, 16, { animate: true, duration: 1.2 });
  }
}

function zoomToUser(coords) {
  if (radarMap && coords) {
    radarMap.flyTo(coords, 17, { animate: true, duration: 1.0 });
  }
}

/* ── Users Table Section ─────────────────────────────────── */
async function loadUsersTable() {
  const tbody = document.getElementById('users-table-tbody');
  if (tbody) tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding:30px;"><div class="loading-spinner" style="margin:0 auto;"></div></td></tr>`;

  try {
    allRadarUsers = await API.get('/admin/radar');
  } catch (e) {
    allRadarUsers = [];
    Toast.error('Не удалось загрузить реестр пользователей');
    return;
  }

  renderUsersTable();

  // Search input filter
  const searchInput = document.getElementById('users-search-input');
  if (searchInput) {
    searchInput.oninput = () => renderUsersTable(searchInput.value.trim().toLowerCase());
  }
}

function renderUsersTable(query = '') {
  const tbody = document.getElementById('users-table-tbody');
  if (!tbody) return;

  let filtered = allRadarUsers;
  if (query) {
    filtered = allRadarUsers.filter(u =>
      (u.username && u.username.toLowerCase().includes(query)) ||
      (u.callsign && u.callsign.toLowerCase().includes(query)) ||
      (u.phone && u.phone.toLowerCase().includes(query)) ||
      (u.email && u.email.toLowerCase().includes(query))
    );
  }

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; color:var(--text-tertiary); padding:30px;">Пользователи не найдены</td></tr>`;
    return;
  }

  tbody.innerHTML = filtered.map(u => {
    const coordsStr = u.coords
      ? `${u.coords[0].toFixed(4)}, ${u.coords[1].toFixed(4)}`
      : '<span style="color:var(--text-tertiary); font-style:italic;">Не зафиксированы</span>';

    const roleBadge = u.role === 'admin'
      ? `<span class="badge" style="border-color:var(--accent); color:var(--accent);">Админ</span>`
      : `<span class="badge">Следопыт</span>`;

    const actionBtn = u.coords ? `
      <button class="btn btn-secondary btn-sm" onclick="showUserOnRadar(${u.coords[0]}, ${u.coords[1]})" style="white-space:nowrap; padding:4px 8px; font-size:11px;">
        🎯 На радаре
      </button>
    ` : `<span style="color:var(--text-tertiary); font-size:11px;">—</span>`;

    return `
      <tr>
        <td>
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:28px; height:28px; border-radius:6px; background:var(--accent); color:#fff; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:12px;">
              ${(u.callsign || u.username || 'S')[0].toUpperCase()}
            </div>
            <div>
              <div style="font-weight:600; color:var(--text-primary);">${u.callsign || u.username}</div>
              <div style="font-size:var(--text-xs); color:var(--text-tertiary);">@${u.username}</div>
            </div>
          </div>
        </td>
        <td>
          <code style="color:var(--accent); font-weight:700; font-size:var(--text-xs); letter-spacing:0.04em;">${u.phone}</code>
        </td>
        <td style="font-size:var(--text-xs); color:var(--text-secondary);">${u.email || '—'}</td>
        <td>${roleBadge}</td>
        <td style="font-family:monospace; font-size:var(--text-xs);">${coordsStr}</td>
        <td style="font-size:var(--text-xs); color:var(--text-secondary);">${u.last_seen || u.created_at || '—'}</td>
        <td>${actionBtn}</td>
      </tr>
    `;
  }).join('');
}

function showUserOnRadar(lat, lng) {
  // Switch to radar tab
  document.querySelectorAll('.admin-nav-item').forEach(el => el.classList.remove('active'));
  const radarBtn = document.querySelector('.admin-nav-item[data-status="radar"]');
  if (radarBtn) radarBtn.classList.add('active');

  adminCurrentFilter = 'radar';
  const listEl = document.getElementById('submissions-list');
  const radarContainer = document.getElementById('radar-container');
  const usersContainer = document.getElementById('users-container');
  if (listEl) listEl.style.display = 'none';
  if (usersContainer) usersContainer.style.display = 'none';
  if (radarContainer) radarContainer.style.display = 'flex';

  loadRadar([lat, lng]);
}

/* ── Approve ─────────────────────────────────────────────── */
async function approveSubmission(subId) {
  const btn = event.currentTarget;
  if (btn) { btn.disabled = true; btn.textContent = 'Обработка...'; }

  try {
    await API.post(`/admin/submissions/${subId}/approve`, {});
    Toast.success('Заявка одобрена! Объект добавлен на карту.');
    await loadSubmissions();
    await loadStats();
  } catch (e) {
    Toast.error(e.message || 'Ошибка при одобрении');
    if (btn) { btn.disabled = false; }
  }
}

/* ── Reject Modal ────────────────────────────────────────── */
function openRejectModal(subId) {
  rejectTargetId = subId;
  const modal = document.getElementById('reject-modal');
  const input = document.getElementById('reject-resolution-input');
  if (input) input.value = '';
  if (modal) modal.classList.add('open');
}

function closeRejectModal() {
  rejectTargetId = null;
  const modal = document.getElementById('reject-modal');
  if (modal) modal.classList.remove('open');
}

function setResolutionTemplate(n) {
  const templates = {
    1: 'Недостаточно фотографий: требуется минимум 2–3 чётких снимка объекта с разных ракурсов.',
    2: 'Неверные координаты: по указанному местоположению объект не обнаружен или координаты не соответствуют действительности.',
    3: 'Дублирующийся объект: аналогичный объект уже зарегистрирован в базе данных под другим идентификатором.',
  };
  const el = document.getElementById('reject-resolution-input');
  if (el && templates[n]) el.value = templates[n];
}

async function confirmReject() {
  const resolution = (document.getElementById('reject-resolution-input')?.value || '').trim();
  if (!resolution) {
    Toast.error('Укажите причину отклонения');
    return;
  }
  const btn = document.getElementById('btn-confirm-reject');
  if (btn) { btn.disabled = true; btn.textContent = 'Обработка...'; }

  try {
    await API.post(`/admin/submissions/${rejectTargetId}/reject`, { resolution });
    Toast.success('Заявка отклонена.');
    closeRejectModal();
    await loadSubmissions();
    await loadStats();
  } catch (e) {
    Toast.error(e.message || 'Ошибка при отклонении');
    if (btn) { btn.disabled = false; btn.textContent = 'Отклонить'; }
  }
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  renderNavAuth();
  loadStats();
  loadSubmissions();

  // Filter nav items
  document.querySelectorAll('.admin-nav-item[data-status]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.admin-nav-item[data-status]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      adminCurrentFilter = btn.dataset.status;
      renderSubmissions();
    });
  });

  // Reject modal actions
  const closeBtns = [
    document.getElementById('modal-close-btn'),
    document.getElementById('btn-cancel-reject'),
  ];
  closeBtns.forEach(b => b && b.addEventListener('click', closeRejectModal));

  const confirmBtn = document.getElementById('btn-confirm-reject');
  if (confirmBtn) confirmBtn.addEventListener('click', confirmReject);

  const modal = document.getElementById('reject-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeRejectModal();
    });
  }
});
