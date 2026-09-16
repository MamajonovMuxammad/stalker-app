/* ==========================================================
   STALKER — Submit Location Form Controller v2.1
   Direct image upload + coordinate picker + auth verification
   ========================================================== */

let pickerMap = null;
let pickerMarker = null;
let uploadedPhotoUrls = [];

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

/* ── Picker Map ──────────────────────────────────────────── */
function initPickerMap() {
  const mapEl = document.getElementById('sub-picker-map');
  if (!mapEl || pickerMap) return;

  pickerMap = L.map('sub-picker-map', {
    center: [41.3111, 69.2406],
    zoom: 12,
    zoomControl: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(pickerMap);

  pickerMap.on('click', e => {
    const { lat, lng } = e.latlng;
    const latEl = document.getElementById('sub-lat');
    const lngEl = document.getElementById('sub-lng');
    if (latEl) latEl.value = lat.toFixed(6);
    if (lngEl) lngEl.value = lng.toFixed(6);

    if (pickerMarker) {
      pickerMarker.setLatLng([lat, lng]);
    } else {
      pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
    }
  });

  // Sync inputs → marker
  ['sub-lat', 'sub-lng'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', syncPickerFromInputs);
  });

  syncPickerFromInputs();
}

function syncPickerFromInputs() {
  const lat = parseFloat(document.getElementById('sub-lat')?.value);
  const lng = parseFloat(document.getElementById('sub-lng')?.value);
  if (isNaN(lat) || isNaN(lng) || !pickerMap) return;
  if (pickerMarker) {
    pickerMarker.setLatLng([lat, lng]);
  } else {
    pickerMarker = L.marker([lat, lng]).addTo(pickerMap);
  }
  pickerMap.setView([lat, lng], pickerMap.getZoom());
}

/* ── File Upload Handling ────────────────────────────────── */
function setupFileUpload() {
  const fileInput = document.getElementById('sub-file-input');
  const dropzone = document.getElementById('sub-dropzone');

  if (!fileInput || !dropzone) return;

  // File input change
  fileInput.addEventListener('change', e => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(Array.from(e.target.files));
      fileInput.value = '';
    }
  });

  // Drag & drop
  ['dragenter', 'dragover'].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.add('drag-over');
    });
  });

  ['dragleave', 'drop'].forEach(name => {
    dropzone.addEventListener(name, e => {
      e.preventDefault();
      e.stopPropagation();
      dropzone.classList.remove('drag-over');
    });
  });

  dropzone.addEventListener('drop', e => {
    const dt = e.dataTransfer;
    if (dt && dt.files && dt.files.length > 0) {
      handleFiles(Array.from(dt.files));
    }
  });
}

async function handleFiles(files) {
  const imageFiles = files.filter(f => f.type.startsWith('image/'));
  if (imageFiles.length === 0) {
    Toast.error('Пожалуйста, выберите файлы изображений (PNG, JPG, WEBP)');
    return;
  }

  for (const file of imageFiles) {
    await uploadSingleFile(file);
  }
}

async function uploadSingleFile(file) {
  const previewsContainer = document.getElementById('sub-previews');
  if (!previewsContainer) return;

  // Placeholder thumbnail
  const tempId = 'prev-' + Math.random().toString(36).substring(2, 9);
  const itemEl = document.createElement('div');
  itemEl.className = 'upload-preview-item';
  itemEl.id = tempId;
  itemEl.innerHTML = `
    <div class="upload-preview-loading">
      <div class="loading-spinner" style="width:20px;height:20px;"></div>
    </div>
  `;
  previewsContainer.appendChild(itemEl);

  const formData = new FormData();
  formData.append('files', file);

  try {
    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Ошибка загрузки');

    const uploadedUrl = data.urls ? data.urls[0] : data.url;
    if (uploadedUrl) {
      uploadedPhotoUrls.push(uploadedUrl);
      itemEl.innerHTML = `
        <img src="${uploadedUrl}" alt="Загруженное фото" />
        <button type="button" class="upload-preview-remove" onclick="removePhoto('${uploadedUrl}', '${tempId}')" title="Удалить">×</button>
      `;
      Toast.success(`Фото ${file.name} загружено`);
    } else {
      itemEl.remove();
    }
  } catch (err) {
    Toast.error(err.message || `Ошибка загрузки файла ${file.name}`);
    itemEl.remove();
  }
}

window.removePhoto = function(url, elementId) {
  uploadedPhotoUrls = uploadedPhotoUrls.filter(u => u !== url);
  const el = document.getElementById(elementId);
  if (el) el.remove();
};

/* ── Form Validation ─────────────────────────────────────── */
function clearFieldError(inputId, errorId) {
  const el = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  if (el)  el.classList.remove('error');
  if (err) { err.textContent = ''; err.style.display = 'none'; }
}

function setFieldError(inputId, errorId, msg) {
  const el = document.getElementById(inputId);
  const err = document.getElementById(errorId);
  if (el)  el.classList.add('error');
  if (err) { err.textContent = msg; err.style.display = 'flex'; }
  return true;
}

/* ── Submit Handler ──────────────────────────────────────── */
async function handleSubmit(e) {
  e.preventDefault();

  if (!Auth.isLoggedIn()) {
    Toast.error('Необходима авторизация для отправки заявки');
    setTimeout(() => window.location.href = '/auth.html', 1200);
    return;
  }

  clearFieldError('sub-name',        'err-sub-name');
  clearFieldError('sub-region',      'err-sub-region');
  clearFieldError('sub-description', 'err-sub-desc');

  const name        = document.getElementById('sub-name')?.value.trim() || '';
  const type        = document.getElementById('sub-type')?.value || 'abandoned';
  const region      = document.getElementById('sub-region')?.value.trim() || '';
  const description = document.getElementById('sub-description')?.value.trim() || '';
  const access      = document.getElementById('sub-access')?.value.trim() || '';
  const difficulty  = parseInt(document.getElementById('sub-difficulty')?.value || '3');
  const lat         = parseFloat(document.getElementById('sub-lat')?.value);
  const lng         = parseFloat(document.getElementById('sub-lng')?.value);

  const icon        = document.getElementById('sub-icon')?.value || 'bunker';
  const color       = document.getElementById('sub-color')?.value || '#2563EB';

  // Manual URLs if any
  const manualRaw   = document.getElementById('sub-photos-url')?.value || '';
  const manualUrls  = manualRaw.split('\n').map(s => s.trim()).filter(Boolean);

  const photos = [...uploadedPhotoUrls, ...manualUrls];

  let hasError = false;
  if (!name)        { setFieldError('sub-name',        'err-sub-name',  'Укажите название объекта');      hasError = true; }
  if (!region)      { setFieldError('sub-region',      'err-sub-region', 'Укажите регион');               hasError = true; }
  if (!description) { setFieldError('sub-description', 'err-sub-desc',  'Добавьте описание объекта');     hasError = true; }
  if (hasError) return;

  const btn = document.getElementById('btn-submit-action');
  if (btn) { btn.disabled = true; btn.textContent = 'Отправка...'; }

  try {
    await API.post('/submissions', {
      name, type, icon, color, region, description, access, difficulty,
      lat: isNaN(lat) ? null : lat,
      lng: isNaN(lng) ? null : lng,
      photos,
    });
    Toast.success('Заявка успешно отправлена! Ожидайте проверки модераторов.');
    setTimeout(() => window.location.href = '/', 1800);
  } catch (err) {
    Toast.error(err.message || 'Ошибка при отправке. Попробуйте позже.');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Отправить заявку`;
    }
  }
}

function setupPickers() {
  // Difficulty picker
  document.querySelectorAll('#difficulty-picker .difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#difficulty-picker .difficulty-btn').forEach(b => {
        b.classList.remove('active');
        b.style.background = 'var(--bg-hover)';
        b.style.borderColor = 'var(--border)';
        b.style.color = 'var(--text-secondary)';
      });
      btn.classList.add('active');
      btn.style.background = 'var(--accent-light)';
      btn.style.borderColor = 'var(--accent)';
      btn.style.color = 'var(--accent)';
      const input = document.getElementById('sub-difficulty');
      if (input) input.value = btn.dataset.val;
    });
  });

  // Icon picker
  document.querySelectorAll('#icon-picker .icon-picker-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#icon-picker .icon-picker-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const input = document.getElementById('sub-icon');
      if (input) input.value = btn.dataset.icon;
    });
  });

  // Color picker
  document.querySelectorAll('#color-picker .color-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('#color-picker .color-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const input = document.getElementById('sub-color');
      if (input) input.value = btn.dataset.color;
    });
  });
}

/* ── Init ────────────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  setupNavAuth();
  initPickerMap();
  setupFileUpload();
  setupPickers();

  const form = document.getElementById('submit-location-form');
  if (form) form.addEventListener('submit', handleSubmit);

  if (!Auth.isLoggedIn()) {
    Toast.info('Войдите в аккаунт, чтобы отправить заявку');
  }
});
