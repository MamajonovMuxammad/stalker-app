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
  const globalErr = document.getElementById('auth-global-error');
  if (globalErr) {
    globalErr.textContent = '';
    globalErr.style.display = 'none';
  }
  document.querySelectorAll('.input, .field-input').forEach(el => el.classList.remove('error'));
}

window.showPendingScreen = function(username) {
  const form = document.getElementById('auth-form');
  const tabsWrap = document.getElementById('auth-tabs-wrapper');
  const title = document.getElementById('auth-title');
  const desc = document.getElementById('auth-desc');
  const pendingScreen = document.getElementById('auth-pending-screen');
  const userDisplay = document.getElementById('pending-username-display');

  if (form) form.style.display = 'none';
  if (tabsWrap) tabsWrap.style.display = 'none';
  if (title) title.style.display = 'none';
  if (desc) desc.style.display = 'none';
  if (userDisplay) userDisplay.textContent = '@' + username;
  if (pendingScreen) pendingScreen.style.display = 'block';
};

window.showLoginFormAfterPending = function() {
  const form = document.getElementById('auth-form');
  const tabsWrap = document.getElementById('auth-tabs-wrapper');
  const title = document.getElementById('auth-title');
  const desc = document.getElementById('auth-desc');
  const pendingScreen = document.getElementById('auth-pending-screen');

  if (pendingScreen) pendingScreen.style.display = 'none';
  if (tabsWrap) tabsWrap.style.display = 'block';
  if (title) title.style.display = 'block';
  if (desc) desc.style.display = 'block';
  if (form) form.style.display = 'block';
  if (window.switchMode) window.switchMode('login');
};

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

// ── Strict Uzbekistan Phone Mask & Validation ─────────────
const UZ_OPERATOR_CODES = ['20', '33', '50', '55', '61', '62', '65', '66', '67', '69', '70', '71', '72', '73', '74', '75', '76', '77', '78', '79', '88', '90', '91', '93', '94', '95', '97', '98', '99'];

function formatUzPhoneInput(input) {
  let val = input.value.replace(/\D/g, '');
  if (val.startsWith('998')) {
    val = val.slice(3);
  }
  // Max 9 subscriber digits
  val = val.slice(0, 9);

  let formatted = '+998';
  if (val.length > 0) {
    formatted += ' (' + val.slice(0, 2);
  }
  if (val.length >= 2) {
    formatted += ') ' + val.slice(2, 5);
  }
  if (val.length >= 5) {
    formatted += '-' + val.slice(5, 7);
  }
  if (val.length >= 7) {
    formatted += '-' + val.slice(7, 9);
  }
  input.value = formatted;
}

function validateUzPhone(raw) {
  if (!raw || !raw.trim()) {
    return { valid: false, error: 'Укажите номер телефона' };
  }
  const digits = raw.replace(/\D/g, '');
  let sub = '';
  if (digits.startsWith('998')) {
    sub = digits.slice(3);
  } else if (digits.length === 9) {
    sub = digits;
  } else {
    return {
      valid: false,
      error: 'Введите полный номер: +998 (XX) XXX-XX-XX (ровно 9 цифр после +998)'
    };
  }

  if (sub.length !== 9) {
    return {
      valid: false,
      error: `Номер не завершён (введено ${sub.length} из 9 цифр после +998)`
    };
  }

  const op = sub.slice(0, 2);
  if (!UZ_OPERATOR_CODES.includes(op)) {
    return {
      valid: false,
      error: `Неверный код оператора (+998 ${op}). Разрешены: 90, 91, 93, 94, 95, 97, 98, 99, 33, 88, 77, 20 и др.`
    };
  }

  return {
    valid: true,
    normalized: '+998' + sub,
    display: `+998 (${op}) ${sub.slice(2, 5)}-${sub.slice(5, 7)}-${sub.slice(7, 9)}`
  };
}

// Send TG Code Button Handler
async function handleSendTgCode() {
  clearErrors();
  const phoneEl = document.getElementById('auth-phone');
  const phoneCheck = validateUzPhone(phoneEl ? phoneEl.value : '');

  if (!phoneCheck.valid) {
    setError('auth-phone', phoneCheck.error);
    if (phoneEl) phoneEl.focus();
    return;
  }

  const phone = phoneCheck.normalized;

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

    // Username validation: Latin letters, numbers, underscore only (no Cyrillic)
    const latinRegex = /^[a-zA-Z0-9_]{3,30}$/;
    if (!latinRegex.test(username)) {
      setError('auth-username', 'Логин должен содержать только латинские буквы (a-z), цифры и _ (от 3 до 30 знаков, без кириллицы)');
      hasError = true;
    }

    // Callsign validation: Russian and English allowed
    if (callsign) {
      const callsignRegex = /^[a-zA-Zа-яА-ЯёЁ0-9\s_-]{2,30}$/;
      if (!callsignRegex.test(callsign)) {
        setError('auth-callsign', 'Позывной может содержать только русские и латинские буквы, цифры, дефис и пробелы');
        hasError = true;
      }
    }

    if (!email) {
      setError('auth-email', 'Укажите email адрес');
      hasError = true;
    } else if (!email.includes('@')) {
      setError('auth-email', 'Введите корректный email адрес');
      hasError = true;
    }

    const phoneCheck = validateUzPhone(phoneEl ? phoneEl.value : '');
    if (!phoneCheck.valid) {
      setError('auth-phone', phoneCheck.error);
      hasError = true;
    } else {
      phone = phoneCheck.normalized;
    }

    if (!tgCode) {
      const codeGroup = document.getElementById('tg-code-group');
      if (codeGroup) codeGroup.style.display = 'block';
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
      const res = await Auth.register(username, password, email, callsign, phone, tgCode, lat, lng);
      if (res && res.status === 'pending') {
        showPendingScreen(username);
        return;
      }
      Toast.success('Регистрация успешна! Допуск оформлен.');
      setTimeout(() => { window.location.href = '/'; }, 700);
    } else {
      await Auth.login(username, password, lat, lng);
      Toast.success('Успешный вход в аккаунт');
      setTimeout(() => { window.location.href = '/'; }, 700);
    }
  } catch (err) {
    const errorMsg = err.message || 'Ошибка авторизации. Проверьте введенные данные';
    Toast.error(errorMsg);
    const globalErr = document.getElementById('auth-global-error');
    if (globalErr) {
      globalErr.textContent = errorMsg;
      globalErr.style.display = 'block';
      globalErr.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    generateCaptcha();
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = isRegisterMode ? 'Зарегистрироваться' : 'Войти';
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // If user is already logged in, send them to the map
  if (typeof Auth !== 'undefined' && Auth.isLoggedIn()) {
    window.location.replace('/');
    return;
  }

  generateCaptcha();

  const canvas = document.getElementById('captcha-canvas');
  if (canvas) canvas.addEventListener('click', generateCaptcha);

  const refreshBtn = document.getElementById('captcha-refresh');
  if (refreshBtn) refreshBtn.addEventListener('click', generateCaptcha);

  const sendTgBtn = document.getElementById('btn-send-tg-code');
  if (sendTgBtn) sendTgBtn.addEventListener('click', handleSendTgCode);

  const phoneInput = document.getElementById('auth-phone');
  if (phoneInput) {
    phoneInput.addEventListener('focus', () => {
      if (!phoneInput.value.trim()) phoneInput.value = '+998 (';
    });
    phoneInput.addEventListener('blur', () => {
      const d = phoneInput.value.replace(/\D/g, '');
      if (d === '998' || d === '') phoneInput.value = '';
    });
    phoneInput.addEventListener('input', () => {
      formatUzPhoneInput(phoneInput);
    });
  }

  const form = document.getElementById('auth-form');
  if (form) form.addEventListener('submit', handleAuthSubmit);
});
