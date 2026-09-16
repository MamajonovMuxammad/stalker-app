/* ==========================================================
   STALKER — Admin / Moderation Panel v2
   ========================================================== */

let adminCurrentFilter = 'all';
let allSubmissions = [];
let rejectTargetId = null;

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
    if (el('stat-total-locs'))   el('stat-total-locs').textContent   = stats.total_locations   || 0;
    if (el('stat-pending-subs')) el('stat-pending-subs').textContent = stats.pending_submissions || 0;
    if (el('stat-rejected-subs')) el('stat-rejected-subs').textContent = stats.rejected_submissions || 0;
    if (el('stat-users-count'))  el('stat-users-count').textContent  = stats.registered_stalkers || 0;
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

  // Close modal on backdrop click
  const modal = document.getElementById('reject-modal');
  if (modal) {
    modal.addEventListener('click', e => {
      if (e.target === modal) closeRejectModal();
    });
  }
});
