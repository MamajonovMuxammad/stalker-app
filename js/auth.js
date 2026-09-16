/* ==========================================================
   STALKER — Auth & Captcha Controller v2.0
   Modern Dark UI: Captcha + Auth form handling
   ========================================================== */

let isRegisterMode = false;
let currentCaptchaCode = '';

// Generate clean, modern high-contrast security captcha
function generateCaptcha() {
  const canvas = document.getElementById('captcha-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;

  // Characters (exclude ambiguous 0/O, 1/I, L)
  const chars = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  currentCaptchaCode = code;

  // Dark background matching --bg-overlay / #161616
  ctx.fillStyle = '#161616';
  ctx.fillRect(0, 0, w, h);

  // Subtle grid lines
  ctx.strokeStyle = '#222222';
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 16) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = 0; y < h; y += 16) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }

  // Wavy interference line
  ctx.strokeStyle = 'rgba(37, 99, 235, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, h / 2 + Math.sin(0) * 8);
  for (let x = 0; x < w; x += 5) {
    ctx.lineTo(x, h / 2 + Math.sin(x * 0.08) * 10);
  }
  ctx.stroke();

  // Subtle background dots
  for (let i = 0; i < 40; i++) {
    ctx.fillStyle = Math.random() > 0.5 ? 'rgba(241, 241, 241, 0.15)' : 'rgba(37, 99, 235, 0.2)';
    ctx.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5);
  }

  // Draw characters with modern font styling
  const startX = 22;
  const spacing = 26;

  for (let i = 0; i < code.length; i++) {
    ctx.save();
    const charX = startX + i * spacing;
    const charY = 34 + (Math.random() * 4 - 2);
    const angle = (Math.random() * 20 - 10) * Math.PI / 180;

    ctx.translate(charX, charY);
    ctx.rotate(angle);

    ctx.font = '700 22px "Inter", -apple-system, sans-serif';
    ctx.fillStyle = i % 2 === 0 ? '#F1F1F1' : '#60A5FA';
    ctx.fillText(code[i], 0, 0);

    ctx.restore();
  }
}

// Alias for backwards compatibility
const generateScrapCaptcha = generateCaptcha;

// Global mode switcher called by modern auth.html tabs
window.setAuthMode = function (mode) {
  isRegisterMode = (mode === 'register');
  clearErrors();
  generateCaptcha();
};

function toggleAuthMode() {
  isRegisterMode = !isRegisterMode;
  const formTitle = document.getElementById('auth-title');
  const formDesc = document.getElementById('auth-desc');
  const submitBtn = document.getElementById('auth-submit-btn');
  const switchText = document.getElementById('auth-switch-text');
  const toggleBtn = document.getElementById('auth-toggle-mode');
  const regFields = document.querySelectorAll('.register-only');

  clearErrors();

  if (isRegisterMode) {
    if (formTitle) formTitle.textContent = 'Создать аккаунт';
    if (formDesc) formDesc.textContent = 'Присоединяйтесь к сообществу исследователей';
    if (submitBtn) submitBtn.textContent = 'Зарегистрироваться';
    if (switchText) switchText.textContent = 'Уже есть аккаунт?';
    if (toggleBtn) toggleBtn.textContent = 'Войти';
    regFields.forEach(f => f.style.display = 'flex');
  } else {
    if (formTitle) formTitle.textContent = 'Войдите в аккаунт';
    if (formDesc) formDesc.textContent = 'Добро пожаловать обратно';
    if (submitBtn) submitBtn.textContent = 'Войти';
    if (switchText) switchText.textContent = 'Впервые у нас?';
    if (toggleBtn) toggleBtn.textContent = 'Регистрация';
    regFields.forEach(f => f.style.display = 'none');
  }

  generateCaptcha();
}

function clearErrors() {
  document.querySelectorAll('.form-error, .field-error').forEach(el => {
    el.textContent = '';
    el.style.display = 'none';
  });
  document.querySelectorAll('.input, .field-input').forEach(el => el.classList.remove('error'));
}

function setError(fieldId, errorMsg) {
  const input = document.getElementById(fieldId);
  const cleanId = fieldId.replace('auth-', '');
  const errEl = document.getElementById(`err-${cleanId}`);

  if (input) input.classList.add('error');
  if (errEl) {
    errEl.textContent = errorMsg;
    errEl.style.display = 'flex';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  clearErrors();

  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  const captcha = document.getElementById('auth-captcha').value.trim().toUpperCase();

  let hasError = false;

  if (!username) {
    setError('auth-username', 'Введите имя пользователя или логин');
    hasError = true;
  }

  if (!password) {
    setError('auth-password', 'Введите пароль');
    hasError = true;
  } else if (password.length < 6) {
    setError('auth-password', 'Пароль должен содержать не менее 6 символов');
    hasError = true;
  }

  if (!captcha) {
    setError('auth-captcha', 'Введите проверочный код');
    hasError = true;
  } else if (captcha !== currentCaptchaCode) {
    setError('auth-captcha', 'Неверный проверочный код');
    generateCaptcha();
    hasError = true;
  }

  let email = '';
  let callsign = '';
  if (isRegisterMode) {
    const emailEl = document.getElementById('auth-email');
    const callsignEl = document.getElementById('auth-callsign');
    email = emailEl ? emailEl.value.trim() : '';
    callsign = callsignEl ? callsignEl.value.trim() : '';

    if (!email) {
      setError('auth-email', 'Укажите email адрес');
      hasError = true;
    } else if (!email.includes('@')) {
      setError('auth-email', 'Введите корректный email адрес');
      hasError = true;
    }
  }

  if (hasError) return;

  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Проверка...';
  }

  try {
    if (isRegisterMode) {
      await Auth.register(username, password, email, callsign);
      Toast.success('Регистрация успешна! Добро пожаловать');
    } else {
      await Auth.login(username, password);
      Toast.success('Успешный вход в аккаунт');
    }

    setTimeout(() => {
      window.location.href = '/';
    }, 700);
  } catch (err) {
    Toast.error(err.message || 'Ошибка авторизации. Проверьте данные');
    generateCaptcha();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  generateCaptcha();

  const canvas = document.getElementById('captcha-canvas');
  if (canvas) {
    canvas.addEventListener('click', generateCaptcha);
  }

  const refreshBtn = document.getElementById('captcha-refresh');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', generateCaptcha);
  }

  const toggleBtn = document.getElementById('auth-toggle-mode');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', toggleAuthMode);
  }

  const form = document.getElementById('auth-form');
  if (form) {
    form.addEventListener('submit', handleAuthSubmit);
  }
});
