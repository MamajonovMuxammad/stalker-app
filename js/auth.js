/* ==========================================================
   STALKER — Auth & Captcha Controller v2.2
   Telegram Phone Verification + Geolocation + Dark Captcha
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

  // Draw characters
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

// Global mode switcher
window.setAuthMode = function(mode) {
  isRegisterMode = (mode === 'register');
  clearErrors();
  generateCaptcha();
};

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

// Browser Geolocation Helper
function getCoordinates() {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve({ lat: null, lng: null });
      return;
    }
    navigator.geolocation.getCurrentPosition(
      pos => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve({ lat: null, lng: null }),
      { timeout: 4000, enableHighAccuracy: false }
    );
  });
}

// Send TG Code Button Handler
async function handleSendTgCode() {
  clearErrors();
  const phoneEl = document.getElementById('auth-phone');
  const phone = phoneEl ? phoneEl.value.trim().replace(/\s+/g, '') : '';

  if (!phone || phone.length < 9) {
    setError('auth-phone', 'Введите номер телефона (например: +998901234567)');
    return;
  }

  const btn = document.getElementById('btn-send-tg-code');
  if (btn) { btn.disabled = true; btn.textContent = 'Связь со СБ...'; }

  try {
    const data = await API.post('/auth/send-tg-code', { phone });

    // Show TG Code input group
    const codeGroup = document.getElementById('tg-code-group');
    if (codeGroup) {
      codeGroup.style.display = 'block';
    }

    // Auto-focus code input
    const codeInput = document.getElementById('auth-tg-code');
    if (codeInput) {
      codeInput.focus();
    }

    // Open Telegram Bot directly
    const botUrl = data.bot_url || `https://t.me/stalker_recon_bot?start=verify_${data.code || ''}`;
    window.open(botUrl, '_blank');

    Toast.success('Бот открыт в Telegram! Скопируйте 6-значный код.');

    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
        <span>Открыть бота повторно</span>
      `;
    }
  } catch (err) {
    Toast.error(err.message || 'Ошибка связи с сервером');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.75-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/></svg>
        <span>Получить код в Telegram-боте</span>
      `;
    }
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
  let phone = '';
  let tgCode = '';

  if (isRegisterMode) {
    const emailEl = document.getElementById('auth-email');
    const callsignEl = document.getElementById('auth-callsign');
    const phoneEl = document.getElementById('auth-phone');
    const tgCodeEl = document.getElementById('auth-tg-code');

    email = emailEl ? emailEl.value.trim() : '';
    callsign = callsignEl ? callsignEl.value.trim() : '';
    phone = phoneEl ? phoneEl.value.trim().replace(/\s+/g, '') : '';
    tgCode = tgCodeEl ? tgCodeEl.value.trim() : '';

    if (!email) {
      setError('auth-email', 'Укажите email адрес');
      hasError = true;
    } else if (!email.includes('@')) {
      setError('auth-email', 'Введите корректный email адрес');
      hasError = true;
    }

    if (!phone) {
      setError('auth-phone', 'Укажите номер телефона');
      hasError = true;
    }

    if (!tgCode) {
      const codeGroup = document.getElementById('tg-code-group');
      if (codeGroup) codeGroup.style.display = 'flex';
      setError('auth-tg-code', 'Получите и введите 6-значный код из Telegram бота');
      hasError = true;
    }
  }

  if (hasError) return;

  const submitBtn = document.getElementById('auth-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Авторизация и проверка...';
  }

  // Request Geolocation
  const { lat, lng } = await getCoordinates();

  try {
    if (isRegisterMode) {
      await Auth.register(username, password, email, callsign, phone, tgCode, lat, lng);
      Toast.success('Регистрация успешна! Допуск оформлен.');
    } else {
      await Auth.login(username, password, lat, lng);
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
  if (canvas) canvas.addEventListener('click', generateCaptcha);

  const refreshBtn = document.getElementById('captcha-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', generateCaptcha);

  const sendTgBtn = document.getElementById('btn-send-tg-code');
  if (sendTgBtn) sendTgBtn.addEventListener('click', handleSendTgCode);

  const form = document.getElementById('auth-form');
  if (form) form.addEventListener('submit', handleAuthSubmit);
});
