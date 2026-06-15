/* global jalaliDatepicker */
/* global NiceSelect */

let USE_MINIMUM_HOUR = true;
let USE_ROUND_DOWN_PRICE = false;
let USE_ROUND_UP_PRICE = false;
let editingDeviceId = null;
let DEVICES = []; // لیست دستگاه‌ها
let cafeMenu = [];
let TABLE_CONFIGS = {}; // تنظیمات میزها
let TOTAL_TABLES = 0;
let currentTrashSessions = [];
let currentTrashPage = 1;
let currentTrashTotalPages = 1;
let currentTrashLimit = 6;
let editingDeviceIndex = -1;
let showClosedSessions = true;
let activeModalSessionId = null;
let currentSelectedDate = null;
let originalCafeItems = [];
let currentCafeQuantities = {};
let gameNet = {};
let tableSelect;
// ========== اضافات جدید برای ارتباط با API ==========
let userRole = null; // 'admin' یا 'superAdmin'
let currentGameNetId = null; // برای سوپرادمین انتخاب شده
//console.log(typeof NiceSelect);
// Helper: درخواست fetch با توکن
let isRefreshing = false;
let failedQueue = [];

function processQueue(error, token = null) {
  failedQueue.forEach((prom) => {
    if (error) prom.reject(error);
    else prom.resolve(token);
  });
  failedQueue = [];
}

async function apiFetch(url, options = {}) {
  const token = localStorage.getItem('accessToken');
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (token && !options.noAuth) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const makeRequest = async (customToken) => {
    if (customToken) headers['Authorization'] = `Bearer ${customToken}`;
    const response = await fetch(url, { ...options, headers });
    if (response.status === 401 && !options._retry) {
      // تلاش برای رفرش توکن
      if (isRefreshing) {
        // اگر در حال رفرش هستیم، درخواست را در صف قرار بده
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then((newToken) => {
          return apiFetch(url, { ...options, _retry: true });
        });
      }
      isRefreshing = true;
      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');
        const refreshRes = await fetch('/api/v1/auth/refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!refreshRes.ok) throw new Error('Refresh failed');
        const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
          await refreshRes.json();
        localStorage.setItem('accessToken', newAccessToken);
        localStorage.setItem('refreshToken', newRefreshToken);
        processQueue(null, newAccessToken);
        // درخواست اصلی را با توکن جدید تکرار کن
        return apiFetch(url, { ...options, _retry: true });
      } catch (err) {
        processQueue(err, null);
        // رفرش ناموفق: پاک کردن توکن‌ها و رفتن به لاگین
        localStorage.removeItem('accessToken');
        localStorage.removeItem('refreshToken');
        localStorage.removeItem('user');
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('appScreen').style.display = 'none';
        throw new Error('Session expired. Please login again.');
      } finally {
        isRefreshing = false;
      }
    }
    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorJson = await response.json();
        errorMessage = errorJson.message || errorMessage;
      } catch (e) {}
      throw new Error(errorMessage);
    }
    if (response.status === 204) return null;
    return response.json();
  };

  return makeRequest();
}
function debounce(func, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => func.apply(this, args), delay);
  };
}
// دریافت gameNetId جاری (با توجه به نقش کاربر)
async function getCurrentGameNetId() {
  if (userRole === 'superAdmin') {
    const select = document.getElementById('gameNetSelect');
    if (select && select.value) return select.value;
    // اگر سلکت مقدار نداشت، لیست گیم‌نت‌ها را بگیر و اولین را انتخاب کن
    const gameNets = await apiFetch('/api/v1/gameNets');
    if (gameNets && gameNets.length) {
      const firstId = gameNets[0]._id;
      if (select) select.value = firstId;
      return firstId;
    }
    throw new Error('هیچ گیم‌نتی موجود نیست');
  } else {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    const gameNetId = user.gameNetId?._id || user.gameNetId;
    if (!gameNetId) throw new Error('gameNetId برای ادمین تعریف نشده');
    return gameNetId;
  }
}

// بارگذاری دستگاه‌ها از API
async function loadDevicesFromAPI() {
  const gameNetId = await getCurrentGameNetId();
  const devices = await apiFetch(`/api/v1/devices?gameNetId=${gameNetId}`);
  DEVICES = devices; // مقداردهی مستقیم به متغیر سراسری

  TABLE_CONFIGS = {};
  devices.forEach((dev, idx) => {
    TABLE_CONFIGS[dev.name] = {
      console: dev.console,
      isVip: dev.vip || dev.royal || dev.legendary,
      customName: dev.name,
      deviceId: dev._id,
      vip: dev.vip,
      royal: dev.royal,
      legendary: dev.legendary,
      pricingType: dev.pricingType,
      modes: dev.modes,
      prices: dev.prices,
    };
  });
  TOTAL_TABLES = devices.length;
  generateTableSelect();
}

// بارگذاری منوی کافه از API
async function loadCafeMenuFromAPI() {
  const gameNetId = await getCurrentGameNetId();
  const items = await apiFetch(`/api/v1/cafe?gameNetId=${gameNetId}`);
  cafeMenu = items; // ← تغییر: اینجا cafeMenu را مقداردهی کنید (بدون window)
  renderCafeMenus();
}

// بارگذاری جلسات یک روز از API
async function loadSessionsFromAPI(date) {
  const gameNetId = await getCurrentGameNetId();
  let sessions = await apiFetch(
    `/api/v1/sessions?gameNetId=${gameNetId}&date=${date}`
  );
  if (sessions && Array.isArray(sessions)) {
    sessions = sessions.map((session) => {
      if (session.status === 'active') {
        const storedEnd = loadCountdownFromLocalStorage(session._id);
        if (storedEnd) {
          session.countdownEnd = storedEnd;
          session.countdownActive = true;
        } else {
          session.countdownEnd = null;
          session.countdownActive = false;
        }
      }
      return session;
    });
  }
  gameNet[date] = sessions;
}

async function loadGameNetSettings() {
  try {
    const gameNetId = await getCurrentGameNetId();
    const gameNet = await apiFetch(`/api/v1/gameNets/${gameNetId}`);

    currentGameNetName = gameNet.name;
    currentPriceUnit = gameNet.settings?.priceUnit || 'Toman';
    USE_MINIMUM_HOUR = gameNet.settings?.useMinimumHour ?? true;
    USE_ROUND_DOWN_PRICE = gameNet.settings?.useRoundDownPrice ?? false;
    SECURITY_SETTINGS = gameNet.settings?.securitySettings || {};
    USE_ROUND_UP_PRICE = gameNet.settings?.useRoundUpPrice ?? false;

    // به‌روزرسانی UI
    document.getElementById('gameNetNameInput').value = currentGameNetName;
    document.getElementById('priceUnitSelect').value = currentPriceUnit;
    document.getElementById('minHourToggle').checked = USE_MINIMUM_HOUR;
    document.getElementById('roundDownPriceToggle').checked =
      USE_ROUND_DOWN_PRICE;
    document.querySelector('#mainContainer h1').innerText = currentGameNetName;
    const roundUpToggle = document.getElementById('roundUpPriceToggle');
    if (roundUpToggle) roundUpToggle.checked = USE_ROUND_UP_PRICE;
    renderSecurityToggles();
    localStorage.setItem(
      'SYSTEM_PASSWORD_HASH_EXISTS',
      gameNet.settings?.systemPassword ? 'true' : 'false'
    );
  } catch (err) {
    console.error('خطا در بارگذاری تنظیمات:', err);
  }
}
// تابع پر کردن سلکت گیم‌نت برای سوپرادمین (همان که اضافه کردی)

async function populateGameNetSelect() {
  const select = document.getElementById('gameNetSelect');
  if (!select) return;
  if (userRole !== 'superAdmin') {
    select.style.display = 'none';
    return;
  }
  select.style.display = 'inline-block';
  try {
    const gameNets = await apiFetch('/api/v1/gameNets');
    select.innerHTML = '<option value="">انتخاب گیم‌نت</option>';
    gameNets.forEach((g) => {
      const option = document.createElement('option');
      option.value = g._id;
      option.textContent = `${g.name}${g.isActive ? '' : ' (غیرفعال)'}`;
      select.appendChild(option);
    });
    if (currentGameNetId) select.value = currentGameNetId;
    select.onchange = async () => {
      currentGameNetId = select.value;
      if (currentGameNetId) {
        await initSystem();
      }
    };
  } catch (err) {
    console.error(err);
  }
}

// ================== مدیریت رمز عبور پویا ==================
function getSystemPassword() {
  return localStorage.getItem('SYSTEM_PASSWORD') || '';
}

function setSystemPassword(pass) {
  if (pass === null || pass === undefined) pass = '';
  localStorage.setItem('SYSTEM_PASSWORD', pass);
}

/**
 * بررسی می‌کند که آیا عملیات با featureId نیاز به تأیید رمز دارد.
 * اگر رمز سیستم خالی باشد => همیشه true (بدون رمز)
 * در غیر این صورت اگر تنظیمات امنیتی آن ویژگی نیاز به رمز داشته باشد، رمز می‌پرسد.
 * @param {string} featureId کلید در SECURITY_SETTINGS (مثلاً 'generalSettings')
 * @returns {Promise<boolean>} true اگر مجاز باشد، false اگر رمز اشتباه یا انصراف
 */
async function requirePasswordIfNeeded(featureId) {
  // اگر رمز سیستمی فعال نیست (از localStorage می‌خوانیم)
  const hasPassword =
    localStorage.getItem('SYSTEM_PASSWORD_HASH_EXISTS') === 'true';
  if (!hasPassword) return true;

  // اگر ویژگی نیاز به رمز ندارد
  if (!SECURITY_SETTINGS[featureId]) return true;

  const entered = await customPrompt('رمز عبور سیستم را وارد کنید:', 'text');
  if (entered === null) return false;

  try {
    const gameNetId = await getCurrentGameNetId();
    await apiFetch('/api/v1/auth/verify-system-password', {
      method: 'POST',
      body: JSON.stringify({ password: entered, gameNetId }),
    });
    return true;
  } catch (err) {
    customAlert('رمز عبور اشتباه است.');
    return false;
  }
}
function toEnglishDigits(str) {
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const englishDigits = '0123456789';
  return str.replace(
    /[۰-۹]/g,
    (ch) => englishDigits[persianDigits.indexOf(ch)]
  );
}

function toPersianDigits(str) {
  const englishDigits = '0123456789';
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  return str.replace(
    /[0-9]/g,
    (ch) => persianDigits[englishDigits.indexOf(ch)]
  );
}
// ================== ضد دک (غیرفعال کردن inspect) ==================
document.addEventListener('keydown', function (e) {
  if (e.key === 'F12') e.preventDefault();
  if (e.ctrlKey && e.shiftKey && e.key === 'I') e.preventDefault();
  if (e.ctrlKey && e.shiftKey && e.key === 'J') e.preventDefault();
  if ((e.ctrlKey && e.key === 'u') || (e.ctrlKey && e.key === 'U'))
    e.preventDefault();
  if ((e.ctrlKey && e.key === 's') || (e.ctrlKey && e.key === 'S'))
    e.preventDefault();
});

let isIncomeRevealed = false;

let currentPriceUnit = 'Toman'; // 'Toman' or 'Rial'
let currentGameNetName = 'سامانه مدیریت گیم‌نت گیم لند';

// ================== آیکون تومان SVG ==================
const TOMAN_ICON = `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#toman"></use></svg>`;
function formatMoneyWithIcon(amount) {
  if (amount === undefined || amount === null) amount = 0;
  let displayAmount = amount;
  let icon = TOMAN_ICON;
  if (currentPriceUnit === 'Rial') {
    displayAmount = amount * 10;
    icon = `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#rial"></use></svg>`;
  }
  return displayAmount.toLocaleString() + ' ' + icon;
}

function updateTotalAmountHeader() {
  const header = document.getElementById('totalAmountHeader');
  if (!header) return;
  const unitText = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
  header.innerText = `مبلغ کل (${unitText})`;
}
async function updateRoundDownPrice(value) {
  USE_ROUND_DOWN_PRICE = value;
  if (value === true) {
    USE_ROUND_UP_PRICE = false;
    const upToggle = document.getElementById('roundUpPriceToggle');
    if (upToggle) upToggle.checked = false;
  }
  await saveGeneralSettingsToAPI();
  render();
}
async function updateRoundUpPrice(value) {
  USE_ROUND_UP_PRICE = value;
  if (value === true) {
    // اگر گرد به بالا فعال شد، گرد به پایین را غیرفعال کن
    USE_ROUND_DOWN_PRICE = false;
    const downToggle = document.getElementById('roundDownPriceToggle');
    if (downToggle) downToggle.checked = false;
  }
  await saveGeneralSettingsToAPI();
  render();
}

function formatMoneyText(amount) {
  if (amount === undefined || amount === null) amount = 0;
  let displayAmount = amount;
  let unit = 'تومان';
  if (currentPriceUnit === 'Rial') {
    displayAmount = amount * 10;
    unit = 'ریال';
  }
  return displayAmount.toLocaleString() + ' ' + unit;
}

async function updateMinimumHour(value) {
  USE_MINIMUM_HOUR = value;
  await saveGeneralSettingsToAPI();
  render();
}

function normalizeConsoleType(consoleType) {
  const mapping = {
    'PS5 Pro': 'PS5',
    PS3: 'PS4',
    'Xbox X': 'Xbox',
    'Xbox S': 'Xbox',
    'Xbox One': 'Xbox',
  };
  return mapping[consoleType] || consoleType;
}

function getDayOfWeekFromJalali(jalaliDate) {
  // jalaliDate فرمت "1403/10/15" (با ارقام انگلیسی)
  const [year, month, day] = jalaliDate.split('/').map(Number);
  // استفاده از کتابخانه داخلی Intl با تبدیل تاریخ میلادی
  const gregorianDate = new Date(year, month - 1, day); // توجه: ماه در جاوااسکریپت 0-based
  gregorianDate.setFullYear(year, month - 1, day); // روش دقیق‌تر
  // روش بهتر: استفاده از محاسبه مستقیم یا کتابخانه moment-jalali، اما فعلاً با این روش کار می‌کند
  const persianWeekday = gregorianDate.toLocaleDateString('fa-IR', {
    weekday: 'long',
  });
  return persianWeekday;
}

function getPricingRate(consoleType, mode, tableName) {
  const device = DEVICES.find((dev) => dev.name === tableName);
  if (!device) return 0;
  const price = device.prices && device.prices[mode];
  if (typeof price === 'number' && !isNaN(price)) return price;
  let normalizedConsole = normalizeConsoleType(device.console);
  const fallbackPrice =
    PRICING[normalizedConsole] && PRICING[normalizedConsole][mode];
  if (typeof fallbackPrice === 'number' && !isNaN(fallbackPrice))
    return fallbackPrice;
  return 0;
}
function getSessionById(sessionId) {
  const sessions = gameNet[currentSelectedDate] || [];
  return sessions.find((s) => s._id === sessionId);
}
function getRateForSession(session) {
  return getPricingRate(session.consoleType, session.mode, session.table);
}
function isModeValidForTable(tableName, mode) {
  const device = DEVICES.find((dev) => dev.name === tableName);
  if (!device) return false;
  const modes = device.modes || [];
  return modes.includes(mode);
}

async function loadGeneralSettingsFromAPI() {
  try {
    const gameNetId = await getCurrentGameNetId();
    const gameNet = await apiFetch(`/api/v1/gameNets/${gameNetId}`);

    currentGameNetName = gameNet.name;
    currentPriceUnit = gameNet.settings?.priceUnit || 'Toman';
    USE_MINIMUM_HOUR = gameNet.settings?.useMinimumHour ?? true;
    USE_ROUND_DOWN_PRICE = gameNet.settings?.useRoundDownPrice ?? false;

    // بارگذاری تنظیمات امنیت داخلی (برای UI)
    const security = gameNet.settings?.securitySettings || {};
    SECURITY_SETTINGS = { ...SECURITY_SETTINGS, ...security };

    // به‌روزرسانی UI
    const nameInput = document.getElementById('gameNetNameInput');
    if (nameInput) nameInput.value = currentGameNetName;
    const unitSelect = document.getElementById('priceUnitSelect');
    if (unitSelect) unitSelect.value = currentPriceUnit;
    const minHourToggle = document.getElementById('minHourToggle');
    if (minHourToggle) minHourToggle.checked = USE_MINIMUM_HOUR;
    const roundDownToggle = document.getElementById('roundDownPriceToggle');
    if (roundDownToggle) roundDownToggle.checked = USE_ROUND_DOWN_PRICE;

    const h1 = document.querySelector('#mainContainer h1');
    if (h1) h1.innerText = currentGameNetName;

    // ذخیره یک نسخه محلی از رمز (فقط برای مقایسه در requirePasswordIfNeeded – اما بهتر است از endpoint استفاده کنیم)
    // فعلاً برای تطابق سریع، یک flag می‌گذاریم که نشان دهد رمز فعال است یا نه
    const hasPassword = !!gameNet.settings?.systemPassword;
    localStorage.setItem(
      'SYSTEM_PASSWORD_HASH_EXISTS',
      hasPassword ? 'true' : 'false'
    );
    updateTotalAmountHeader();
    renderSecurityToggles(); // برای نمایش وضعیت چک‌باکس‌ها
  } catch (err) {
    customAlert(`خطا در بارگذاری تنظیمات: ${err.message}`);
  }
}
window.cafeClickHandler = function (e) {
  const sessionId = e.currentTarget.getAttribute('data-session-id');
  if (sessionId) openCafeModal(sessionId);
};
function getCurrentJalaliDate() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('fa-IR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  let date = formatter.format(now).replace(/\//g, '/');
  return toEnglishDigits(date);
}
// ذخیره تنظیمات عمومی در API
async function saveGeneralSettingsToAPI() {
  try {
    const gameNetId = await getCurrentGameNetId();
    const newPassword = document.getElementById('systemPasswordInput').value;
    const body = {
      name: currentGameNetName,
      priceUnit: currentPriceUnit,
      useMinimumHour: USE_MINIMUM_HOUR,
      useRoundDownPrice: USE_ROUND_DOWN_PRICE,
      useRoundUpPrice: USE_ROUND_UP_PRICE,
      systemPassword: newPassword, // اگر خالی باشد، رمز حذف می‌شود
      securitySettings: SECURITY_SETTINGS,
    };
    await apiFetch(`/api/v1/gameNets/${gameNetId}/settings`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  } catch (err) {
    customAlert(`خطا در ذخیره تنظیمات: ${err.message}`);
  }
}

async function updateGameNetName(value) {
  currentGameNetName = value;
  await saveGeneralSettingsToAPI();
  const h1 = document.querySelector('#mainContainer h1');
  if (h1) h1.innerText = currentGameNetName;
}

async function updatePriceUnit(value) {
  currentPriceUnit = value;

  await saveGeneralSettingsToAPI();
  updateTotalAmountHeader();
  render();
}

function formatNumberWithCommas(x) {
  if (x === null || x === undefined || isNaN(x)) return '';
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}
function parseNumberFromFormatted(str) {
  if (!str) return 0;
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}
function liveNumberFormat(inputElement) {
  let cursorPos = inputElement.selectionStart;
  let oldValue = inputElement.value;
  let raw = oldValue.replace(/,/g, '');
  if (raw === '') raw = '0';
  let num = parseInt(raw, 10);
  if (isNaN(num)) num = 0;
  let newValue = formatNumberWithCommas(num);
  if (newValue !== oldValue) {
    inputElement.value = newValue;
    let newCursorPos = cursorPos + (newValue.length - oldValue.length);
    inputElement.setSelectionRange(newCursorPos, newCursorPos);
  }
}
function attachLiveFormatting(element) {
  if (!element) return;
  element.type = 'text';
  element.inputMode = 'numeric';
  element.addEventListener('input', () => liveNumberFormat(element));
  let initialRaw = parseNumberFromFormatted(element.value);
  if (!isNaN(initialRaw) && initialRaw !== 0)
    element.value = formatNumberWithCommas(initialRaw);
  else if (element.value === '' || element.value === '0') element.value = '';
}

function roundFinalPrice(amount) {
  if (isNaN(amount)) return 0;

  return amount;
}

function getValidModesForTable(tableName) {
  const device = DEVICES.find((dev) => dev.name === tableName);
  if (!device) return ['معمولی'];
  let modes = device.modes || [];
  if (modes.length === 0) {
    const pricingType =
      device.pricingType || getDefaultPricingType(device.console);
    if (pricingType === 'hourly_handles') {
      modes = ['1 دسته', '2 دسته', '3 دسته', '4 دسته', 'معمولی', 'VIP'];
    } else if (pricingType === 'hourly_per_person') {
      modes = ['یک نفر', 'دو نفر', 'سه نفر', 'چهار نفر و بیشتر'];
    } else {
      modes = ['معمولی'];
    }
  }
  return modes;
}

// ================== مودال سفارشی ==================
function showCustomModal(title, message, isConfirm = false, inputType = null) {
  return new Promise((resolve) => {
    const modal = document.getElementById('customModal');
    const titleEl = document.getElementById('customModalTitle');
    const bodyEl = document.getElementById('customModalBody');
    const confirmBtn = document.getElementById('customModalConfirmBtn');
    const cancelBtn = document.getElementById('customModalCancelBtn');

    titleEl.innerText = title;
    bodyEl.innerHTML = '';

    if (inputType === 'text' || inputType === 'number') {
      // نمایش پیام توضیحی
      const msgDiv = document.createElement('div');
      msgDiv.style.marginBottom = '15px';
      msgDiv.style.fontSize = '0.9rem';
      msgDiv.style.color = 'var(--text-muted)';
      msgDiv.style.textAlign = 'right';
      msgDiv.innerText = message;
      bodyEl.appendChild(msgDiv);

      const input = document.createElement('input');
      if (inputType === 'number') {
        input.type = 'text';
        input.inputMode = 'numeric';
        input.placeholder = 'مبلغ را وارد کنید';
        attachLiveFormatting(input);
      } else {
        input.type = 'text';
        input.placeholder = '...';
      }
      input.style.width = '100%';
      input.style.padding = '8px';
      input.style.borderRadius = '8px';
      input.style.border = '1px solid #ccc';
      input.style.background = 'var(--input-bg)';
      input.style.color = 'var(--text-main)';
      bodyEl.appendChild(input);

      const confirmHandler = () => {
        cleanup();
        let val = input.value;
        if (inputType === 'number') val = parseNumberFromFormatted(val);
        resolve(val);
      };
      const cancelHandler = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        modal.style.display = 'none';
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.onclick = cancelHandler;
      cancelBtn.style.display = 'inline-block';
    } else if (isConfirm) {
      const msgDiv = document.createElement('div');
      msgDiv.style.marginBottom = '15px';
      msgDiv.style.fontSize = '0.9rem';
      msgDiv.style.color = 'var(--text-main)';
      msgDiv.style.textAlign = 'right';
      msgDiv.innerText = message;
      bodyEl.appendChild(msgDiv);

      const confirmHandler = () => {
        cleanup();
        resolve(true);
      };
      const cancelHandler = () => {
        cleanup();
        resolve(false);
      };
      const cleanup = () => {
        confirmBtn.removeEventListener('click', confirmHandler);
        cancelBtn.removeEventListener('click', cancelHandler);
        modal.style.display = 'none';
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.onclick = cancelHandler;
      cancelBtn.style.display = 'inline-block';
    } else {
      const msgDiv = document.createElement('div');
      msgDiv.style.marginBottom = '15px';
      msgDiv.style.fontSize = '0.9rem';
      msgDiv.style.color = 'var(--text-main)';
      msgDiv.style.textAlign = 'right';
      msgDiv.innerText = message;
      bodyEl.appendChild(msgDiv);

      const confirmHandler = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        confirmBtn.removeEventListener('click', confirmHandler);
        modal.style.display = 'none';
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.style.display = 'none';
    }

    modal.style.display = 'flex';
  });
}
async function customAlert(msg) {
  await showCustomModal('پیام', msg, false);
}
async function customConfirm(msg) {
  return await showCustomModal('تأیید', msg, true);
}
async function customPrompt(msg, type = 'text') {
  return await showCustomModal('ورودی', msg, true, type);
}

// ================== لاگین ==================
async function checkLogin() {
  const username = document.getElementById('loginUsername').value;
  const password = document.getElementById('loginPassword').value;
  if (!username || !password) {
    customAlert('لطفاً نام کاربری و رمز عبور را وارد کنید');
    return;
  }

  try {
    const data = await apiFetch('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      noAuth: true,
    });
    localStorage.setItem('accessToken', data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    const userForStorage = {
      ...data.user,
      gameNetId: data.user.gameNetId?._id || data.user.gameNetId,
    };
    localStorage.setItem('user', JSON.stringify(userForStorage));
    userRole = data.user.role;
    currentGameNetId = data.user.gameNetId;
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    await initSystem();
  } catch (err) {
    customAlert('❌ نام کاربری یا رمز عبور اشتباه است!');
  }
}

async function logout() {
  const confirmed = await customConfirm('آیا از خروج مطمئن هستید؟');
  if (!confirmed) return;
  try {
    await apiFetch('/api/v1/auth/logout', { method: 'POST' });
  } catch (err) {}
  localStorage.clear();
  document.getElementById('loginUsername').value = '';
  document.getElementById('loginPassword').value = '';
  document.getElementById('loginScreen').style.display = 'flex';
  document.getElementById('appScreen').style.display = 'none';
  if (timerInterval) clearInterval(timerInterval);
}

// async function checkAuthOnLoad() {
//   const token = localStorage.getItem('accessToken');
//   if (!token) {
//     // نمایش صفحه لاگین
//     document.getElementById('loginScreen').style.display = 'flex';
//     document.getElementById('appScreen').style.display = 'none';
//     return;
//   }
//   try {
//     const data = await apiFetch('/api/v1/auth/me');
//     // ذخیره اطلاعات کاربر
//     const userForStorage = {
//       ...data.user,
//       gameNetId: data.user.gameNetId?._id || data.user.gameNetId,
//     };
//     localStorage.setItem('user', JSON.stringify(userForStorage));
//     userRole = data.user.role;
//     if (userRole === 'admin') {
//       currentGameNetId = data.user.gameNetId;
//     } else {
//       // برای سوپرادمین، currentGameNetId را بعداً از سلکت می‌گیریم
//       currentGameNetId = null;
//     }
//     // مخفی کردن لاگین و نمایش اپ
//     document.getElementById('loginScreen').style.display = 'none';
//     document.getElementById('appScreen').style.display = 'block';
//     // مقداردهی سلکت گیم‌نت (برای سوپرادمین)
//     if (userRole === 'superAdmin') {
//       await populateGameNetSelect();
//       // اگر گیم‌نتی انتخاب نشده، اولین گیم‌نت را انتخاب کن
//       const select = document.getElementById('gameNetSelect');
//       if (select && !select.value) {
//         if (select.options.length > 1) {
//           select.value = select.options[1].value;
//           currentGameNetId = select.value;
//         } else {
//           // بدون گیم‌نت – خطا
//           throw new Error('هیچ گیم‌نتی موجود نیست');
//         }
//       } else if (select) {
//         currentGameNetId = select.value;
//       }
//     }
//     // بارگذاری داده‌ها
//     await initSystem();
//   } catch (err) {
//     console.error(err);
//     localStorage.removeItem('accessToken');
//     localStorage.removeItem('refreshToken');
//     localStorage.removeItem('user');
//     // نمایش صفحه لاگین در صورت خطا
//     document.getElementById('loginScreen').style.display = 'flex';
//     document.getElementById('appScreen').style.display = 'none';
//   }
// }
async function checkAuthOnLoad() {
  const token = localStorage.getItem('accessToken');
  const refreshToken = localStorage.getItem('refreshToken');

  // اگر اصلاً توکنی وجود ندارد، لاگین را نشان بده
  if (!token && !refreshToken) {
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
    return;
  }

  // تابع کمکی برای گرفتن توکن جدید با رفرش
  const refreshAccessToken = async () => {
    if (!refreshToken) throw new Error('No refresh token');
    const res = await fetch('/api/v1/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!res.ok) throw new Error('Refresh failed');
    const { accessToken, refreshToken: newRefreshToken } = await res.json();
    localStorage.setItem('accessToken', accessToken);
    localStorage.setItem('refreshToken', newRefreshToken);
    return accessToken;
  };

  // تابع کمکی برای احراز هویت (با امکان رفرش خودکار)
  const authenticate = async (retry = true) => {
    try {
      return await apiFetch('/api/v1/auth/me');
    } catch (err) {
      const isUnauthorized =
        err.message.includes('401') ||
        err.message.includes('Invalid token') ||
        err.message.includes('Unauthorized');
      if (retry && isUnauthorized) {
        await refreshAccessToken();
        return await authenticate(false);
      }
      throw err;
    }
  };

  try {
    const data = await authenticate();
    // ذخیره اطلاعات کاربر
    const userForStorage = {
      ...data.user,
      gameNetId: data.user.gameNetId?._id || data.user.gameNetId,
    };
    localStorage.setItem('user', JSON.stringify(userForStorage));
    userRole = data.user.role;
    if (userRole === 'admin') {
      currentGameNetId = data.user.gameNetId;
    } else {
      currentGameNetId = null;
    }
    // مخفی کردن لاگین و نمایش اپ
    document.getElementById('loginScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    // مقداردهی سلکت گیم‌نت (برای سوپرادمین)
    if (userRole === 'superAdmin') {
      await populateGameNetSelect();
      const select = document.getElementById('gameNetSelect');
      if (select && !select.value) {
        if (select.options.length > 1) {
          select.value = select.options[1].value;
          currentGameNetId = select.value;
        } else {
          throw new Error('هیچ گیم‌نتی موجود نیست');
        }
      } else if (select) {
        currentGameNetId = select.value;
      }
    }
    await initSystem();
  } catch (err) {
    console.error(err);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    document.getElementById('loginScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
  }
}
function initClosedSessionsToggle() {
  const toggle = document.getElementById('showClosedSessionsToggle');
  if (toggle) {
    // بارگذاری وضعیت ذخیره شده (اختیاری)
    const saved = localStorage.getItem('SHOW_CLOSED_SESSIONS');
    if (saved !== null) {
      showClosedSessions = saved === 'true';
      toggle.checked = showClosedSessions;
    }
    toggle.addEventListener('change', (e) => {
      showClosedSessions = e.target.checked;
      localStorage.setItem('SHOW_CLOSED_SESSIONS', showClosedSessions);
      render();
    });
  }
}
document.getElementById('loginPassword').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') checkLogin();
});

const DAYS = [
  'یکشنبه',
  'دوشنبه',
  'سه‌شنبه',
  'چهارشنبه',
  'پنجشنبه',
  'جمعه',
  'شنبه',
];

let PRICING = {
  PS4: { '1 دسته': 50000, '2 دسته': 60000, '3 دسته': 80000, '4 دسته': 100000 },
  PS5: { '1 دسته': 70000, '2 دسته': 80000, '3 دسته': 100000, '4 دسته': 120000 },
  Xbox: { '1 دسته': 60000, '2 دسته': 70000, '3 دسته': 90000, '4 دسته': 110000 },
  PC: { معمولی: 80000, VIP: 100000 },
  VIP: {
    '1 دسته': 100000,
    '2 دسته': 120000,
    '3 دسته': 150000,
    '4 دسته': 180000,
  },
  VIP_PS4: {
    '1 دسته': 60000,
    '2 دسته': 70000,
    '3 دسته': 90000,
    '4 دسته': 110000,
  },
  VIP_PS5: {
    '1 دسته': 80000,
    '2 دسته': 90000,
    '3 دسته': 110000,
    '4 دسته': 130000,
  },
  VIP_Xbox: {
    '1 دسته': 70000,
    '2 دسته': 80000,
    '3 دسته': 100000,
    '4 دسته': 120000,
  },
};

for (let i = 1; i <= TOTAL_TABLES; i++)
  TABLE_CONFIGS[i] = { console: 'PS4', isVip: false, customName: `میز ${i}` };

let editingIndex = -1;

let timerInterval = null;

const timeStart = document.getElementById('timeStart');
const sessionsBody = document.getElementById('sessionsBody');
// ================== توابع کمکی لاگ جدید (با ذخیره هزینه‌ها) ==================
function addSessionLog(
  day,
  index,
  eventType,
  message,
  gameCost = null,
  cafeCost = null
) {
  let session = gameNet[day]?.[index];
  if (!session) return;
  if (!session.logs) session.logs = [];
  let timestamp = new Date().toLocaleTimeString('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  if (gameCost === null || cafeCost === null) {
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let calc = calculateCost(session, nowStr);
    gameCost = calc.gameCost;
    cafeCost = session.cafeCost || 0;
  }
  session.logs.push({ timestamp, eventType, message, gameCost, cafeCost });
}

function sortSessions(sessions, sortBy) {
  const copy = [...sessions];
  const now = Date.now();
  // return copy;

  switch (sortBy) {
    case 'duration_desc': // بیشترین زمان سپری شده (فقط جلسات active)
      return copy.sort((a, b) => {
        const timeA = a.status === 'active' ? now - (a.startTimeMs || 0) : 0;
        const timeB = b.status === 'active' ? now - (b.startTimeMs || 0) : 0;
        return timeB - timeA;
      });
    case 'duration_asc': // کمترین زمان سپری شده (فقط جلسات active)
      return copy.sort((a, b) => {
        const timeA =
          a.status === 'active' ? now - (a.startTimeMs || 0) : Infinity;
        const timeB =
          b.status === 'active' ? now - (b.startTimeMs || 0) : Infinity;
        return timeA - timeB;
      });
    case 'reserved_near': // رزروهای نزدیک (بر اساس زمان شروع)
      return copy.sort((a, b) => {
        if (a.status !== 'reserved' && b.status !== 'reserved') return 0;
        if (a.status !== 'reserved') return 1;
        if (b.status !== 'reserved') return -1;
        // هر دو رزرو هستند
        const timeA = getReserveTimeMs(a.reservedDay || a.date, a.timeStart);
        const timeB = getReserveTimeMs(b.reservedDay || b.date, b.timeStart);
        return timeA - timeB;
      });
    default: // پیش‌فرض: جدیدترین جلسه ساخته شده (بر اساس startTimeMs
      return copy.sort((a, b) => {
        const timeA = a.createdAt
          ? new Date(a.createdAt).getTime()
          : a.startTimeMs || 0;
        const timeB = b.createdAt
          ? new Date(b.createdAt).getTime()
          : b.startTimeMs || 0;
        return timeB - timeA;
      });
  }
}
function saveCountdownToLocalStorage(sessionId, endTime) {
  if (endTime) {
    localStorage.setItem(`countdown_${sessionId}`, endTime.toString());
  } else {
    localStorage.removeItem(`countdown_${sessionId}`);
  }
}

function loadCountdownFromLocalStorage(sessionId) {
  const stored = localStorage.getItem(`countdown_${sessionId}`);
  if (stored && !isNaN(parseInt(stored))) {
    const endTime = parseInt(stored);
    if (endTime > Date.now()) {
      return endTime;
    } else {
      localStorage.removeItem(`countdown_${sessionId}`);
    }
  }
  return null;
}
function initSortSelect() {
  const sortSelect = document.getElementById('sortSelect');
  if (sortSelect) {
    // بارگذاری آخرین انتخاب از localStorage
    const savedSort = localStorage.getItem('SORT_PREFERENCE');
    if (savedSort) sortSelect.value = savedSort;

    sortSelect.addEventListener('change', () => {
      localStorage.setItem('SORT_PREFERENCE', sortSelect.value);
      render();
    });
  }
}
function getConsoleIcon(consoleType) {
  const type = consoleType.toLowerCase();
  if (type.includes('ps')) return 'fab fa-playstation';
  if (type.includes('xbox')) return 'fab fa-xbox';
  if (type === 'pc') return 'fas fa-desktop';
  if (type.includes('nintendo')) return 'fab fa-nintendo-switch';
  return 'fas fa-gamepad';
}
function logCalculationDetails(
  day,
  index,
  session,
  endStr,
  calcResult,
  actionType
) {
  let periods = [];
  if (session.history && session.history.length > 0) {
    periods = [...session.history];
    periods.push({
      start: session.history[session.history.length - 1].end,
      end: endStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    periods.push({
      start: session.timeStart,
      end: endStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  }

  let periodsDetails = [];
  let totalMinutes = 0;
  periods.forEach((p, idx) => {
    let startMin =
      parseInt(p.start.split(':')[0]) * 60 + parseInt(p.start.split(':')[1]);
    let endMin =
      parseInt(p.end.split(':')[0]) * 60 + parseInt(p.end.split(':')[1]);
    if (endMin < startMin) endMin += 24 * 60;
    let minutes = endMin - startMin;
    if (minutes > 0) {
      totalMinutes += minutes;

      let { rate, cost } = getPeriodCost(
        p.start,
        p.end,
        p.mode,
        p.consoleType,
        p.table
      );
      let flooredCost = Math.floor(cost);
      let tableName = TABLE_CONFIGS[p.table]?.customName || p.table;
      periodsDetails.push(
        `<span class="log-detail-line">• بازه ${idx + 1}: <span class="log-highlight">${minutes} دقیقه</span> روی <span class="log-name">${tableName}</span> (<span class="log-console">${p.consoleType}</span> - <span class="log-mode">${p.mode}</span>) با نرخ ${formatMoneyWithIcon(rate)} در ساعت → هزینه ${formatMoneyWithIcon(flooredCost)}</span>`
      );
    }
  });

  let weightedAvg = calcResult.weightedAvgRate || 0;
  let effectiveMinutes = calcResult.effectiveMinutes || totalMinutes;
  let totalGameCost = calcResult.gameCost;
  let useMinHour =
    calcResult.useMinimumHour !== undefined
      ? calcResult.useMinimumHour
      : USE_MINIMUM_HOUR;

  let roundedWeightedAvg = Math.floor(weightedAvg);
  let roundedGameCost = roundFinalPrice(totalGameCost);

  let msgLines = [];
  msgLines.push(actionType);
  msgLines.push(...periodsDetails);

  if (useMinHour && !calcResult.hasChanges && totalMinutes < 60) {
    msgLines.push(
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) → اعمال حداقل یک ساعت.</span>`
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} (معادل ${effectiveMinutes} دقیقه با میانگین وزنی)</span>`
    );
  } else if (useMinHour && totalMinutes < 60) {
    msgLines.push(
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) ← محاسبه بر اساس دقیقه واقعی (قانون حداقل یک ساعت اعمال نمی شود).</span>`
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} </span>`
    );
  } else if (!useMinHour && totalMinutes < 60) {
    msgLines.push(
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) → محاسبه بر اساس دقیقه واقعی (قانون حداقل یک ساعت غیرفعال است).</span>`
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} (معادل ${totalMinutes} دقیقه با میانگین وزنی)</span>`
    );
  } else {
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)}</span>`
    );
  }

  if (session.cafeItems && session.cafeItems.length > 0) {
    msgLines.push(
      `<span class="log-separator">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>`
    );
    msgLines.push(`<span class="log-info">☕ سفارشات کافه:</span>`);
    let cafeTableHtml = `<table class="log-cafe-table" style="width:100%; border-collapse:collapse; margin-top:5px; font-size:0.8rem;">`;
    cafeTableHtml += `<thead><tr style="border-bottom:1px solid var(--primary);">`;
    cafeTableHtml += `<th style="text-align:right; padding:4px;">آیتم</th>`;
    cafeTableHtml += `<th style="text-align:center; padding:4px;">تعداد</th>`;
    cafeTableHtml += `<th style="text-align:left; padding:4px;">قیمت واحد</th>`;
    cafeTableHtml += `<th style="text-align:left; padding:4px;">جمع</th>`;
    cafeTableHtml += `</tr></thead><tbody>`;
    let totalCafe = 0;
    for (let item of session.cafeItems) {
      let itemTotal = item.qty * item.price;
      totalCafe += itemTotal;
      cafeTableHtml += `<tr style="border-bottom:1px solid rgba(150,150,150,0.2);">`;
      cafeTableHtml += `<td style="text-align:right; padding:4px;">${escapeHtml(item.name)}</td>`;
      cafeTableHtml += `<td style="text-align:center; padding:4px;">${item.qty}</td>`;
      cafeTableHtml += `<td style="text-align:left; padding:4px;">${formatMoneyWithIcon(item.price)}</td>`;
      cafeTableHtml += `<td style="text-align:left; padding:4px; color:var(--success);">${formatMoneyWithIcon(itemTotal)}</td>`;
      cafeTableHtml += `</tr>`;
    }
    cafeTableHtml += `</tbody><tfoot><tr style="border-top:2px solid var(--primary);">`;
    cafeTableHtml += `<td colspan="3" style="text-align:left; font-weight:bold;">جمع کل کافه</td>`;
    cafeTableHtml += `<td style="text-align:left; font-weight:bold; color:var(--success);">${formatMoneyWithIcon(totalCafe)}</td>`;
    cafeTableHtml += `</tr></tfoot></table>`;
    msgLines.push(cafeTableHtml);
  } else if (
    session.cafeCost &&
    session.cafeCost > 0 &&
    (!session.cafeItems || session.cafeItems.length === 0)
  ) {
    msgLines.push(
      `<span class="log-separator">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>`
    );
    msgLines.push(
      `<span class="log-info">☕ هزینه کافه: ${formatMoneyWithIcon(session.cafeCost)}</span>`
    );
  }
  const msg = msgLines.join('<br>');

  addSessionLog(
    day,
    index,
    'بستن جلسه',
    msg,
    calcResult.gameCost,
    session.cafeCost || 0
  );
}

function getPeriodCost(startStr, endStr, mode, consoleType, tableName) {
  let startMin =
    parseInt(startStr.split(':')[0]) * 60 + parseInt(startStr.split(':')[1]);
  let endMin =
    parseInt(endStr.split(':')[0]) * 60 + parseInt(endStr.split(':')[1]);
  if (endMin < startMin) endMin += 24 * 60;
  let minutes = endMin - startMin;
  if (minutes <= 0) return { minutes, rate: 0, cost: 0 };
  let rate = getPricingRate(consoleType, mode, tableName);
  let cost = Math.floor((minutes / 60) * rate);
  return { minutes, rate, cost };
}

function formatPeriodDetails(
  period,
  index,
  totalMinutes,
  weightedAvgRate,
  effectiveMinutes
) {
  const start = period.start;
  const end = period.end;
  const mode = period.mode;
  const consoleType = period.consoleType;
  const tableName = TABLE_CONFIGS[period.table]?.customName || period.table;

  const { minutes, rate, cost } = getPeriodCost(start, end, mode, consoleType);
  if (minutes === 0) return '';

  let line = `بازه ${index}: ${minutes} دقیقه روی ${tableName} (${consoleType} - ${mode}) با نرخ ${rate.toLocaleString()} تومان/ساعت → هزینه ${cost.toLocaleString()} تومان`;
  return line;
}
function calculateCost(session, endStr, options = {}) {
  const forceSingleMode = options.forceSingleMode === true;
  const useMinimumHour =
    options.useMinimumHour !== undefined
      ? options.useMinimumHour
      : USE_MINIMUM_HOUR;

  let periods = [];
  if (forceSingleMode) {
    periods.push({
      start: session.timeStart,
      end: endStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    if (session.history && session.history.length > 0) {
      periods = [...session.history];
      periods.push({
        start: session.history[session.history.length - 1].end,
        end: endStr,
        mode: session.mode,
        consoleType: session.consoleType,
        table: session.table,
      });
    } else {
      periods.push({
        start: session.timeStart,
        end: endStr,
        mode: session.mode,
        consoleType: session.consoleType,
        table: session.table,
      });
    }
  }

  let totalMinutes = 0,
    totalWeightedRate = 0;
  for (let p of periods) {
    let startMin =
      parseInt(p.start.split(':')[0]) * 60 + parseInt(p.start.split(':')[1]);
    let endMin =
      parseInt(p.end.split(':')[0]) * 60 + parseInt(p.end.split(':')[1]);
    if (endMin < startMin) endMin += 24 * 60;
    let minutes = endMin - startMin;
    if (minutes < 0) minutes = 0;
    totalMinutes += minutes;
    // ← تغییر مهم: استفاده از p.table به جای tableNum
    let rate = getPricingRate(p.consoleType, p.mode, p.table);
    totalWeightedRate += minutes * rate;
  }

  if (totalMinutes === 0) {
    return {
      durationStr: '0.00',
      gameCost: 0,
      total: session.cafeCost || 0,
      totalMinutes: 0,
      weightedAvgRate: 0,
      effectiveMinutes: 0,
      useMinimumHour,
      hasChanges: false,
    };
  }

  let hasChanges = session.history && session.history.length > 0;
  let weightedAvgRate = totalMinutes > 0 ? totalWeightedRate / totalMinutes : 0;
  if (isNaN(weightedAvgRate)) weightedAvgRate = 0;
  let effectiveMinutes = totalMinutes;
  if (useMinimumHour && !hasChanges && totalMinutes < 60) effectiveMinutes = 60;
  if (isNaN(effectiveMinutes)) effectiveMinutes = 0;

  let gameCost = Math.round((effectiveMinutes / 60) * weightedAvgRate);
  if (isNaN(gameCost)) gameCost = 0;
  const roundBase = currentPriceUnit === 'Rial' ? 50000 : 5000;

  if (USE_ROUND_UP_PRICE) {
    gameCost = Math.ceil(gameCost / roundBase) * roundBase;
  } else if (USE_ROUND_DOWN_PRICE) {
    gameCost = Math.floor(gameCost / roundBase) * roundBase;
  } else {
    const defaultBase = currentPriceUnit === 'Rial' ? 10000 : 1000;
    gameCost = Math.floor(gameCost / defaultBase) * defaultBase;
  }
  let totalCost = gameCost + (session.cafeCost || 0);

  return {
    durationStr: (totalMinutes / 60).toFixed(2),
    gameCost,
    total: totalCost,
    weightedAvgRate,
    totalMinutes,
    effectiveMinutes,
    useMinimumHour,
    hasChanges,
  };
}

// ================== تنظیمات امنیت داخلی ==================
let SECURITY_FEATURES = [
  { id: 'exportExcel', label: '📊 خروجی اکسل', default: true },
  { id: 'clearDay', label: '🗑️ پاکسازی کل روز', default: true },
  { id: 'trashModal', label: '🗑️ مشاهده سطل آشغال', default: true },
  { id: 'revealIncome', label: '💰 نمایش درآمد', default: true },
  {
    id: 'deleteSession',
    label: '❌ حذف رکورد (انتقال به سطل آشغال)',
    default: true,
  },
  { id: 'manageCafe', label: '☕ مدیریت کافه', default: true },
  { id: 'manageDevices', label: '🖥️ مدیریت دستگاه‌ها', default: true },
  { id: 'generalSettings', label: '⚙️ تنظیمات عمومی', default: true },
];
let SECURITY_SETTINGS = {};

function loadSecuritySettings() {
  const saved = localStorage.getItem('SECURITY_SETTINGS');
  if (saved) {
    SECURITY_SETTINGS = JSON.parse(saved);
    // اطمینان از وجود تمام کلیدها (برای ویژگی‌های جدید)
    SECURITY_FEATURES.forEach((f) => {
      if (SECURITY_SETTINGS[f.id] === undefined) {
        SECURITY_SETTINGS[f.id] = f.default;
      }
    });
  } else {
    SECURITY_FEATURES.forEach((f) => {
      SECURITY_SETTINGS[f.id] = f.default;
    });
  }
  saveGeneralSettingsToAPI(); // ذخیره مجدد برای یکسان‌سازی
}

function renderSecurityToggles() {
  const container = document.getElementById('securityTogglesContainer');
  if (!container) return;
  container.innerHTML = '';
  SECURITY_FEATURES.forEach((feature) => {
    const isChecked =
      SECURITY_SETTINGS[feature.id] !== undefined
        ? SECURITY_SETTINGS[feature.id]
        : feature.default;
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.alignItems = 'center';
    row.style.padding = '8px 0';
    row.style.borderBottom = '1px solid rgba(150,150,150,0.1)';

    const label = document.createElement('span');
    label.style.fontSize = '0.85rem';
    label.innerText = feature.label;

    const toggleWrap = document.createElement('label');
    toggleWrap.className = 'security-toggle-wrap';
    toggleWrap.style.display = 'flex';
    toggleWrap.style.alignItems = 'center';
    toggleWrap.style.gap = '8px';
    toggleWrap.style.cursor = 'pointer';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isChecked;
    checkbox.style.width = '18px';
    checkbox.style.height = '18px';
    checkbox.style.accentColor = 'var(--primary)';
    checkbox.style.cursor = 'pointer';

    const toggleText = document.createElement('span');
    toggleText.className = 'security-status-text';
    toggleText.style.fontSize = '0.8rem';
    toggleText.innerText = isChecked ? 'نیاز به رمز' : 'بدون رمز';
    toggleText.style.color = isChecked ? 'var(--success)' : 'var(--text-muted)';

    checkbox.addEventListener('change', (e) => {
      SECURITY_SETTINGS[feature.id] = e.target.checked;
      saveGeneralSettingsToAPI();
      toggleText.innerText = e.target.checked ? 'نیاز به رمز' : 'بدون رمز';
      toggleText.style.color = e.target.checked
        ? 'var(--success)'
        : 'var(--text-muted)';
    });

    toggleWrap.appendChild(checkbox);
    toggleWrap.appendChild(toggleText);
    row.appendChild(label);
    row.appendChild(toggleWrap);
    container.appendChild(row);
  });
}

// ================== توابع اصلی سیستم ==================

async function openSettingsModal(modalId) {
  // بررسی رمز برای مودال‌های محافظت شده
  let featureId = null;
  if (modalId === 'generalSettingsModal') featureId = 'generalSettings';
  else if (modalId === 'manageCafeModal') featureId = 'manageCafe';

  if (featureId) {
    const authorized = await requirePasswordIfNeeded(featureId);
    if (!authorized) return;
  }

  document.getElementById(modalId).style.display = 'flex';
  if (modalId === 'generalSettingsModal') {
    renderSecurityToggles();
    // مقداردهی فیلد رمز
    const pwdInput = document.getElementById('systemPasswordInput');
    if (pwdInput) pwdInput.value = getSystemPassword();
    attachSystemPasswordEvents();
  }
  if (modalId === 'manageCafeModal') {
    updateCafePricePlaceholder();
    renderCafeMenus();
  }
}

function closeSettingsModal(modalId) {
  document.getElementById(modalId).style.display = 'none';
}
// ================== مدیریت تم رنگی ==================
function changeTheme(themeName) {
  const picker = document.querySelector('.jalali-date-picker');
  if (picker) picker.style.display = 'none';
  const validThemes = [
    'dark',
    'light',
    'cyberpunk',
    'midnight',
    'ocean',
    'golden',
    'lilac',
    'pale-pink',
    'pearl-white',
    'pastel-teal',
    'deep-sea',
    'pistachio',
    'light-coral',
    'deep-coral',
    'high-contrast',
  ];
  if (!validThemes.includes(themeName)) themeName = 'dark';
  document.body.setAttribute('data-theme', themeName);
  localStorage.setItem('APP_THEME', themeName);
  const themeSelect = document.getElementById('themeSelect');
  updateTimePickerColorScheme();
  if (themeSelect) themeSelect.value = themeName;
}

function initTheme() {
  const savedTheme = localStorage.getItem('APP_THEME');
  const validThemes = [
    'dark',
    'light',
    'cyberpunk',
    'midnight',
    'ocean',
    'golden',
    'lilac',
    'pale-pink',
    'pearl-white',
    'pastel-teal',
    'deep-sea',
    'pistachio',
    'light-coral',
    'deep-coral',
    'high-contrast',
  ];
  if (savedTheme && validThemes.includes(savedTheme)) {
    changeTheme(savedTheme);
  } else {
    changeTheme('dark');
  }
}
function getConsoleColorClass(consoleType) {
  if (consoleType === 'PS5') return 'console-ps5';
  if (consoleType === 'PS4') return 'console-ps4';
  if (consoleType === 'Xbox') return 'console-xbox';
  if (consoleType === 'PC') return 'console-pc';
  return '';
}

// // به‌روزرسانی گزینه‌های معتبر حالت بازی بر اساس میز انتخاب شده
function updateModeSelectOptions() {
  const tableName = tableSelect.value;
  const device = DEVICES.find((dev) => dev.name === tableName);
  if (!device) return;
  const config = TABLE_CONFIGS[tableName] || {};
  const modeSelect = document.getElementById('modeSelect');
  if (!modeSelect) return;

  const pricingType =
    config.pricingType || getDefaultPricingType(config.console);
  let validModes = [];
  if (pricingType === 'hourly_handles') {
    validModes = ['1 دسته', '2 دسته', '3 دسته', '4 دسته', 'معمولی', 'VIP'];
  } else if (pricingType === 'hourly_per_person') {
    validModes = ['یک نفر', 'دو نفر', 'سه نفر', 'چهار نفر و بیشتر'];
  } else {
    validModes = ['معمولی'];
  }
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    validModes = config.modes;
  }

  const currentValue = modeSelect.value;
  modeSelect.innerHTML = '';
  validModes.forEach((mode) => {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  });
  if (validModes.includes(currentValue)) {
    modeSelect.value = currentValue;
  } else if (validModes.length > 0) {
    modeSelect.value = validModes[0];
  }

  // مقداردهی NiceSelect در صورت وجود کتابخانه
  if (typeof NiceSelect !== 'undefined') {
    // اگر نمونه قبلی وجود داشت، آن را نابود کن
    if (
      modeSelect.niceSelectInstance &&
      typeof modeSelect.niceSelectInstance.destroy === 'function'
    ) {
      modeSelect.niceSelectInstance.destroy();
    }
    const SelectClass = NiceSelect.default || NiceSelect;
    if (typeof SelectClass === 'function') {
      modeSelect.niceSelectInstance = new SelectClass(modeSelect, {
        searchable: false, // غیرفعال کردن جستجو
        placeholder: 'انتخاب حالت...',
        rtl: true,
      });
    }
  }
}

function renderTrashPagination() {
  const container = document.getElementById('trashPagination');
  if (!container) return;
  if (currentTrashTotalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  let html = '';

  // دکمه قبلی
  if (currentTrashPage > 1) {
    html += `<button class="btn-pagination" onclick="loadTrashFromAPI(${currentTrashPage - 1})">‹ قبلی</button>`;
  }

  // محاسبه صفحات قابل نمایش (حداکثر 5 عدد)
  let startPage = Math.max(1, currentTrashPage - 2);
  let endPage = Math.min(currentTrashTotalPages, currentTrashPage + 2);

  // اگر صفحات ابتدایی بیشتر از 2 تا هستند، صفحه 1 را نشان بده و بعد ...
  if (startPage > 1) {
    html += `<button class="btn-pagination" onclick="loadTrashFromAPI(1)">1</button>`;
    if (startPage > 2) html += `<span class="pagination-ellipsis">...</span>`;
  }

  for (let i = startPage; i <= endPage; i++) {
    if (i === currentTrashPage) {
      html += `<button class="btn-pagination active" disabled>${i}</button>`;
    } else {
      html += `<button class="btn-pagination" onclick="loadTrashFromAPI(${i})">${i}</button>`;
    }
  }

  // اگر صفحات انتهایی کمتر از کل صفحات هستند، ... و آخرین صفحه را نشان بده
  if (endPage < currentTrashTotalPages) {
    if (endPage < currentTrashTotalPages - 1)
      html += `<span class="pagination-ellipsis">...</span>`;
    html += `<button class="btn-pagination" onclick="loadTrashFromAPI(${currentTrashTotalPages})">${currentTrashTotalPages}</button>`;
  }

  // دکمه بعدی
  if (currentTrashPage < currentTrashTotalPages) {
    html += `<button class="btn-pagination" onclick="loadTrashFromAPI(${currentTrashPage + 1})">بعدی ›</button>`;
  }

  container.innerHTML = html;
}
// ================== بهبود فیلد زمان ==================
function initTimePickerBehavior() {
  // انتخاب همه فیلدهای زمان در کل صفحه
  const allTimeInputs = document.querySelectorAll('input[type="time"]');
  allTimeInputs.forEach((input) => {
    // جلوگیری از افزودن چندباره listener
    input.removeEventListener('click', handleTimeInputClick);
    input.addEventListener('click', handleTimeInputClick);
  });
}

function handleTimeInputClick(e) {
  // جلوگیری از اجرای دوباره اگر قبلاً پیکر باز است (اختیاری)
  e.stopPropagation();
  const input = e.currentTarget;
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
    } catch (err) {
      // fallback: فقط فوکوس شود (مرورگرهای قدیمی)
      input.focus();
    }
  } else {
    // در مرورگرهایی که showPicker پشتیبانی نمی‌کنند
    input.focus();
  }
}

function updateTimePickerColorScheme() {
  const allTimeInputs = document.querySelectorAll('input[type="time"]');
  const theme = document.body.getAttribute('data-theme') || 'dark';
  const lightThemes = ['light', 'pearl-white', 'pastel-teal', 'pale-pink'];
  const isLight = lightThemes.includes(theme);
  const colorScheme = isLight ? 'light' : 'dark';

  allTimeInputs.forEach((input) => {
    input.style.colorScheme = colorScheme;
  });
}

async function initSystem() {
  tableSelect = document.getElementById('tableSelect');
  // 1. تنظیم روزها در سلکت روز
  if (typeof jalaliDatepicker !== 'undefined') {
    jalaliDatepicker.startWatch({
      autoShow: true,
      autoHide: true,
      useDropDownYears: true,
      format: 'jYYYY/jMM/jDD',
      persianDigits: true,
      showEmptyBtn: false,
    });
  }

  // مقداردهی اولیه: تاریخ امروز شمسی
  const datePicker = document.getElementById('datePickerInput');
  if (datePicker) {
    datePicker.value = getCurrentJalaliDate(); // که قبلاً انگلیسی است
    currentSelectedDate = toEnglishDigits(datePicker.value.trim()); // متغیر سراسری که قبلاً تعریف کردید

    datePicker.addEventListener('change', async () => {
      currentSelectedDate = toEnglishDigits(datePicker.value.trim()); // این مقدار خودش انگلیسی است
      if (currentSelectedDate) {
        await loadSessionsFromAPI(currentSelectedDate);
        render();
      }
    });
  }
  const now = new Date();
  timeStart.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

  // 2. اگر userRole هنوز مقداردهی نشده (مثلاً بعد از refresh)، از localStorage بخوان
  if (!userRole) {
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    userRole = user.role;
    if (userRole === 'admin') {
      currentGameNetId = user.gameNetId?._id || user.gameNetId;
    }
  }
  initSortSelect();

  // 3. برای سوپرادمین، اگر currentGameNetId خالی است، از سلکت (یا اولین گیم‌نت) پر کن
  if (userRole === 'superAdmin' && !currentGameNetId) {
    await populateGameNetSelect(); // این تابع هم مقدار currentGameNetId را می‌دهد
    const select = document.getElementById('gameNetSelect');
    if (select && select.value) currentGameNetId = select.value;
    else if (select && select.options.length > 1) {
      select.value = select.options[1].value;
      currentGameNetId = select.value;
    }
  }

  // 4. بارگذاری داده‌ها از API (با currentGameNetId معتبر)
  await loadDevicesFromAPI();
  await loadCafeMenuFromAPI();
  await loadGameNetSettings();
  updateTotalAmountHeader();
  attachGeneralSettingsEvents();
  initClosedSessionsToggle();
  const currentDate = currentSelectedDate;
  await loadSessionsFromAPI(currentDate);
  generateTableSelect();
  initTimePickerBehavior();
  setupDiscountSync();
  setupExtraSync();
  // 5. رندر جدول و شروع تایمر
  render();
  if (timerInterval) clearInterval(timerInterval);
  startLiveTimer();

  if (tableSelect) {
    tableSelect.removeEventListener('change', updateModeSelectOptions);
    tableSelect.addEventListener('change', updateModeSelectOptions);
  }

  // 6. اطمینان از نمایش سلکت گیم‌نت برای سوپرادمین (اگر قبلاً نبود)
  if (userRole === 'superAdmin') {
    const select = document.getElementById('gameNetSelect');
    if (select && select.style.display !== 'inline-block') {
      await populateGameNetSelect();
    }
  }
}

function attachGeneralSettingsEvents() {
  const nameInput = document.getElementById('gameNetNameInput');
  if (nameInput) {
    const debouncedUpdateName = debounce(async (e) => {
      await updateGameNetName(e.target.value);
    }, 500);
    nameInput.addEventListener('input', debouncedUpdateName);
  }
  const unitSelect = document.getElementById('priceUnitSelect');
  if (unitSelect) {
    unitSelect.removeEventListener('change', handleUnitChange);
    unitSelect.addEventListener('change', handleUnitChange);
  }
  const minHourToggle = document.getElementById('minHourToggle');
  if (minHourToggle) {
    minHourToggle.removeEventListener('change', () =>
      updateMinimumHour(minHourToggle.checked)
    );
    minHourToggle.addEventListener('change', () =>
      updateMinimumHour(minHourToggle.checked)
    );
  }
  const roundDownToggle = document.getElementById('roundDownPriceToggle');
  if (roundDownToggle) {
    roundDownToggle.removeEventListener('change', () =>
      updateRoundDownPrice(roundDownToggle.checked)
    );
    roundDownToggle.addEventListener('change', () =>
      updateRoundDownPrice(roundDownToggle.checked)
    );
  }
  const roundUpToggle = document.getElementById('roundUpPriceToggle');
  if (roundUpToggle) {
    roundUpToggle.removeEventListener('change', () =>
      updateRoundUpPrice(roundUpToggle.checked)
    );
    roundUpToggle.addEventListener('change', () =>
      updateRoundUpPrice(roundUpToggle.checked)
    );
  }
  const pwdInput = document.getElementById('systemPasswordInput');
  if (pwdInput) {
    const debouncedSavePassword = debounce(async () => {
      await saveGeneralSettingsToAPI();
    }, 500);
    pwdInput.addEventListener('input', debouncedSavePassword);
  }
}
function attachSystemPasswordEvents() {
  const pwdInput = document.getElementById('systemPasswordInput');
  const toggleBtn = document.getElementById('toggleSystemPassword');
  if (!pwdInput) return;

  // ذخیره خودکار هنگام تغییر
  const savePassword = () => {
    setSystemPassword(pwdInput.value);
  };
  pwdInput.removeEventListener('input', savePassword);
  pwdInput.addEventListener('input', savePassword);

  if (toggleBtn) {
    const newToggle = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);
    newToggle.addEventListener('click', () => {
      const type =
        pwdInput.getAttribute('type') === 'password' ? 'text' : 'password';
      pwdInput.setAttribute('type', type);
      newToggle.textContent = type === 'password' ? '👁️ نمایش' : '🙈 مخفی';
    });
  }
}
function handleNameInput(e) {
  updateGameNetName(e.target.value);
}

function handleUnitChange(e) {
  updatePriceUnit(e.target.value);
}

function generateTableSelect() {
  const dateInput = document.getElementById('datePickerInput');
  let currentDate = dateInput ? toEnglishDigits(dateInput.value.trim()) : '';
  if (!currentDate) return;

  const sessions = (gameNet && gameNet[currentDate]) || [];
  const activeTables = sessions
    .filter((s) => s.status === 'active')
    .map((s) => s.table);
  const reservedTables = sessions
    .filter((s) => s.status === 'reserved')
    .map((s) => s.table);

  const select = document.getElementById('tableSelect');
  if (!select) return;

  // ذخیره مقدار قبلی برای بازیابی بعد از بازسازی
  const previousValue = select.value;

  // پاک کردن گزینه‌های قبلی
  select.innerHTML = '';

  if (!DEVICES || DEVICES.length === 0) {
    select.innerHTML = '<option value="">هیچ دستگاهی تعریف نشده</option>';
    return;
  }

  DEVICES.forEach((dev) => {
    let label = dev.name;
    let badges = '';
    if (dev.vip) badges += 'VIP 👑 ';
    if (dev.royal) badges += 'Royal 💎 ';
    if (dev.legendary) badges += 'Legendary 🌟 ';
    if (badges) label += ` (${badges.trim()})`;

    let status = '';
    if (activeTables.includes(dev.name)) status = '🔴 فعال';
    else if (reservedTables.includes(dev.name)) status = '🟡 رزرو';
    if (status) label += ` - ${status}`;

    const option = document.createElement('option');
    option.value = dev.name;
    option.textContent = label;
    select.appendChild(option);
  });

  // بازیابی مقدار قبلی اگر هنوز معتبر است
  if (
    previousValue &&
    [...select.options].some((opt) => opt.value === previousValue)
  ) {
    select.value = previousValue;
  }

  // مقداردهی (یا بازنشانی) Nice-Select
  if (typeof NiceSelect !== 'undefined') {
    // اگر نمونه قبلی وجود داشت، آن را نابود کن
    if (
      select.niceSelectInstance &&
      typeof select.niceSelectInstance.destroy === 'function'
    ) {
      select.niceSelectInstance.destroy();
    }
    // دریافت کلاس اصلی (برای ماژول‌های دارای default)
    const SelectClass = NiceSelect.default || NiceSelect;
    if (typeof SelectClass === 'function') {
      select.niceSelectInstance = new SelectClass(select, {
        searchable: true,
        placeholder: 'جستجو...',
        dir: 'rtl',
        searchPlaceholder: 'جستجو یا انتخاب میز...',
      });
    } else {
      console.error('NiceSelect is not a constructor', SelectClass);
    }
  } else {
    console.warn('NiceSelect library not loaded');
  }
  // بعد از پر کردن سلکت، گزینه‌های حالت بازی را به‌روز کن
  updateModeSelectOptions();
}

function initSettings() {}
function updateGamePrices() {}
function renderTableSettings() {}
function saveTableSettings() {}
function renderCafeMenus() {
  const list = document.getElementById('cafeSettingsList');
  if (!list) return;
  const itemCount = cafeMenu.length;
  let columns = 2;
  if (itemCount >= 5 && itemCount <= 8) columns = 3;
  else if (itemCount >= 9) columns = 4;
  const modalContent = document.querySelector(
    '#manageCafeModal .modal-content'
  );
  if (modalContent) {
    let newWidth = columns * 220 + 50;
    newWidth = Math.min(newWidth, window.innerWidth * 0.95);
    modalContent.style.width = `${newWidth}px`;
  }
  list.className = 'cafe-settings-list';
  list.style.gridTemplateColumns = `repeat(${columns}, minmax(200px, 1fr))`;
  list.style.gap = '15px';
  list.innerHTML = '';
  cafeMenu.forEach((item, index) => {
    const card = document.createElement('div');
    card.className = 'table-setting-card';
    card.style.minWidth = '200px';
    card.innerHTML = `
      <div class="table-setting-header">${escapeHtml(item.name)}</div>
      <div style="text-align:center; font-size:0.85rem; margin:10px 0;">
        <span style="color:var(--text-muted);">قیمت:</span> <b style="color:var(--success);">${formatMoneyWithIcon(item.price)}</b><br>
        <span style="color:var(--text-muted);">موجودی انبار:</span> <b style="color:var(--warning);">${item.stock}</b>
      </div>
      <div style="display:flex; gap:5px; width:100%;">
        <button class="btn btn-success" style="flex:1; padding:5px; margin:0; font-size:14px;" onclick="editCafeItem(${index})">✎ ویرایش</button>
        <button class="btn btn-danger" style="flex:1; padding:5px; margin:0; font-size:14px;" onclick="deleteCafeItem(${index})">✖ حذف</button>
      </div>
    `;
    list.appendChild(card);
  });
}
function getStartTimeMs(timeStr) {
  let [h, m] = timeStr.split(':').map(Number);
  let d = new Date();
  d.setHours(h, m, 0, 0);
  if (d > new Date()) d.setDate(d.getDate() - 1);
  return d.getTime();
}
function getReserveTimeMs(reservedDayName, timeStr) {
  const now = new Date();
  const currentDayIndex = now.getDay();
  const targetDayIndex = DAYS.findIndex((d) => d === reservedDayName);
  if (targetDayIndex === -1) return now.getTime();
  let [hour, minute] = timeStr.split(':').map(Number);
  let targetDate = new Date();
  targetDate.setHours(hour, minute, 0, 0);
  let dayDiff = targetDayIndex - currentDayIndex;
  if (dayDiff < 0) dayDiff += 7;
  targetDate.setDate(now.getDate() + dayDiff);
  if (dayDiff === 0 && targetDate < now) targetDate.setDate(now.getDate() + 7);
  return targetDate.getTime();
}
function parseTime(timeStr) {
  let [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}
function isTableActive(day, table) {
  return gameNet[day].some((s) => s.table === table && s.status === 'active');
}
function sortTableByTime() {
  let day = currentSelectedDate;
  if (!gameNet[day]) return;
  gameNet[day].sort((a, b) => {
    let w = { active: 1, reserved: 2, closed: 3 };
    if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
    return getStartTimeMs(b.timeStart) - getStartTimeMs(a.timeStart);
  });
  render();
}
async function addPayment(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;

  const unitText = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
  const amountRaw = await customPrompt(
    `لطفا مبلغ پیش‌پرداخت (${unitText}) را وارد کنید:`,
    'number'
  );
  if (amountRaw === null || isNaN(amountRaw) || amountRaw <= 0) return;

  // تبدیل به تومان (سرور فقط تومان قبول می‌کند)
  let amountInToman = amountRaw;
  if (currentPriceUnit === 'Rial') {
    // اگر کاربر ریال وارد کرده، باید بر ۱۰ تقسیم شود (چون ۱۰ ریال = ۱ تومان)
    amountInToman = Math.round(amountRaw / 10);
    if (amountInToman <= 0) {
      customAlert(`مبلغ وارد شده کمتر از ۱۰ ریال است.`);
      return;
    }
  }

  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { amount: amountInToman, gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/payment`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}
function populateReserveModalTables() {
  const reserveTableSelect = document.getElementById('reserveModalTableSelect');
  if (!reserveTableSelect) return;
  reserveTableSelect.innerHTML = '';
  for (let i = 0; i < DEVICES.length; i++) {
    const dev = DEVICES[i];
    const label = `${dev.name} (${dev.console}${dev.vip || dev.royal || dev.legendary ? ' - VIP 👑' : ''})`;
    reserveTableSelect.appendChild(new Option(label, dev.name));
  }
}
function openReservationModal() {
  let start = timeStart.value;
  if (!start) return customAlert('ساعت رزرو را مشخص کنید.');
  populateReserveModalTables();
  document.getElementById('reserveModalTableSelect').value = tableSelect.value;
  document.getElementById('reserveModalTime').value = start;
  document.getElementById('reserveName').value = '';
  document.getElementById('reservePhone').value = '';
  document.getElementById('reserveModal').style.display = 'flex';
}
function closeReservationModal() {
  document.getElementById('reserveModal').style.display = 'none';
}
async function saveReservation() {
  const day = currentSelectedDate;
  const table = document.getElementById('reserveModalTableSelect').value;
  const start = document.getElementById('reserveModalTime').value;
  const mode = document.getElementById('modeSelect').value;
  const customerName = document.getElementById('reserveName').value.trim();
  const customerPhone = document.getElementById('reservePhone').value.trim();
  const date = currentSelectedDate;
  const device = DEVICES.find((dev) => dev.name === table);
  const consoleType = device ? device.console : 'PS4';

  if (!start) return customAlert('ساعت رزرو را مشخص کنید.');
  if (!customerName) return customAlert('وارد کردن نام مشتری الزامی است.');
  if (!isModeValidForTable(table, mode)) {
    customAlert(`❌ حالت بازی "${mode}" برای این میز معتبر نیست.`);
    return;
  }
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = {
      table,
      timeStart: start,
      mode,
      consoleType,
      date,
      customerName,
      customerPhone,
      reservedDay: day,
      gameNetId,
    };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch('/api/v1/sessions/reserve', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    closeReservationModal();
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    neonFlash();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

async function startReservedSession(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'reserved') {
    customAlert('رزرو معتبر نیست.');
    return;
  }
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/start-reserved`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    neonFlash();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

async function startSession() {
  const day = currentSelectedDate;
  const table = tableSelect.value;
  const start = timeStart.value;
  const mode = document.getElementById('modeSelect').value;
  const date = currentSelectedDate;
  const device = DEVICES.find((dev) => dev.name === table);
  const consoleType = device ? device.console : 'PS4';

  if (!start) return customAlert('ساعت ورود را مشخص کنید.');
  if (isTableActive(day, table))
    return customAlert('این میز در حال حاضر فعال است!');

  // بررسی اعتبار حالت
  if (!isModeValidForTable(table, mode)) {
    customAlert(`❌ حالت بازی "${mode}" برای این میز معتبر نیست.`);
    return;
  }

  try {
    const gameNetId = await getCurrentGameNetId();
    const body = {
      table,
      timeStart: start,
      mode,
      consoleType,
      date,
      gameNetId,
    };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch('/api/v1/sessions/start', {
      method: 'POST',
      body: JSON.stringify(body),
    });
    // به‌روزرسانی جلسات و رندر
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    neonFlash();
    // به‌روزرسانی ساعت شروع برای دفعه بعد
    const now = new Date();
    timeStart.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

// ================== اصلاح تابع بستن سشن (رفع مشکل عدم واکنش دکمه) ==================
async function closeSessionAuto(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'active') {
    customAlert('این جلسه فعال نیست.');
    return;
  }
  const now = new Date();
  const endTime = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { endTime, gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/close`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    await loadSessionsFromAPI(currentSelectedDate);
    render();
  } catch (err) {
    customAlert(`خطا در بستن جلسه: ${err.message}`);
  }
}
// اطمینان از دسترسی سراسری به تابع بستن
window.closeSessionAuto = closeSessionAuto;

async function deleteSession(sessionId) {
  const authorized = await requirePasswordIfNeeded('deleteSession');
  if (!authorized) return;
  const confirmed = await customConfirm(
    'آیا این رکورد به سطل آشغال منتقل شود؟ (قابل بازیابی نیست)'
  );
  if (!confirmed) return;
  const session = getSessionById(sessionId);
  if (!session) return;
  const day = currentSelectedDate;
  try {
    const gameNetId = await getCurrentGameNetId();
    let url = `/api/v1/sessions/${session._id}?originalDay=${day}`;
    if (userRole === 'superAdmin') url += `&gameNetId=${gameNetId}`;
    await apiFetch(url, { method: 'DELETE' });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

function closeTrashModal() {
  document.getElementById('trashModal').style.display = 'none';
}

async function loadDeletedSessionsFromAPI() {
  const gameNetId = await getCurrentGameNetId();
  const deleted = await apiFetch(`/api/v1/deleted?gameNetId=${gameNetId}`);
  currentTrashSessions = deleted;
  renderTrashModal();
}
async function loadTrashFromAPI(page = 1) {
  try {
    const gameNetId = await getCurrentGameNetId();
    const response = await apiFetch(
      `/api/v1/deleted?gameNetId=${gameNetId}&page=${page}&limit=${currentTrashLimit}`
    );
    currentTrashSessions = response.data || [];
    currentTrashPage = response.pagination.page;
    currentTrashTotalPages = response.pagination.totalPages;
    renderTrashModal();
    renderTrashPagination(); // برای نمایش دکمه‌های صفحه‌بندی
  } catch (err) {
    console.error('خطا در بارگذاری سطل آشغال:', err);
    currentTrashSessions = [];
    currentTrashTotalPages = 0;
    renderTrashModal();
    renderTrashPagination();
  }
}
// نمایش مودال سطل آشغال
async function openTrashModal() {
  const authorized = await requirePasswordIfNeeded('trashModal');
  if (!authorized) return;

  currentTrashPage = 1; // reset به صفحه اول
  await loadTrashFromAPI(1);
  document.getElementById('trashModal').style.display = 'flex';
}
// رندر جدول سطل آشغال
function renderTrashModal() {
  const tbody = document.getElementById('trashTableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (currentTrashSessions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;">سطل آشغال خالی است. </td></tr>';
    return;
  }

  currentTrashSessions.forEach((entry) => {
    const s = entry.session;
    const deletedDate = new Date(entry.deletedAt).toLocaleString('fa-IR');
    const row = tbody.insertRow();

    let displayName =
      (TABLE_CONFIGS[s.table] && TABLE_CONFIGS[s.table].customName) || s.table;

    row.insertCell(0).innerHTML = displayName;
    row.insertCell(1).innerHTML = `${s.consoleType} (${s.mode})`;
    row.insertCell(2).innerHTML =
      `${s.timeStart}${s.timeEnd ? ' تا ' + s.timeEnd : ''}`;
    row.insertCell(3).innerHTML = entry.originalDay;
    row.insertCell(4).innerHTML = deletedDate;

    const btnCell = row.insertCell(5);

    const viewLogsBtn = document.createElement('button');
    viewLogsBtn.className = 'btn btn-log btn-log-delete-modal';
    viewLogsBtn.innerHTML = '📜 لاگ';
    viewLogsBtn.onclick = () => {
      showSessionLogsFromData(s, `لاگ‌های جلسه حذف شده - ${s.table}`);
    };
    btnCell.appendChild(viewLogsBtn);

    const deleteForeverBtn = document.createElement('button');
    deleteForeverBtn.className = 'btn btn-danger';
    deleteForeverBtn.innerHTML = '🗑️ حذف همیشگی';
    deleteForeverBtn.onclick = async () => {
      if (await customConfirm('آیا این رکورد را برای همیشه حذف می‌کنید؟')) {
        try {
          const gameNetId = await getCurrentGameNetId();
          await apiFetch(
            `/api/v1/deleted/${entry._id}?gameNetId=${gameNetId}`,
            { method: 'DELETE' }
          );
          await loadTrashFromAPI(); // ← درست
          renderTrashModal();
        } catch (err) {
          customAlert(`خطا: ${err.message}`);
        }
      }
    };
    btnCell.appendChild(deleteForeverBtn);
  });
}

function getEventTypePersian(type) {
  const mapping = {
    session_start: 'شروع جلسه',
    session_close: 'بستن جلسه',
    mode_change: 'تغییر دسته',
    table_change: 'انتقال میز',
    cafe_order: 'سفارش کافه',
    payment: 'پرداخت',
    edit: 'ویرایش جلسه',
    reservation: 'رزرو میز',
    reservation_start: 'شروع از رزرو',
    reactivate: 'ادامه جلسه',
  };
  return mapping[type] || type; // در صورت نبود، همان کلید برگردانده شود
}

function showSessionLogsFromData(session, title) {
  const logs = session.logs || [];
  const tbody = document.getElementById('logsTableBody');
  const tfoot = document.getElementById('logsTableFoot');
  tbody.innerHTML = '';

  const convertAmount = (amountInToman) =>
    currentPriceUnit === 'Rial' ? amountInToman * 10 : amountInToman;
  const formatAbsolute = (amountInToman) =>
    convertAmount(amountInToman).toLocaleString() +
    (currentPriceUnit === 'Rial' ? ' ریال' : ' تومان');

  // به‌روزرسانی هدر ستون‌ها
  const modal = document.getElementById('sessionLogsModal');
  if (modal) {
    const headers = modal.querySelectorAll('thead th');
    if (headers.length >= 5) {
      const unitText = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
      headers[3].innerText = `هزینه کنسول (${unitText})`;
      headers[4].innerText = `هزینه کافه (${unitText})`;
    }
  }

  // پیدا کردن آخرین لاگ session_close (برای استخراج مقادیر نهایی)
  const closeLog = logs.filter((l) => l.type === 'session_close').pop();
  let finalTotal = null;
  let gameCost = 0,
    cafeCost = 0,
    extraAmount = 0,
    discountAmount = 0,
    paidAmount = session.paidAmount || 0;

  if (closeLog && closeLog.data) {
    finalTotal = closeLog.data.finalTotal;
    gameCost = closeLog.data.gameCost || 0;
    cafeCost = closeLog.data.cafeCost || 0;
    extraAmount = closeLog.data.extraAmount || 0;
    discountAmount = closeLog.data.discountAmount || 0;
    paidAmount =
      closeLog.data.paidAmount !== undefined
        ? closeLog.data.paidAmount
        : paidAmount;
  } else {
    // fallback
    finalTotal = session.totalAmount;
    gameCost = session.gameCost || 0;
    cafeCost = session.cafeCost || 0;
    extraAmount =
      session.extraFixed ||
      (session.extraPercent ? (gameCost * session.extraPercent) / 100 : 0);
    discountAmount =
      session.discountFixed ||
      (session.discountPercent
        ? ((gameCost + cafeCost) * session.discountPercent) / 100
        : 0);
  }

  // رندر هر لاگ
  logs.forEach((log) => {
    let logGameCost =
      log.data?.gameCost ?? (log.type === 'session_close' ? gameCost : 0);
    let logCafeCost =
      log.data?.cafeCost ?? (log.type === 'session_close' ? cafeCost : 0);
    const row = tbody.insertRow();
    const persianType = getEventTypePersian(log.type);
    row.insertCell(0).innerHTML =
      `<div style="text-align:center">${new Date(log.timestamp).toLocaleTimeString('fa-IR')}</div>`;
    row.insertCell(1).innerHTML =
      `<div style="text-align:center">${getEventIcon(log.type)} ${persianType}</div>`;
    row.insertCell(2).innerHTML =
      `<div style="text-align:right">${formatStructuredLog(log, currentPriceUnit)}</div>`;
    row.insertCell(3).innerHTML =
      `<div style="text-align:left">${formatAbsolute(logGameCost)}</div>`;
    row.insertCell(4).innerHTML =
      `<div style="text-align:left">${formatAbsolute(logCafeCost)}</div>`;
  });

  // محاسبه نهایی با ترتیب صحیح: (بازی+کافه) + اضافی - تخفیف - پیش‌پرداخت
  let subtotal = gameCost + cafeCost;
  let afterExtra = subtotal + extraAmount;
  let afterDiscount = afterExtra - discountAmount;
  let finalPayable = afterDiscount - paidAmount;
  const roundedPayable = roundFinalPrice(finalPayable);
  const finalMessage =
    finalPayable >= 0
      ? `💰 مبلغ نهایی قابل پرداخت - ${getRoundingDescription()}`
      : `🔄 مبلغ بستانکاری به مشتری - ${getRoundingDescription()}`;
  const finalColor = finalPayable >= 0 ? 'var(--success)' : '#ffaa00';

  // ساخت ردیف‌های فوتر (ترتیب درست: جمع کل، سپس اضافی، سپس تخفیف، سپس پیش‌پرداخت، سپس نتیجه)
  tfoot.innerHTML = `
    <tr style="border-top:2px solid var(--primary);">
      <td colspan="3" style="text-align:left; font-weight:bold;">جمع هزینه بازی + کافه  </td>
      <td style="text-align:left;">${formatAbsolute(gameCost)}</td>
      <td style="text-align:left;">${formatAbsolute(cafeCost)}</td>
     </tr>
     ${
       extraAmount > 0
         ? `<tr>
        <td colspan="3" style="text-align:left; font-weight:bold;">➕ هزینه اضافی (جریمه/خدمات)</td>
        <td colspan="2" style="text-align:left; color: var(--success);">+ ${formatAbsolute(extraAmount)}</td>
     </tr>`
         : ''
     }
     ${
       discountAmount > 0
         ? `<tr>
        <td colspan="3" style="text-align:left; font-weight:bold;">🏷️ تخفیف اعمال شده</td>
        <td colspan="2" style="text-align:left; color: #ffaa00;">- ${formatAbsolute(discountAmount)}</td>
     </tr>`
         : ''
     }
     ${
       paidAmount > 0
         ? `<tr>
        <td colspan="3" style="text-align:left; font-weight:bold;">💰 پیش‌پرداخت ثبت شده</td>
        <td colspan="2" style="text-align:left; color: var(--warning);">- ${formatAbsolute(paidAmount)}</td>
     </tr>`
         : ''
     }
    <tr style="border-top:2px solid var(--primary); background: rgba(0,243,255,0.1);">
      <td colspan="3" style="text-align:left; font-weight:bold;">${finalMessage}</td>
      <td colspan="2" style="text-align:left; font-size:1.1rem; color: ${finalColor};">${formatAbsolute(Math.abs(roundedPayable))}</td>
    </tr>
  `;

  modal.style.display = 'flex';
  modal.style.zIndex = '2100';
  const modalTitle = modal.querySelector('h3');
  if (modalTitle) modalTitle.innerText = title || '📜 گزارش رویدادهای میز';
}
function openChangeModeModal(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) return;
  window._activeModalSessionId = sessionId;
  const validModes = getValidModesForTable(session.table);
  const modeSelect = document.getElementById('newModeSelect');
  modeSelect.innerHTML = '';
  validModes.forEach((mode) => {
    const option = document.createElement('option');
    option.value = mode;
    option.textContent = mode;
    if (mode === session.mode) option.selected = true;
    modeSelect.appendChild(option);
  });
  document.getElementById('changeModeModal').style.display = 'flex';
}

function showModeSelectionModal(validModes, currentMode) {
  return new Promise((resolve) => {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.style.display = 'flex';
    modal.style.zIndex = '10001';
    modal.innerHTML = `
            <div class="modal-content" style="width:300px; text-align:center;">
                <h3>انتخاب حالت بازی</h3>
                <p>حالت فعلی "${currentMode}" برای میز جدید معتبر نیست.<br>لطفاً حالت جدید را انتخاب کنید:</p>
                <select id="tempModeSelect" style="width:100%; padding:8px; margin:15px 0;">
                    ${validModes.map((m) => `<option value="${m}">${m}</option>`).join('')}
                </select>
                <div style="display:flex; gap:10px;">
                    <button id="tempModeConfirm" class="btn btn-success">تأیید</button>
                    <button id="tempModeCancel" class="btn btn-danger">لغو</button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);

    const confirmBtn = modal.querySelector('#tempModeConfirm');
    const cancelBtn = modal.querySelector('#tempModeCancel');
    const selectEl = modal.querySelector('#tempModeSelect');

    const cleanup = () => modal.remove();

    confirmBtn.onclick = () => {
      const selected = selectEl.value;
      cleanup();
      resolve(selected);
    };
    cancelBtn.onclick = () => {
      cleanup();
      resolve(null);
    };
  });
}

function closeChangeModeModal() {
  document.getElementById('changeModeModal').style.display = 'none';
}
async function saveChangeMode() {
  const sessionId = window._activeModalSessionId;
  const session = getSessionById(sessionId);
  if (!session) return;
  const newMode = document.getElementById('newModeSelect').value;
  if (newMode === session.mode) {
    closeChangeModeModal();
    return;
  }
  const now = new Date();
  const nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { newMode, nowStr, gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/mode`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    closeChangeModeModal();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}
function openChangeTableModal(sessionId) {
  const day = currentSelectedDate;
  const session = getSessionById(sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد.');
    return;
  }
  activeModalSessionId = sessionId;

  const select = document.getElementById('newTableSelect');
  select.innerHTML = '';
  for (let i = 0; i < DEVICES.length; i++) {
    const dev = DEVICES[i];
    if (dev.name !== session.table && !isTableActive(day, dev.name)) {
      select.appendChild(new Option(dev.name, dev.name));
    }
  }
  document.getElementById('changeTableModal').style.display = 'flex';
}
function closeChangeTableModal() {
  document.getElementById('changeTableModal').style.display = 'none';
}
async function saveChangeTable() {
  const session = getSessionById(activeModalSessionId);
  if (!session) {
    customAlert('جلسه یافت نشد.');
    closeChangeTableModal();
    return;
  }
  const newTable = document.getElementById('newTableSelect').value;
  if (!newTable || newTable === session.table) {
    closeChangeTableModal();
    return;
  }
  // بررسی اعتبار حالت جدید برای میز مقصد (اختیاری، می‌توان در backend هم انجام داد)
  const validModes = getValidModesForTable(newTable);
  let newMode = session.mode;
  if (!validModes.includes(session.mode)) {
    const selectedMode = await showModeSelectionModal(validModes, session.mode);
    if (!selectedMode) return;
    newMode = selectedMode;
  }
  const now = new Date();
  const nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { newTable, newMode, nowStr, gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/table`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    closeChangeTableModal();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

// ================== توابع مودال کافه ==================
let currentCafeSessionIndex = null;

async function openCafeModal(sessionId) {
  const day = currentSelectedDate;
  const session = (gameNet[day] || []).find((s) => s._id === sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد');
    return;
  }
  window._currentCafeSessionId = session._id;
  originalCafeItems = JSON.parse(JSON.stringify(session.cafeItems || []));

  const tableName = TABLE_CONFIGS[session.table]?.customName || session.table;
  document.getElementById('modalTableName').innerText = tableName;

  if (!cafeMenu || cafeMenu.length === 0) {
    await loadCafeMenuFromAPI();
  }

  currentCafeQuantities = {};
  for (const item of cafeMenu) {
    const existing = session.cafeItems?.find((c) => c.id === item._id); // تغییر: item._id
    currentCafeQuantities[item._id] = existing ? existing.qty : 0; // تغییر: item._id
  }
  renderCafeModalList();
  updateOrderSummary();
  document.getElementById('cafeModal').style.display = 'flex';
}

function renderCafeModalList() {
  const container = document.getElementById('modalCafeList');
  if (!container) return;
  container.innerHTML = '';
  cafeMenu.forEach((item) => {
    const qty = currentCafeQuantities[item._id] || 0; // تغییر: item._id
    const maxStock =
      item.stock + (originalCafeItems.find((c) => c.id === item._id)?.qty || 0);
    const card = document.createElement('div');
    card.className = 'cafe-item-card';
    card.style.background = 'var(--input-bg)';
    card.style.borderRadius = '12px';
    card.style.padding = '10px';
    card.style.border = '1px solid rgba(150,150,150,0.2)';
    card.style.display = 'flex';
    card.style.flexDirection = 'column';
    card.style.gap = '8px';
    const nameDiv = document.createElement('div');
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.color = 'var(--primary)';
    nameDiv.innerHTML = `${item.name} <span style="color:var(--success); font-size:0.8rem;"> ( ${formatMoneyWithIcon(item.price)} ) </span>`;
    const stockSpan = document.createElement('div');
    stockSpan.style.fontSize = '0.7rem';
    stockSpan.style.color = 'var(--text-muted)';
    stockSpan.innerText = `موجودی انبار: ${item.stock}`;
    const controls = document.createElement('div');
    controls.style.display = 'flex';
    controls.style.alignItems = 'center';
    controls.style.justifyContent = 'space-between';
    controls.style.gap = '8px';
    const qtyWrapper = document.createElement('div');
    qtyWrapper.style.display = 'flex';
    qtyWrapper.style.alignItems = 'center';
    qtyWrapper.style.gap = '5px';
    const minusBtn = document.createElement('button');
    minusBtn.innerText = '-';
    minusBtn.className = 'qty-btn';
    minusBtn.style.width = '28px';
    minusBtn.style.height = '28px';
    minusBtn.style.borderRadius = '6px';
    minusBtn.style.background = 'var(--panel-bg)';
    minusBtn.style.border = '1px solid var(--primary)';
    minusBtn.style.color = 'var(--primary)';
    minusBtn.style.cursor = 'pointer';
    minusBtn.style.fontWeight = 'bold';
    minusBtn.onclick = (e) => {
      e.preventDefault();
      changeCafeItemQty(item._id, -1);
    };
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.id = `modal_cafe_qty_${item._id}`;
    qtyInput.value = qty;
    qtyInput.min = 0;
    qtyInput.max = maxStock;
    qtyInput.style.width = '60px';
    qtyInput.style.textAlign = 'center';
    qtyInput.style.margin = '0';
    qtyInput.style.padding = '4px';
    qtyInput.style.background = 'var(--input-bg)';
    qtyInput.style.color = 'var(--text-main)';
    qtyInput.style.border = '1px solid rgba(150,150,150,0.2)';
    qtyInput.style.borderRadius = '6px';
    qtyInput.onchange = (e) => {
      let newVal = parseInt(e.target.value);
      if (isNaN(newVal)) newVal = 0;
      if (newVal > maxStock) newVal = maxStock;
      if (newVal < 0) newVal = 0;
      currentCafeQuantities[item._id] = newVal;
      qtyInput.value = newVal;
      updateOrderSummary();
    };
    const plusBtn = document.createElement('button');
    plusBtn.innerText = '+';
    plusBtn.className = 'qty-btn';
    plusBtn.style.width = '28px';
    plusBtn.style.height = '28px';
    plusBtn.style.borderRadius = '6px';
    plusBtn.style.background = 'var(--panel-bg)';
    plusBtn.style.border = '1px solid var(--primary)';
    plusBtn.style.color = 'var(--primary)';
    plusBtn.style.cursor = 'pointer';
    plusBtn.style.fontWeight = 'bold';
    plusBtn.onclick = (e) => {
      e.preventDefault();
      changeCafeItemQty(item._id, 1);
    };
    qtyWrapper.appendChild(minusBtn);
    qtyWrapper.appendChild(qtyInput);
    qtyWrapper.appendChild(plusBtn);
    const cancelBtn = document.createElement('button');
    cancelBtn.innerHTML = '🗑️';
    cancelBtn.title = 'حذف کامل این آیتم';
    cancelBtn.style.background = 'rgba(255,0,85,0.2)';
    cancelBtn.style.border = 'none';
    cancelBtn.style.borderRadius = '6px';
    cancelBtn.style.width = '32px';
    cancelBtn.style.height = '28px';
    cancelBtn.style.cursor = 'pointer';
    cancelBtn.style.color = 'var(--warning)';
    cancelBtn.style.fontSize = '1rem';
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      currentCafeQuantities[item._id] = 0;
      qtyInput.value = 0;
      updateOrderSummary();
    };
    controls.appendChild(qtyWrapper);
    controls.appendChild(cancelBtn);
    card.appendChild(nameDiv);
    card.appendChild(stockSpan);
    card.appendChild(controls);
    container.appendChild(card);
  });
  if (window.innerWidth < 600) container.style.gridTemplateColumns = '1fr';
  else container.style.gridTemplateColumns = 'repeat(2, 1fr)';
}
function changeCafeItemQty(itemId, delta) {
  const maxStock =
    cafeMenu.find((i) => i._id === itemId).stock +
    (originalCafeItems.find((c) => c.id === itemId)?.qty || 0);
  let newQty = (currentCafeQuantities[itemId] || 0) + delta;
  if (newQty < 0) newQty = 0;
  if (newQty > maxStock) newQty = maxStock;
  currentCafeQuantities[itemId] = newQty;
  const input = document.getElementById(`modal_cafe_qty_${itemId}`);
  if (input) input.value = newQty;
  updateOrderSummary();
}
function updateOrderSummary() {
  const summaryDiv = document.getElementById('currentOrderSummary');
  if (!summaryDiv) return;
  const selectedItems = [];
  let total = 0;
  for (let item of cafeMenu) {
    let qty = currentCafeQuantities[item._id] || 0;
    if (qty > 0) {
      let cost = qty * item.price;
      total += cost;
      selectedItems.push({
        id: item._id,
        name: item.name,
        qty,
        price: item.price,
        cost,
      });
    }
  }
  summaryDiv.innerHTML = '';
  if (selectedItems.length === 0) {
    summaryDiv.innerHTML =
      "<div style='text-align:center; color:var(--text-muted); padding:8px;'>هیچ آیتمی انتخاب نشده است.</div>";
    return;
  }
  const table = document.createElement('table');
  table.style.width = '100%';
  table.style.borderCollapse = 'collapse';
  table.style.fontSize = '0.8rem';
  const thead = document.createElement('thead');
  thead.innerHTML = `<tr style="border-bottom:1px solid rgba(150,150,150,0.3);"><th style="text-align:right; padding:4px 2px;">آیتم</th><th style="text-align:center; padding:4px 2px;">تعداد</th><th style="text-align:left; padding:4px 2px;">قیمت</th><th style="text-align:center; padding:4px 2px;"></th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement('tbody');
  selectedItems.forEach((item) => {
    const row = tbody.insertRow();
    row.style.borderBottom = '1px solid rgba(150,150,150,0.1)';
    const nameCell = row.insertCell(0);
    nameCell.style.textAlign = 'right';
    nameCell.style.padding = '6px 2px';
    nameCell.innerText = item.name;
    const qtyCell = row.insertCell(1);
    qtyCell.style.textAlign = 'center';
    qtyCell.style.padding = '6px 2px';
    qtyCell.innerText = item.qty;
    const priceCell = row.insertCell(2);
    priceCell.style.textAlign = 'left';
    priceCell.style.padding = '6px 2px';
    priceCell.style.color = 'var(--success)';
    priceCell.innerHTML = formatMoneyWithIcon(item.cost);
    const actionCell = row.insertCell(3);
    actionCell.style.textAlign = 'center';
    actionCell.style.padding = '6px 2px';
    const delBtn = document.createElement('button');
    delBtn.innerHTML = '🗑️';
    delBtn.style.background = 'none';
    delBtn.style.border = 'none';
    delBtn.style.cursor = 'pointer';
    delBtn.style.color = 'var(--warning)';
    delBtn.style.fontSize = '1rem';
    delBtn.title = 'حذف از سفارش';
    delBtn.onclick = () => {
      currentCafeQuantities[item._id] = 0;
      const input = document.getElementById(`modal_cafe_qty_${item._id}`);
      if (input) input.value = 0;
      updateOrderSummary();
    };
    actionCell.appendChild(delBtn);
  });
  table.appendChild(tbody);
  const tfoot = document.createElement('tfoot');
  const totalRow = tfoot.insertRow();
  totalRow.style.borderTop = '2px solid var(--primary)';
  const totalCell = totalRow.insertCell(0);
  totalCell.colSpan = 3;
  totalCell.style.textAlign = 'left';
  totalCell.style.padding = '8px 2px 4px';
  totalCell.style.fontWeight = 'bold';
  totalCell.innerHTML = `💰 جمع کل: ${formatMoneyWithIcon(total)}`;
  const emptyCell = totalRow.insertCell(1);
  emptyCell.style.display = 'none';
  tfoot.appendChild(totalRow);
  table.appendChild(tfoot);
  summaryDiv.appendChild(table);
}

function closeCafeModal() {
  document.getElementById('cafeModal').style.display = 'none';
  currentCafeSessionIndex = null;
  currentCafeQuantities = {};
  originalCafeItems = [];
}

// ------------------------------------------------------------
// توابع جدید برای تایمر معکوس
// ------------------------------------------------------------
function formatRemainingTime(ms) {
  if (ms <= 0) return 'اتمام یافت';
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

async function setCountdownTimer(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'active') {
    customAlert('فقط برای جلسات فعال می‌توان تایمر تنظیم کرد.');
    return;
  }
  const minutesInput = await customPrompt(
    'مدت زمان (به دقیقه) را وارد کنید:',
    'number'
  );
  if (minutesInput === null) return;
  let minutes = parseInt(minutesInput);
  if (isNaN(minutes) || minutes <= 0) {
    customAlert('لطفاً یک عدد معتبر و بزرگتر از صفر وارد کنید.');
    return;
  }
  const now = Date.now();
  const durationMs = minutes * 60 * 1000;
  session.countdownEnd = now + durationMs;
  session.countdownActive = true;
  render();
  customAlert(`تایمر ${minutes} دقیقه‌ای با موفقیت تنظیم شد.`);
}

function checkAndNotifyCountdownTimers() {
  const day = currentSelectedDate;
  if (!gameNet[day]) return;
  let needRender = false;
  gameNet[day].forEach((session) => {
    if (
      session.status === 'active' &&
      session.countdownActive &&
      session.countdownEnd
    ) {
      if (Date.now() >= session.countdownEnd) {
        session.countdownActive = false;
        session.countdownEnd = null;
        saveCountdownToLocalStorage(session._id, null);

        needRender = true;
        let tableName =
          TABLE_CONFIGS[session.table]?.customName || session.table;
        customAlert(
          `⏰ هشدار تایمر: زمان تعیین شده برای ${tableName} به پایان رسید!`
        );
      }
    }
  });
  if (needRender) {
    render();
  }
}

function updateCountdownTooltips() {
  const day = currentSelectedDate;
  if (!gameNet[day]) return;
  const now = Date.now();
  document.querySelectorAll('.countdown-timer').forEach((el) => {
    const end = parseInt(el.getAttribute('data-end'));
    if (isNaN(end)) return;
    const remaining = Math.max(0, end - now);
    const tooltipSpan = el.querySelector('.custom-tooltip');
    if (tooltipSpan) {
      tooltipSpan.innerText = `زمان باقیمانده: ${formatRemainingTime(remaining)}`;
    }
    // اگر زمان تمام شده، المنت را مخفی کنیم (render بعدی آن را حذف می‌کند)
    if (remaining <= 0) {
      el.style.display = 'none';
    }
  });
}

// ================== مودال لاگ با ستون‌های جدید و جمع کل ==================
// ================== مودال لاگ با آیکون، دلتا، کسر پیش‌پرداخت و نمایش بستانکاری ==================
// ================== مودال لاگ با پشتیبانی از واحد پول انتخاب شده ==================

async function openSessionLogsModal(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد.');
    return;
  }
  showSessionLogsFromData(session, `گزارش رویدادهای میز ${session.table}`);
}
// ================== بازنویسی تابع ذخیره سفارش کافه برای تولید جدول HTML در لاگ ==================
async function saveCafeOrder() {
  const day = currentSelectedDate;
  const sessionId = window._currentCafeSessionId;
  if (!sessionId) {
    customAlert('شناسه جلسه یافت نشد');
    return;
  }

  const sessions = gameNet[day] || [];
  const session = sessions.find((s) => s._id === sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد');
    return;
  }

  const items = [];
  for (const item of cafeMenu) {
    const newQty = currentCafeQuantities[item._id] || 0; // تغییر: item._id
    const existing = session.cafeItems?.find((c) => c.id === item._id); // تغییر: item._id
    const oldQty = existing ? existing.qty : 0;
    if (newQty !== oldQty) {
      items.push({ id: item._id, qty: newQty }); // تغییر: item._id
    }
  }

  if (items.length === 0) {
    closeCafeModal();
    return;
  }

  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { items, gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;

    await apiFetch(`/api/v1/sessions/${sessionId}/cafe`, {
      method: 'POST',
      body: JSON.stringify(body),
    });

    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    await loadCafeMenuFromAPI();
    render();
    closeCafeModal();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

// ================== بهبود تابع ویرایش رزرو برای استفاده از نام سفارشی میز ==================
// (تنها بخش لاگ آن تغییر کرده)
async function saveEditReservation() {
  let day = currentSelectedDate;
  const session = getSessionById(editingReservationIndex);
  if (!session || session.status !== 'reserved') {
    customAlert('رکورد رزرو معتبر نیست.');
    closeEditReservationModal();
    return;
  }

  let newTable = document.getElementById('editReserveTableSelect').value;
  let newTime = document.getElementById('editReserveTime').value;
  let newName = document.getElementById('editReserveName').value.trim();
  let newPhone = document.getElementById('editReservePhone').value.trim();
  let newNote = document.getElementById('editReserveNoteInput').value;

  if (!newTime) {
    customAlert('لطفاً ساعت رزرو را مشخص کنید.');
    return;
  }
  if (!newName) {
    customAlert('لطفاً نام مشتری را وارد کنید.');
    return;
  }

  let conflict = gameNet[day].some((s, idx) => {
    if (idx === editingReservationIndex) return false;
    return (
      s.table === newTable && (s.status === 'active' || s.status === 'reserved')
    );
  });
  if (conflict) {
    customAlert(
      'میز انتخاب شده در این زمان فعال یا رزرو شده است. لطفاً میز دیگری انتخاب کنید.'
    );
    return;
  }

  let oldTable = session.table;
  let oldTime = session.timeStart;
  let oldName = session.customerName;
  let oldPhone = session.customerPhone;
  let oldNote = session.note;

  session.table = newTable;
  session.timeStart = newTime;
  session.customerName = newName;
  session.customerPhone = newPhone;
  session.note = newNote;

  let newConfig = TABLE_CONFIGS[newTable] || {
    console: session.consoleType,
    isVip: false,
  };
  session.consoleType = newConfig.console;

  let changes = [];
  // استفاده از نام سفارشی میز در لاگ
  let oldCustomName = TABLE_CONFIGS[oldTable]?.customName || oldTable;
  let newCustomName = TABLE_CONFIGS[newTable]?.customName || newTable;

  if (oldTable !== newTable)
    changes.push(`میز از ${oldCustomName} به ${newCustomName}`);
  if (oldTime !== newTime) changes.push(`ساعت از ${oldTime} به ${newTime}`);
  if (oldName !== newName)
    changes.push(`نام مشتری از "${oldName}" به "${newName}"`);
  if (oldPhone !== newPhone)
    changes.push(`شماره تماس از "${oldPhone}" به "${newPhone}"`);
  if ((oldNote || '') !== (newNote || '')) changes.push(`یادداشت تغییر کرد`);

  if (changes.length > 0) {
    addSessionLog(
      day,
      editingReservationIndex,
      'ویرایش رزرو',
      `ویرایش رزرو: ${changes.join('، ')}`,
      0,
      0
    );
  }

  closeEditReservationModal();
  render();
  customAlert('ویرایش رزرو با موفقیت ذخیره شد.');
}
function closeSessionLogsModal() {
  document.getElementById('sessionLogsModal').style.display = 'none';
}

// ================== ویرایش رکورد ==================

async function openEditModal(sessionId) {
  const session = getSessionById(sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد.');
    return;
  }

  window._editSessionId = session._id;
  window._oldSessionForEdit = JSON.parse(JSON.stringify(session));
  document.getElementById('editTimeStart').value = session.timeStart;
  document.getElementById('editModeSelect').value = session.mode;

  const unitText = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
  const discountFixedLabel = document.querySelector(
    '#discountSection .input-group:last-child label'
  );
  if (discountFixedLabel)
    discountFixedLabel.innerText = `مبلغ تخفیف (${unitText})`;
  const discountPercentInput = document.getElementById('editDiscountPercent');
  const discountFixedInput = document.getElementById('editDiscountFixed');

  if (discountPercentInput && discountFixedInput) {
    if (session.discountPercent && session.discountPercent !== 0) {
      discountPercentInput.value = session.discountPercent;
      discountFixedInput.value = '';
    } else if (session.discountFixed && session.discountFixed !== 0) {
      discountPercentInput.value = '';
      // تبدیل مبلغ تومان به واحد جاری (ریال یا تومان)
      let displayAmount = session.discountFixed;
      if (currentPriceUnit === 'Rial')
        displayAmount = session.discountFixed * 10;
      discountFixedInput.value = formatNumberWithCommas(displayAmount);
    } else {
      discountPercentInput.value = '';
      discountFixedInput.value = '';
    }
  }

  const extraFixedLabel = document.querySelector(
    '#extraChargeSection .input-group:last-child label'
  );
  if (extraFixedLabel) extraFixedLabel.innerText = `مبلغ اضافی (${unitText})`;
  const extraPercentInput = document.getElementById('editExtraPercent');
  const extraFixedInput = document.getElementById('editExtraFixed');
  if (extraPercentInput && extraFixedInput) {
    if (session.extraPercent && session.extraPercent !== 0) {
      extraPercentInput.value = session.extraPercent;
      extraFixedInput.value = '';
    } else if (session.extraFixed && session.extraFixed !== 0) {
      extraPercentInput.value = '';
      let displayAmount = session.extraFixed;
      if (currentPriceUnit === 'Rial') displayAmount = session.extraFixed * 10;
      extraFixedInput.value = formatNumberWithCommas(displayAmount);
    } else {
      extraPercentInput.value = '';
      extraFixedInput.value = '';
    }
  }

  const noteInput = document.getElementById('editNoteInput');
  if (noteInput) noteInput.value = session.note || '';
  const endGroup = document.getElementById('editTimeEndGroup');
  if (session.status === 'closed') {
    endGroup.style.display = 'flex';
    document.getElementById('editTimeEnd').value = session.timeEnd;
  } else {
    endGroup.style.display = 'none';
  }

  // ========== تایمر معکوس ==========
  const countdownDiv = document.getElementById('countdownControl');
  const countdownStatusSpan = document.getElementById('countdownStatus');
  if (session.status === 'active') {
    if (countdownDiv) countdownDiv.style.display = 'block';
    if (countdownStatusSpan) {
      if (session.countdownActive && session.countdownEnd) {
        let remainingSec = Math.max(
          0,
          (session.countdownEnd - Date.now()) / 1000
        );
        let remainingMin = Math.ceil(remainingSec / 60);
        countdownStatusSpan.innerText = `⏲️ تایمر فعال: ${remainingMin} دقیقه باقی مانده`;
      } else {
        countdownStatusSpan.innerText = 'تایمر فعال نیست';
      }
    }
  } else {
    if (countdownDiv) countdownDiv.style.display = 'none';
  }
  // ================================

  document.getElementById('editModal').style.display = 'flex';
  initTimePickerBehavior();
  updateTimePickerColorScheme();
}
function setCountdownFromEdit() {
  const sessionId = window._editSessionId; // از قبل ذخیره شده
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'active') {
    customAlert('فقط برای جلسات فعال می‌توان تایمر تنظیم کرد.');
    closeEditModal();
    return;
  }

  let minutesInput = document.getElementById('editCountdownMinutes').value;
  let minutes = parseInt(minutesInput);
  if (isNaN(minutes) || minutes <= 0) {
    customAlert('لطفاً یک عدد معتبر و بزرگتر از صفر وارد کنید.');
    return;
  }

  const now = Date.now();
  session.countdownEnd = now + minutes * 60 * 1000;
  session.countdownActive = true;
  saveCountdownToLocalStorage(session._id, session.countdownEnd);
  // به‌روزرسانی وضعیت در مودال
  document.getElementById('countdownStatus').innerText =
    `⏲️ تایمر ${minutes} دقیقه‌ای تنظیم شد.`;
  document.getElementById('editCountdownMinutes').value = '';

  render();
  customAlert(`تایمر ${minutes} دقیقه‌ای با موفقیت تنظیم شد.`);
}

function clearCountdownFromEdit() {
  let day = currentSelectedDate;
  let session = gameNet[day][editingIndex];
  if (!session) return;

  session.countdownActive = false;
  session.countdownEnd = null;
  saveCountdownToLocalStorage(session._id, null);
  document.getElementById('countdownStatus').innerText = 'تایمر لغو شد.';
  render();
  customAlert('تایمر معکوس لغو شد.');
}
function adjustEditCafeQty(itemId, delta) {
  let input = document.getElementById(`edit_cafe_qty_${itemId}`);
  if (input) {
    let newVal = parseInt(input.value) + delta;
    let max = parseInt(input.getAttribute('max'));
    if (isNaN(newVal)) newVal = 0;
    if (newVal < 0) newVal = 0;
    if (max !== undefined && newVal > max) newVal = max;
    input.value = newVal;
  }
}
function closeEditModal() {
  document.getElementById('editModal').style.display = 'none';
  window._oldSessionForEdit = null;
  // پاک کردن فیلدهای تایمر
  document.getElementById('editCountdownMinutes').value = '';
  document.getElementById('countdownStatus').innerText = '';
}
function logEditChanges(day, index, oldS, newS) {
  let changes = [];
  if (oldS.timeStart !== newS.timeStart)
    changes.push(`تغییر ساعت شروع از ${oldS.timeStart} به ${newS.timeStart}`);
  if (oldS.timeEnd !== newS.timeEnd)
    changes.push(`تغییر ساعت پایان از ${oldS.timeEnd} به ${newS.timeEnd}`);
  if (oldS.mode !== newS.mode)
    changes.push(`تغییر دسته از ${oldS.mode} به ${newS.mode}`);
  if (changes.length) {
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    let calc = calculateCost(
      newS,
      newS.status === 'closed' ? newS.timeEnd : nowStr
    );
    addSessionLog(
      day,
      index,
      'ویرایش رکورد',
      changes.join('، '),
      calc.gameCost,
      newS.cafeCost || 0
    );
  }
}

// ========== قانون مالی اصلاح شده در ویرایش رکورد (تغییر  دسته) ==========

async function saveEdit() {
  const day = currentSelectedDate;
  const sessionId = window._editSessionId;
  if (!sessionId) {
    customAlert('شناسه جلسه یافت نشد');
    return;
  }
  const sessions = gameNet[day] || [];
  const session = sessions.find((s) => s._id === sessionId);
  if (!session) {
    customAlert('جلسه یافت نشد');
    return;
  }

  const updates = {};

  // 1. دریافت مقادیر پایه
  const newTimeStart = document.getElementById('editTimeStart').value;
  const newMode = document.getElementById('editModeSelect').value;
  const newNote = document.getElementById('editNoteInput').value;

  // 2. تخفیف (درصد و مبلغ ثابت) با همگام‌سازی
  let newDiscountPercent = parseInt(
    document.getElementById('editDiscountPercent').value,
    10
  );
  if (isNaN(newDiscountPercent)) newDiscountPercent = 0;
  let newDiscountFixedRaw = parseNumberFromFormatted(
    document.getElementById('editDiscountFixed').value
  );
  if (isNaN(newDiscountFixedRaw)) newDiscountFixedRaw = 0;
  // تبدیل به تومان اگر واحد ریال است
  let newDiscountFixed = newDiscountFixedRaw;
  if (currentPriceUnit === 'Rial')
    newDiscountFixed = Math.round(newDiscountFixedRaw / 10);

  // محدودیت درصد
  if (newDiscountPercent > 100) newDiscountPercent = 100;
  if (newDiscountPercent < 0) newDiscountPercent = 0;
  // همگام‌سازی: اگر درصد >0 باشد، مبلغ ثابت را صفر کن
  if (newDiscountPercent > 0) newDiscountFixed = 0;
  else if (newDiscountFixed > 0) newDiscountPercent = 0;

  // اگر فقط مبلغ ثابت > 0 باشد، درصد را صفر می‌کنیم (قبلاً صفر است)
  // البته اگر کاربر همزمان هر دو را پر کرده بود، درصد اولویت داشت

  // 3. هزینه اضافی (درصد و مبلغ ثابت)
  let newExtraPercent = parseInt(
    document.getElementById('editExtraPercent').value,
    10
  );
  if (isNaN(newExtraPercent)) newExtraPercent = 0;
  let newExtraFixedRaw = parseNumberFromFormatted(
    document.getElementById('editExtraFixed').value
  );
  if (isNaN(newExtraFixedRaw)) newExtraFixedRaw = 0;
  let newExtraFixed = newExtraFixedRaw;
  if (currentPriceUnit === 'Rial')
    newExtraFixed = Math.round(newExtraFixedRaw / 10);

  if (newExtraPercent > 100) newExtraPercent = 100;
  if (newExtraPercent < 0) newExtraPercent = 0;
  if (newExtraPercent > 0) newExtraFixed = 0;
  else if (newExtraFixed > 0) newExtraPercent = 0;

  // 4. زمان پایان (فقط برای جلسات بسته)
  const endTimeInput = document.getElementById('editTimeEnd');
  let newTimeEnd = null;
  if (endTimeInput && endTimeInput.value && session.status === 'closed') {
    newTimeEnd = endTimeInput.value;
  }

  // 5. ساختن آبجکت updates فقط در صورت تغییر
  if (newTimeStart && newTimeStart !== session.timeStart)
    updates.timeStart = newTimeStart;
  if (newMode && newMode !== session.mode) updates.mode = newMode;
  if (newDiscountPercent !== (session.discountPercent || 0))
    updates.discountPercent = newDiscountPercent;
  if (newDiscountFixed !== (session.discountFixed || 0))
    updates.discountFixed = newDiscountFixed;
  if (newNote !== (session.note || '')) updates.note = newNote;
  if (newExtraPercent !== (session.extraPercent || 0))
    updates.extraPercent = newExtraPercent;
  if (newExtraFixed !== (session.extraFixed || 0))
    updates.extraFixed = newExtraFixed;
  if (newTimeEnd !== null && newTimeEnd !== session.timeEnd)
    updates.timeEnd = newTimeEnd;

  // اگر هیچ تغییری نکرده بود، مودال را ببند
  if (Object.keys(updates).length === 0) {
    closeEditModal();
    return;
  }

  // 6. ارسال درخواست به سرور
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = {
      updates,
      nowStr: new Date().toLocaleTimeString('fa-IR', {
        hour: '2-digit',
        minute: '2-digit',
      }),
      gameNetId,
    };
    if (userRole !== 'superAdmin') delete body.gameNetId;

    await apiFetch(`/api/v1/sessions/${sessionId}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });

    // بارگذاری مجدد و رندر
    await loadSessionsFromAPI(currentSelectedDate);
    render();
    closeEditModal();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

function getRoundingDescription() {
  if (USE_ROUND_DOWN_PRICE) {
    if (currentPriceUnit === 'Rial') {
      return 'گرد شده به پایین (مضرب ۵۰,۰۰۰ ریال)';
    } else {
      return 'گرد شده به پایین (مضرب ۵,۰۰۰ تومان)';
    }
  } else {
    if (currentPriceUnit === 'Rial') {
      return 'گرد شده به پایین (۱۰,۰۰۰ ریال)';
    } else {
      return 'گرد شده به پایین (۱,۰۰۰ تومان)';
    }
  }
}

// تابع کمکی برای محاسبه مجموع دقیقه‌های بازی از history + timeStart تا end (یا حال)
function calculateTotalMinutes(session) {
  let periods = [];
  if (session.history && session.history.length > 0) {
    periods = [...session.history];
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    periods.push({
      start: session.history[session.history.length - 1].end,
      end: session.status === 'active' ? nowStr : session.timeEnd,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    periods.push({
      start: session.timeStart,
      end:
        session.status === 'active'
          ? new Date().toLocaleTimeString('fa-IR', {
              hour: '2-digit',
              minute: '2-digit',
            })
          : session.timeEnd,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  }
  let total = 0;
  for (let p of periods) {
    let startMin =
      parseInt(p.start.split(':')[0]) * 60 + parseInt(p.start.split(':')[1]);
    let endMin =
      parseInt(p.end.split(':')[0]) * 60 + parseInt(p.end.split(':')[1]);
    if (endMin < startMin) endMin += 24 * 60;
    total += endMin - startMin;
  }
  return total;
}

// تابع کمکی برای محاسبه اختلاف زمان بر حسب دقیقه (newStart - oldStart)
function getTimeDiffInMinutes(oldTime, newTime) {
  // oldTime و newTime به صورت "HH:MM" هستند
  const [oldHour, oldMin] = oldTime.split(':').map(Number);
  const [newHour, newMin] = newTime.split(':').map(Number);

  let oldTotal = oldHour * 60 + oldMin;
  let newTotal = newHour * 60 + newMin;

  let diff = newTotal - oldTotal;

  // اگر اختلاف منفی باشد، یعنی زمان جدید در روز بعد است (عبور از نیمه‌شب)
  // در این صورت 24 ساعت (1440 دقیقه) به آن اضافه می‌کنیم
  if (diff < 0) {
    diff += 1440;
  }

  return diff;
}

async function revealIncome() {
  if (!isIncomeRevealed) {
    const authorized = await requirePasswordIfNeeded('revealIncome');
    if (!authorized) return;

    isIncomeRevealed = true;
    render();
    setTimeout(() => {
      isIncomeRevealed = false;
      render();
    }, 10000);
  }
}
function escapeHtml(str) {
  if (!str) return '';
  return str.replace(
    /[&<>]/g,
    (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[m] || m
  );
}

// ================== استخراج تغییرات دسته و میز از تاریخچه ==================
function getModeChangeTooltipContent(history) {
  if (!history || history.length === 0) return '';
  const changes = [];
  for (let entry of history) {
    if (entry.action && entry.action.includes('تغییر دسته')) {
      changes.push(
        `<li><i class="fas fa-exchange-alt"></i> ${escapeHtml(entry.action)}</li>`
      );
    }
  }
  if (changes.length === 0) return '';
  return `<div class="custom-tooltip"><ul>${changes.join('')}</ul></div>`;
}

function getTableChangeTooltipContent(history) {
  if (!history || history.length === 0) return '';
  const changes = [];
  for (let entry of history) {
    if (entry.action && entry.action.includes('انتقال میز')) {
      changes.push(
        `<li><i class="fas fa-exchange-alt"></i> ${escapeHtml(entry.action)}</li>`
      );
    }
  }
  if (changes.length === 0) return '';
  return `<div class="custom-tooltip"><ul>${changes.join('')}</ul></div>`;
}
async function continueSession(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'closed') {
    customAlert('این جلسه قابل ادامه نیست.');
    return;
  }
  try {
    const gameNetId = await getCurrentGameNetId();
    const body = { gameNetId };
    if (userRole !== 'superAdmin') delete body.gameNetId;
    await apiFetch(`/api/v1/sessions/${session._id}/reactivate`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    const currentDate = currentSelectedDate;
    await loadSessionsFromAPI(currentDate);
    render();
    neonFlash();
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}
async function render() {
  // اطمینان از بارگذاری مجدد جلسات (اختیاری، می‌توان فقط از کش استفاده کرد)
  const selectedDate = currentSelectedDate;
  const weekday = getDayOfWeekFromJalali(selectedDate);
  const todayJalali = getCurrentJalaliDate(); // باید ارقام انگلیسی برگرداند (قبلاً اصلاح کردید)
  const isToday = selectedDate === todayJalali;

  const prefix = isToday ? 'امروز:' : 'تاریخ:';
  const dateValue = `${weekday} (${currentSelectedDate})`;
  document.getElementById('currentDayDisplay').innerHTML = `
  <span style="color: white;">${prefix}</span>
  <span style="color: var(--primary);"> ${dateValue}</span>
`;
  // await loadSessionsFromAPI(selectedDate);
  generateTableSelect();
  let originalSessions = gameNet[selectedDate] || [];

  let totalIncome = 0,
    closedCount = 0;
  for (const s of originalSessions) {
    if (s.status === 'closed') {
      totalIncome += s.totalAmount || 0;
      closedCount++;
    }
  }
  if (!showClosedSessions) {
    originalSessions = originalSessions.filter((s) => s.status !== 'closed');
  }
  const sortBy = document.getElementById('sortSelect')?.value || 'default';
  const sessions = sortSessions(originalSessions, sortBy);

  sessionsBody.innerHTML = '';

  // محاسبه تعداد دستگاه‌های فعال
  const activeCount = (gameNet[currentSelectedDate] || []).filter(
    (s) => s.status === 'active'
  ).length;
  document.getElementById('activeDevicesCount').innerText = activeCount;
  document.getElementById('totalDevicesCount').innerText = DEVICES.length;

  for (let i = 0; i < sessions.length; i++) {
    const s = sessions[i];
    const modeTooltip = getModeChangeTooltipContent(s.history);
    const tableTooltip = getTableChangeTooltipContent(s.history);

    const config = TABLE_CONFIGS[s.table] || {
      customName: s.table,
      console: s.consoleType,
    };
    const displayName = config.customName || s.table;
    const rowClass =
      s.status === 'active'
        ? 'row-active'
        : s.status === 'reserved'
          ? 'row-reserved'
          : 'row-closed';

    const tr = document.createElement('tr');
    tr.className = rowClass;
    let modeChangeIcon = '';
    if (modeTooltip) {
      modeChangeIcon = `<span class="change-indicator" style="margin-right: 6px;">
        <i class="fas fa-exchange-alt change-icon"></i>
        ${modeTooltip}
    </span>`;
    }

    let tableChangeIcon = '';
    if (tableTooltip) {
      tableChangeIcon = `<span class="change-indicator" style="margin-right: 6px;">
        <i class="fas fa-exchange-alt change-icon"></i>
        ${tableTooltip}
    </span>`;
    }

    // و در ساخت سلول حالت:
    // ستون میز
    let tableCell = `<td><span class="badge badge-table">${escapeHtml(displayName)}</span> `;
    if (config.vip) tableCell += ` <span class="badge-vip">VIP 👑</span>`;
    if (config.royal) tableCell += ` <span class="badge-royal">Royal 💎</span>`;
    if (config.legendary)
      tableCell += ` <span class="badge-legendary">Legendary 🌟</span>`;
    if (tableChangeIcon) tableCell += tableChangeIcon;
    tableCell += `</td>`;
    tr.innerHTML = tableCell;

    // ستون کنسول و حالت
    tr.innerHTML += `<td><span class="badge badge-mode">${escapeHtml(s.consoleType)}</span> <small>${escapeHtml(s.mode)}</small>${modeChangeIcon}</td>`;
    tr.innerHTML += `<td dir="ltr">${s.timeStart}</td>`;

    // ستون تایمر / خروج
    let timeEndHtml = '';
    if (s.status === 'active') {
      timeEndHtml = `<span class="live-timer" id="timer_${s._id}">00:00:00</span>`;
      if (s.countdownEnd) {
        const endMs = new Date(s.countdownEnd).getTime();
        timeEndHtml += `<span class="change-indicator countdown-timer" data-end="${endMs}" data-session="${s._id}">⏲️ <span class="custom-tooltip">زمان باقیمانده: ${formatRemainingTime(endMs - Date.now())}</span></span>`;
      }
    } else if (s.status === 'reserved') {
      if (s.reserveTimestamp) {
        timeEndHtml = `<span class="live-timer reserved" id="timer_${s._id}" data-reserve-ts="${s.reserveTimestamp}">در حال محاسبه...</span>`;
      }
    } else {
      const durationHours = ((s.totalMinutes || 0) / 60).toFixed(2);
      timeEndHtml = `<span dir="ltr">${s.timeEnd || ''}</span> <small>(${durationHours}h)</small>`;
    }
    tr.innerHTML += `<td>${timeEndHtml}</td>`;

    // ستون سفارشات کافه
    let cafeBtn = '';
    if (s.status === 'active' || s.status === 'closed') {
      cafeBtn = `<button class="btn-cafe" data-session-id="${s._id}"><i class="fas fa-mug-hot"></i> سفارش کافه</button>`;
    }
    let orderItemsHtml = '';
    if (s.status === 'reserved') {
      orderItemsHtml = `<span class="badge badge-cafe">👤 ${escapeHtml(s.customerName || '')}</span>`;
      if (s.customerPhone)
        orderItemsHtml += `<span class="badge badge-cafe">📞 ${escapeHtml(s.customerPhone)}</span>`;
    } else if (s.cafeItems && s.cafeItems.length) {
      orderItemsHtml = s.cafeItems
        .map(
          (c) =>
            `<span class="badge badge-cafe">${escapeHtml(c.name)} (${c.qty})</span>`
        )
        .join('');
    } else {
      orderItemsHtml = `<span style="color:var(--text-muted);">-</span>`;
    }
    tr.innerHTML += `<td><div style="display:flex; flex-direction:column; gap:8px;"><div>${cafeBtn}</div><div>${orderItemsHtml}</div></div></td>`;

    // ستون هزینه
    let costHtml = '';
    if (s.status === 'active') {
      costHtml = `<span style="color:var(--text-muted)" id="live_cost_${s._id}">در حال محاسبه...</span>`;
    } else if (s.status === 'reserved') {
      costHtml = `<span style="color:var(--text-muted)">-</span>`;
    } else {
      costHtml = `<span style="color:var(--primary); font-weight:bold;">${formatMoneyWithIcon(s.totalAmount)}</span>`;
    }
    if (s.paidAmount)
      costHtml += `<br><small style="color:var(--success)">پیش‌پرداخت: ${formatMoneyWithIcon(s.paidAmount)}</small>`;
    tr.innerHTML += `<td>${costHtml}</td>`;

    // ستون عملیات
    let actionsHtml = '';
    if (s.status === 'active') {
      actionsHtml = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div class="btn-group">
        <button class="btn-success" onclick="closeSessionAuto('${s._id}')">✔ بستن</button>
        <button class="btn-primary" onclick="openEditModal('${s._id}')">✏️ ویرایش</button>
      </div>
      <div class="btn-group">
        <button class="btn-warning" onclick="openChangeModeModal('${s._id}')">🎮 دسته</button>
        <button class="btn-info" onclick="openChangeTableModal('${s._id}')">🔄 میز</button>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="addPayment('${s._id}')">💰 پیش‌پرداخت</button>
        <button class="btn-log" onclick="openSessionLogsModal('${s._id}')">📜 لاگ</button>
      </div>
    </div>
  `;
    } else if (s.status === 'reserved') {
      actionsHtml = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div class="btn-group">
        <button class="btn-success" onclick="startReservedSession('${s._id}')">▶️ شروع</button>
        <button class="btn-danger" onclick="deleteSession('${s._id}')">🗑️ لغو</button>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="openEditReservationModal('${s._id}')">✏️ ویرایش</button>
        <button class="btn-log" onclick="openSessionLogsModal('${s._id}')">📜 لاگ</button>
      </div>
    </div>
  `;
    } else if (s.status === 'closed') {
      actionsHtml = `
    <div style="display:flex; flex-direction:column; gap:6px;">
      <div class="btn-group">
        <button class="btn-success" onclick="continueSession('${s._id}')">▶️ ادامه</button>
        <button class="btn-danger" onclick="deleteSession('${s._id}')">🗑️ حذف</button>
      </div>
      <div class="btn-group">
        <button class="btn-primary" onclick="openEditModal('${s._id}')">✏️ ویرایش</button>
        <button class="btn-log" onclick="openSessionLogsModal('${s._id}')">📜 لاگ</button>
      </div>
    </div>
  `;
    }
    tr.innerHTML += `<td>${actionsHtml}</td>`;

    sessionsBody.appendChild(tr);

    // یادداشت اگر وجود داشت
    if (s.note && s.note.trim()) {
      const fullNote = s.note;
      const lines = fullNote.split('\n');
      const isLong = lines.length > 2;
      const truncated = isLong
        ? lines.slice(0, 2).join('\n') + '...'
        : fullNote;
      const noteId = `note_${s._id}_${Date.now()}`;
      const noteContent = `<span id="${noteId}" class="note-content">${escapeHtml(isLong ? truncated : fullNote).replace(/\n/g, '<br>')}</span>`;
      const moreBtn = isLong
        ? `<button class="note-toggle-btn" onclick="toggleNoteExpand('${noteId}')">بیشتر</button>`
        : '';
      const noteRow = document.createElement('tr');
      noteRow.className = 'note-row';
      noteRow.setAttribute('data-fullnote', fullNote);
      noteRow.setAttribute('data-truncated', truncated);
      noteRow.setAttribute('data-noteid', noteId);
      noteRow.innerHTML = `<td colspan="7" style="padding:6px 12px;"><span class="note-label">📝 یادداشت:</span> ${noteContent} ${moreBtn}</td>`;
      sessionsBody.appendChild(noteRow);
    }
  }
  document.querySelectorAll('.btn-cafe').forEach((btn) => {
    btn.removeEventListener('click', window.cafeClickHandler);
    btn.addEventListener('click', window.cafeClickHandler);
  });

  document.getElementById('recordCountDisplay').innerText = closedCount;
  const incomeEl = document.getElementById('totalAmountDisplay');
  if (isIncomeRevealed) {
    incomeEl.innerHTML = formatMoneyWithIcon(totalIncome);
  } else {
    incomeEl.innerText = '*** (کلیک برای نمایش) ***';
  }
}

function startLiveTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    let day = currentSelectedDate;
    if (!gameNet[day]) return;
    gameNet[day].forEach((session) => {
      try {
        if (session.status === 'active') {
          // تایمر پیشرو
          let startMs = getStartTimeMs(session.timeStart);

          let diffSeconds = Math.floor((Date.now() - startMs) / 1000);
          if (diffSeconds < 0) diffSeconds = 0;
          let hrs = Math.floor(diffSeconds / 3600)
            .toString()
            .padStart(2, '0');
          let mins = Math.floor((diffSeconds % 3600) / 60)
            .toString()
            .padStart(2, '0');
          let secs = (diffSeconds % 60).toString().padStart(2, '0');
          let timerEl = document.getElementById(`timer_${session._id}`);
          if (timerEl) timerEl.innerText = `${hrs}:${mins}:${secs}`;

          // هزینه زنده
          let costEl = document.getElementById(`live_cost_${session._id}`);
          if (costEl) {
            let now = new Date();
            let nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
            let calc = calculateCost(session, nowStr);
            costEl.innerHTML = `<small>کافه: ${formatMoneyWithIcon(session.cafeCost || 0)}</small><br><b>بازی: ${formatMoneyWithIcon(calc.gameCost)}</b>`;
          }
        } else if (session.status === 'reserved') {
          // تایمر رزرو
          let reserveMs = session.reserveTimestamp;
          if (reserveMs) {
            let diffSeconds = Math.floor((reserveMs - Date.now()) / 1000);
            let timerEl = document.getElementById(`timer_${session._id}`);
            if (timerEl) {
              if (diffSeconds > 0) {
                let hrs = Math.floor(diffSeconds / 3600)
                  .toString()
                  .padStart(2, '0');
                let mins = Math.floor((diffSeconds % 3600) / 60)
                  .toString()
                  .padStart(2, '0');
                let secs = (diffSeconds % 60).toString().padStart(2, '0');
                timerEl.innerText = `⏳ ${hrs}:${mins}:${secs}`;
                timerEl.className = 'live-timer reserved';
              } else {
                timerEl.innerText = '⚠️ زمان رزرو رسید!';
                timerEl.className = 'live-timer warning';
              }
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
    checkAndNotifyCountdownTimers();
    updateCountdownTooltips();
  }, 1000);
}
function toggleNoteExpand(noteId) {
  let container = document.getElementById(noteId);
  if (!container) return;
  let noteRow = container.closest('.note-row');
  if (!noteRow) return;
  let fullNote = noteRow.getAttribute('data-fullnote');
  let truncated = noteRow.getAttribute('data-truncated');
  let btn = container.parentElement?.querySelector('.note-toggle-btn');
  if (!btn) btn = container.nextElementSibling;
  if (!btn) return;
  if (btn.innerText.includes('بیشتر')) {
    container.innerHTML = escapeHtml(fullNote).replace(/\n/g, '<br>');
    btn.innerHTML = '&nbsp;&nbsp; نمایش کمتر';
  } else {
    container.innerHTML = escapeHtml(truncated).replace(/\n/g, '<br>');
    btn.innerText = '  بیشتر';
  }
}

async function secureExportToExcel() {
  const authorized = await requirePasswordIfNeeded('exportExcel');
  if (!authorized) return;
  const day = currentSelectedDate;
  const date = currentSelectedDate;
  try {
    const gameNetId = await getCurrentGameNetId();
    let url = `/api/v1/reports/export?date=${encodeURIComponent(date)}`;
    if (userRole === 'superAdmin') url += `&gameNetId=${gameNetId}`;
    const token = localStorage.getItem('accessToken');
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Server error: ${response.status} - ${errorText}`);
    }
    const blob = await response.blob();
    const link = document.createElement('a');
    const downloadUrl = URL.createObjectURL(blob);
    link.href = downloadUrl;
    link.download = `report_${day}_${date}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  } catch (err) {
    console.error(err);
    customAlert(`خطا: ${err.message}`);
  }
}
async function clearDayWithPassword() {
  const authorized = await requirePasswordIfNeeded('clearDay');
  if (!authorized) return;
  const confirmed = await customConfirm(
    'پاکسازی کل روز؟ (موجودی کافه باز نمی‌گردد)'
  );
  if (!confirmed) return;

  const date = currentSelectedDate;
  const sessions = gameNet[date] || [];
  if (sessions.length === 0) {
    customAlert('هیچ جلسه‌ای برای پاکسازی وجود ندارد.');
    return;
  }
  try {
    const gameNetId = await getCurrentGameNetId();
    for (const session of sessions) {
      let url = `/api/v1/sessions/${session._id}?originalDay=${date}`;
      if (userRole === 'superAdmin') url += `&gameNetId=${gameNetId}`;
      await apiFetch(url, { method: 'DELETE' }).catch((e) => console.warn(e));
    }
    await loadSessionsFromAPI(date);
    render();
    customAlert('تمام جلسات روز با موفقیت پاکسازی شدند.');
  } catch (err) {
    customAlert(`خطا در پاکسازی: ${err.message}`);
  }
}

function updateCafePricePlaceholder() {
  const priceInput = document.getElementById('newCafePrice');
  if (!priceInput) return;
  const unitLabel = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
  priceInput.placeholder = `قیمت (${unitLabel})`;
}
async function addCafeItem() {
  const name = document.getElementById('newCafeName').value.trim();
  let priceInput = document.getElementById('newCafePrice').value;
  const stock = parseInt(document.getElementById('newCafeStock').value);

  if (!name) return customAlert('لطفاً نام آیتم را وارد کنید');

  let priceInToman;
  if (currentPriceUnit === 'Rial') {
    let priceInRial = parseNumberFromFormatted(priceInput);
    if (priceInRial % 10 !== 0)
      return customAlert('⚠️ در حالت ریال، قیمت باید مضربی از ۱۰ باشد.');
    priceInToman = priceInRial / 10;
  } else {
    priceInToman = parseNumberFromFormatted(priceInput);
  }

  if (isNaN(priceInToman) || priceInToman <= 0)
    return customAlert('قیمت معتبر نیست');
  if (isNaN(stock) || stock < 0) return customAlert('موجودی معتبر نیست');

  try {
    const gameNetId = await getCurrentGameNetId();
    await apiFetch('/api/v1/cafe', {
      method: 'POST',
      body: JSON.stringify({ name, price: priceInToman, stock, gameNetId }),
    });
    document.getElementById('newCafeName').value = '';
    document.getElementById('newCafePrice').value = '';
    document.getElementById('newCafeStock').value = '';
    await loadCafeMenuFromAPI(); // بارگذاری مجدد منو از سرور
    renderCafeMenus();
    resetCafeModalToAddMode();
    customAlert('آیتم با موفقیت اضافه شد');
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

async function deleteCafeItem(index) {
  if (!(await customConfirm('آیا از حذف این آیتم از منو مطمئن هستید؟'))) return;
  const item = cafeMenu[index];
  try {
    const gameNetId = await getCurrentGameNetId();
    await apiFetch(`/api/v1/cafe/${item._id}?gameNetId=${gameNetId}`, {
      method: 'DELETE',
    });
    await loadCafeMenuFromAPI();
    renderCafeMenus();
    customAlert('آیتم حذف شد');
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}
function neonFlash() {
  document.getElementById('mainContainer').style.boxShadow =
    '0 0 40px var(--primary)';
  setTimeout(
    () => (document.getElementById('mainContainer').style.boxShadow = ''),
    500
  );
}

function editCafeItem(index) {
  const item = cafeMenu[index];
  document.getElementById('newCafeName').value = item.name;

  // نمایش قیمت بر اساس واحد جاری
  let displayPrice = item.price;
  if (currentPriceUnit === 'Rial') displayPrice = item.price * 10;
  document.getElementById('newCafePrice').value =
    formatNumberWithCommas(displayPrice);
  document.getElementById('newCafeStock').value = item.stock;

  const addBtn = document.getElementById('addCafeItemBtn');
  addBtn.textContent = 'به‌روزرسانی';
  addBtn.setAttribute('onclick', `updateCafeItem(${index})`);
  addBtn.classList.remove('btn-settings');
  addBtn.classList.add('btn-success');

  let cancelBtn = document.getElementById('cancelEditCafeBtn');
  if (!cancelBtn) {
    cancelBtn = document.createElement('button');
    cancelBtn.id = 'cancelEditCafeBtn';
    cancelBtn.textContent = 'لغو ویرایش';
    cancelBtn.className = 'btn btn-danger';
    cancelBtn.onclick = resetCafeModalToAddMode;
    const parent = addBtn.parentNode;
    const actionsRow = document.createElement('div');
    actionsRow.className = 'edit-actions-row';
    addBtn.parentNode.insertBefore(actionsRow, addBtn);
    actionsRow.appendChild(addBtn);
    actionsRow.appendChild(cancelBtn);
  } else {
    cancelBtn.style.display = 'block';
    const actionsRow = document.querySelector(
      '#manageCafeModal .edit-actions-row'
    );
    if (!actionsRow || !actionsRow.contains(cancelBtn)) {
      const parent = addBtn.parentNode;
      const newRow = document.createElement('div');
      newRow.className = 'edit-actions-row';
      parent.insertBefore(newRow, addBtn);
      newRow.appendChild(addBtn);
      newRow.appendChild(cancelBtn);
    }
  }

  setTimeout(() => {
    const modal = document.getElementById('manageCafeModal');
    const modalContent = modal.querySelector('.modal-content');
    if (modalContent) modalContent.scrollTo({ top: 0, behavior: 'smooth' });
    document
      .getElementById('newCafeName')
      .scrollIntoView({ behavior: 'smooth', block: 'center' });
    document.getElementById('newCafeName').focus();
  }, 100);
}
function resetCafeModalToAddMode() {
  document.getElementById('newCafeName').value = '';
  document.getElementById('newCafePrice').value = '';
  document.getElementById('newCafeStock').value = '';
  const addBtn = document.getElementById('addCafeItemBtn');
  addBtn.textContent = 'افزودن به منو';
  addBtn.setAttribute('onclick', 'addCafeItem()');
  addBtn.classList.remove('btn-success');
  addBtn.classList.add('btn-settings');
  const cancelBtn = document.getElementById('cancelEditCafeBtn');
  if (cancelBtn) cancelBtn.remove();
  const actionsRow = document.querySelector(
    '#manageCafeModal .edit-actions-row'
  );
  if (actionsRow && actionsRow.parentNode) {
    const parent = actionsRow.parentNode;
    parent.insertBefore(addBtn, actionsRow);
    actionsRow.remove();
  }
}
async function updateCafeItem(index) {
  const item = cafeMenu[index];
  const name = document.getElementById('newCafeName').value.trim();
  let priceInput = document.getElementById('newCafePrice').value;
  const stock = parseInt(document.getElementById('newCafeStock').value);

  if (!name) return customAlert('لطفاً نام آیتم را وارد کنید');

  let priceInToman;
  if (currentPriceUnit === 'Rial') {
    let priceInRial = parseNumberFromFormatted(priceInput);
    if (priceInRial % 10 !== 0)
      return customAlert('⚠️ در حالت ریال، قیمت باید مضربی از ۱۰ باشد.');
    priceInToman = priceInRial / 10;
  } else {
    priceInToman = parseNumberFromFormatted(priceInput);
  }

  if (isNaN(priceInToman) || priceInToman <= 0)
    return customAlert('قیمت معتبر نیست');
  if (isNaN(stock) || stock < 0) return customAlert('موجودی معتبر نیست');

  try {
    const gameNetId = await getCurrentGameNetId();
    await apiFetch(`/api/v1/cafe/${item._id}`, {
      method: 'PUT',
      body: JSON.stringify({ name, price: priceInToman, stock, gameNetId }),
    });
    await loadCafeMenuFromAPI();
    renderCafeMenus();
    resetCafeModalToAddMode();
    customAlert('آیتم با موفقیت به‌روزرسانی شد');
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

function closeDeviceManager() {
  document.getElementById('deviceManagerModal').style.display = 'none';
}

document.querySelectorAll('.modal-overlay').forEach((modal) => {
  modal.addEventListener('click', function (e) {
    if (e.target === modal) {
      modal.style.display = 'none';
      if (modal.id === 'cafeModal') {
        currentCafeSessionIndex = null;
        currentCafeQuantities = {};
        originalCafeItems = [];
      }
    }
  });
});
setInterval(() => {
  const timeInput = document.getElementById('timeStart');
  if (timeInput && document.activeElement !== timeInput) {
    const now = new Date();
    timeInput.value = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  }
}, 1000);

function showRulesModal() {
  const modal = document.getElementById('rulesModal');
  const contentDiv = document.getElementById('rulesContent');
  if (!modal || !contentDiv) {
    console.error('مودال یا محتوای قوانین یافت نشد');
    return;
  }

  contentDiv.innerHTML = `
    <div style="background: var(--input-bg); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
      <h4 style="color: var(--primary); margin: 0 0 10px 0;">⚖️ سه حالت محاسبه هزینه بازی</h4>
      <ul style="padding-right: 20px; line-height: 1.7;">
        <li><strong>🔹 حالت اول – بدون تغییر دسته/میز و زمان زیر ۶۰ دقیقه</strong><br>
        اگر در طول جلسه <span style="color: var(--success);">هیچ تغییری در دسته یا میز رخ ندهد</span> و مجموع زمان بازی کمتر از ۶۰ دقیقه باشد، در صورتی که گزینه <strong>«حداقل یک ساعت»</strong> در تنظیمات عمومی فعال باشد، <span style="color: var(--warning);">هزینه یک ساعت کامل</span> محاسبه می‌شود. در غیر این صورت هزینه بر اساس <span style="color: var(--primary);">دقیقه واقعی</span> محاسبه می‌گردد.</li>
        
        <li><strong>🔸 حالت دوم – با تغییر دسته/میز (حتی یک بار) و زمان زیر ۶۰ دقیقه</strong><br>
        اگر در طول جلسه <span style="color: var(--warning);">حداقل یک بار دسته یا میز تغییر کند</span>، قانون «حداقل یک ساعت» <strong>اعمال نمی‌شود</strong> و هزینه همیشه بر اساس <span style="color: var(--primary);">دقیقه واقعی بازی</span> محاسبه می‌گردد. هزینه هر بازه با نرخ مخصوص آن بازه به صورت جداگانه محاسبه و جمع می‌شود.</li>
        
        <li><strong>🔹 حالت سوم – زمان بازی ۶۰ دقیقه یا بیشتر</strong><br>
        صرف نظر از تغییرات دسته/میز، هزینه بر اساس <span style="color: var(--primary);">دقیقه واقعی</span> محاسبه می‌شود (زیرا از حداقل یک ساعت عبور کرده است).</li>
      </ul>
    </div>
    
    <div style="background: var(--input-bg); padding: 15px; border-radius: 12px; margin-bottom: 15px;">
      <h4 style="color: var(--primary); margin: 0 0 10px 0;">🧮 فرمول محاسبه هزینه بازی</h4>
      <p style="margin: 5px 0;"><strong>هزینه بازی = مجموع (دقیقه هر بازه × نرخ ساعتی آن بازه ÷ 60)</strong></p>
      <p style="margin: 5px 0;"><strong>جمع نهایی قابل پرداخت = هزینه بازی + هزینه سفارشات کافه − پیش‌پرداخت − تخفیف</strong></p>
      <p style="margin: 5px 0; color: var(--text-muted);">نرخ هر بازه بر اساس کنسول، حالت بازی (تعداد دسته) و وضعیت ویژه (VIP، Royal، Legendary) تعیین می‌شود.</p>
      <p style="margin: 5px 0; color: var(--text-muted);">در صورت فعال بودن گزینه <strong>«گرد کردن قیمت به پایین»</strong> در تنظیمات عمومی، مبلغ نهایی به پایین و به نزدیک‌ترین مضرب ۵۰۰۰ تومان گرد می‌شود. در غیر این صورت به هزار تومان پایین گرد می‌گردد.</p>
    </div>
    
    <div style="background: var(--input-bg); padding: 15px; border-radius: 12px;">
      <h4 style="color: var(--primary); margin: 0 0 10px 0;">📌 نکات مهم عملیاتی</h4>
      <ul style="padding-right: 20px;">
        <li>هر زمان که <strong>حالت بازی (تعداد دسته)</strong> یا <strong>میز (کنسول)</strong> را تغییر دهید، سیستم یک بازه جدید ثبت می‌کند و هزینه بر اساس دقیقه واقعی (بدون اعمال حداقل یک ساعت) محاسبه خواهد شد.</li>
        <li>در لاگ رویدادهای هر میز، جزئیات کامل هر بازه (مدت، نرخ، هزینه) نمایش داده می‌شود و در صورت اعمال قانون حداقل یک ساعت، پیام مربوطه درج می‌گردد.</li>
        <li>ویرایش رکورد بسته شده با تغییر دسته، کل جلسه را از نو با دسته جدید محاسبه می‌کند (تاریخچه تغییرات نادیده گرفته می‌شود).</li>
        <li>همه نرخ‌های ساعتی از بخش مدیریت دستگاه‌ها (تعرفه پایه) خوانده می‌شوند و قابل تغییر هستند.</li>
      </ul>
    </div>
  `;

  modal.style.display = 'flex';
  modal.style.zIndex = '2100';
}
function closeRulesModal() {
  const modal = document.getElementById('rulesModal');
  if (modal) modal.style.display = 'none';
}

// ================== توابع ویرایش رزرو ==================
let editingReservationIndex = -1;

function populateEditReservationTables() {
  const select = document.getElementById('editReserveTableSelect');
  if (!select) return;
  select.innerHTML = '';
  // استفاده از آرایه DEVICES به جای TOTAL_TABLES
  for (let i = 0; i < DEVICES.length; i++) {
    let dev = DEVICES[i];
    let tableName = 'میز ' + (i + 1);
    let label = `${dev.name} (${dev.console}${dev.vip || dev.royal || dev.legendary ? ' - VIP 👑' : ''})`;
    select.appendChild(new Option(label, tableName));
  }
}

function openEditReservationModal(sessionId) {
  const session = getSessionById(sessionId);
  if (!session || session.status !== 'reserved') {
    customAlert('این رکورد وضعیت رزرو ندارد.');
    return;
  }
  editingReservationIndex = sessionId;
  populateEditReservationTables();
  document.getElementById('editReserveTableSelect').value = session.table;
  document.getElementById('editReserveTime').value = session.timeStart;
  document.getElementById('editReserveName').value = session.customerName || '';
  document.getElementById('editReservePhone').value =
    session.customerPhone || '';
  document.getElementById('editReserveNoteInput').value = session.note || '';
  document.getElementById('editReservationModal').style.display = 'flex';
}

function closeEditReservationModal() {
  document.getElementById('editReservationModal').style.display = 'none';
  editingReservationIndex = -1;
}

// ================== هندلر Enter در مودال‌ها ==================
function handleEnterInModals(e) {
  if (e.key !== 'Enter') return;

  const activeEl = document.activeElement;
  // در textarea اجازه دهید Enter خط جدید ایجاد کند
  if (activeEl && activeEl.tagName === 'TEXTAREA') return;

  // پیدا کردن تمام مودال‌های باز
  const openModals = Array.from(
    document.querySelectorAll('.modal-overlay')
  ).filter((modal) => modal.style.display === 'flex');
  if (openModals.length === 0) return;

  // اولویت با مودالی است که focus داخل آن قرار دارد، در غیر این صورت اولین مودال باز
  let targetModal =
    openModals.find((modal) => modal.contains(activeEl)) || openModals[0];

  let confirmBtn = null;
  switch (targetModal.id) {
    case 'reserveModal':
      confirmBtn = targetModal.querySelector('.btn-primary'); // دکمه "ثبت رزرو"
      break;
    case 'cafeModal':
      confirmBtn = targetModal.querySelector('.btn-primary'); // دکمه "ثبت سفارش"
      break;
    case 'editModal':
      confirmBtn = targetModal.querySelector('.btn-success'); // دکمه "ذخیره تغییرات"
      break;
    case 'changeModeModal':
      confirmBtn = targetModal.querySelector('.btn-success'); // دکمه "تایید و ثبت در سابقه"
      break;
    case 'changeTableModal':
      confirmBtn = targetModal.querySelector('.btn-success'); // دکمه "انتقال مشتری"
      break;
    case 'editReservationModal':
      confirmBtn = targetModal.querySelector('.btn-success'); // دکمه "ذخیره تغییرات"
      break;
    case 'manageCafeModal':
      confirmBtn = document.getElementById('addCafeItemBtn'); // دکمه "افزودن به منو" یا "به‌روزرسانی"
      break;
    case 'customModal':
      confirmBtn = document.getElementById('customModalConfirmBtn'); // دکمه "تأیید"
      break;
    default:
      return;
  }

  if (confirmBtn && confirmBtn.style.display !== 'none') {
    e.preventDefault(); // جلوگیری از هرگونه submit ناخواسته
    confirmBtn.click();
  }
}

// ================== مدیریت دستگاه‌ها (جایگزین تنظیمات قدیم میزها و قیمت‌ها) ==================

// تابع تعیین نوع قیمت‌گذاری پیش‌فرض بر اساس نام کنسول
function getDefaultPricingType(consoleName) {
  const consoleLower = consoleName.toLowerCase();
  // کنسول‌های بازی
  if (
    [
      'ps4',
      'ps5',
      'ps5 pro',
      'xbox x',
      'xbox s',
      'xbox one',
      'pc',
      'ps3',
      'nintendo',
    ].includes(consoleLower)
  ) {
    return 'hourly_handles';
  }
  // دستگاه‌های گروهی (بیلیارد، فوتبال دستی، ...)
  if (
    [
      'بیلیارد',
      'فوتبال دستی',
      'دارت',
      'تنیس روی میز',
      'پینگ پنگ',
      'بسکتبال الکترونیک',
      'کرکره',
      'هوکی روی میز',
    ].includes(consoleName)
  ) {
    return 'hourly_per_person';
  }
  // سایر (پیش‌فرض ثابت)
  return 'hourly_fixed';
}
// تابع تعیین حالت‌های پیش‌فرض برای هر نوع قیمت‌گذاری
function getDefaultModesForPricingType(pricingType) {
  if (pricingType === 'hourly_handles') {
    return ['1 دسته', '2 دسته', '3 دسته', '4 دسته', 'معمولی', 'VIP'];
  } else if (pricingType === 'hourly_per_person') {
    return ['یک نفر', 'دو نفر', 'سه نفر', 'چهار نفر و بیشتر'];
  } else {
    // hourly_fixed
    return ['معمولی'];
  }
}

function saveDevices() {
  localStorage.setItem('GAMENET_DEVICES', JSON.stringify(DEVICES));
  rebuildTablesAndPricing();
  updateModeSelectOptions();
  if (typeof render === 'function') render();
  if (typeof generateTableSelect === 'function') generateTableSelect();
}

function rebuildTablesAndPricing() {
  TOTAL_TABLES = DEVICES.length;
  const newTableConfigs = {};
  const newPricing = {};

  DEVICES.forEach((dev, idx) => {
    const tableNum = idx + 1;
    newTableConfigs[tableNum] = {
      console: dev.console,
      isVip: dev.vip || dev.royal || dev.legendary,
      customName: dev.name,
      deviceId: dev.id,
      vip: dev.vip,
      royal: dev.royal,
      legendary: dev.legendary,
      pricingType: dev.pricingType,
      modes: dev.modes,
      prices: dev.prices,
    };
  });
  TABLE_CONFIGS = newTableConfigs;

  // ساخت PRICING فقط برای دستگاه‌های hourly_handles (کنسول‌ها)
  for (let i = 0; i < DEVICES.length; i++) {
    const dev = DEVICES[i];
    if (dev.pricingType !== 'hourly_handles') continue;
    let consoleKey = dev.console;
    if (consoleKey === 'PS5 Pro') consoleKey = 'PS5';
    if (consoleKey === 'PS3') consoleKey = 'PS4';
    if (['Xbox X', 'Xbox S', 'Xbox One'].includes(consoleKey))
      consoleKey = 'Xbox';
    const isVip = dev.vip || dev.royal || dev.legendary;
    let targetKey = isVip ? `VIP_${consoleKey}` : consoleKey;
    if (!newPricing[targetKey]) newPricing[targetKey] = {};
    for (let mode of dev.modes) {
      if (dev.prices[mode]) newPricing[targetKey][mode] = dev.prices[mode];
    }
  }
  const defaultModes = [
    '1 دسته',
    '2 دسته',
    '3 دسته',
    '4 دسته',
    'معمولی',
    'VIP',
  ];
  const defaultPrice = 50000;
  for (let key in newPricing) {
    for (let mode of defaultModes) {
      if (!newPricing[key][mode]) newPricing[key][mode] = defaultPrice;
    }
  }
  PRICING = newPricing;

  localStorage.setItem('TABLE_CONFIGS', JSON.stringify(TABLE_CONFIGS));
  localStorage.setItem('PRICING', JSON.stringify(PRICING));
  localStorage.setItem('TOTAL_TABLES', TOTAL_TABLES.toString());

  if (typeof generateTableSelect === 'function') generateTableSelect();
  if (typeof render === 'function') render();
}

// ========== توابع UI مدیریت دستگاه‌ها ==========
async function openDeviceManager() {
  const authorized = await requirePasswordIfNeeded('manageDevices');
  if (!authorized) return;
  document.getElementById('deviceManagerModal').style.display = 'flex';
  await renderDevicesGrid();
  const addBtn = document.getElementById('addNewDeviceBtn');
  addBtn.onclick = () => openDeviceForm(null);
}

async function renderDevicesGrid() {
  const grid = document.getElementById('devicesGrid');
  if (!grid) return;
  grid.innerHTML =
    '<div style="text-align:center; padding:20px;">بارگذاری...</div>';
  try {
    const gameNetId = await getCurrentGameNetId();
    const devices = await apiFetch(`/api/v1/devices?gameNetId=${gameNetId}`);
    if (devices.length === 0) {
      grid.innerHTML =
        '<div style="grid-column:1/-1; text-align:center; padding:40px;">هیچ دستگاهی تعریف نشده است. دکمه افزودن را بزنید.</div>';
      return;
    }
    grid.innerHTML = '';
    devices.forEach((dev) => {
      const consoleIcon = getConsoleIcon(dev.console);
      let badges = '';
      if (dev.vip)
        badges +=
          '<span class="badge-vip" style="margin-left:5px;">VIP 👑</span>';
      if (dev.royal)
        badges +=
          '<span class="badge-royal" style="margin-left:5px;">Royal 💎</span>';
      if (dev.legendary)
        badges += '<span class="badge-legendary">Legendary 🌟</span>';
      let pricesHtml = '<div class="device-prices-list">';
      for (let mode of dev.modes) {
        pricesHtml += `<div class="price-item"><span class="price-mode">${escapeHtml(mode)}</span><span class="price-value">${formatMoneyWithIcon(dev.prices[mode])}</span></div>`;
      }
      pricesHtml += '</div>';
      const card = document.createElement('div');
      card.className = 'device-card';
      card.innerHTML = `
        <div class="device-card-header">
          <div class="device-name-row">
            <div class="device-title"><i class="${consoleIcon}"></i><span>${escapeHtml(dev.name)}</span></div>
            <div class="device-badges">${badges}</div>
          </div>
          <div class="device-console-chip"><i class="fas fa-microchip"></i> ${escapeHtml(dev.console)}</div>
        </div>
        <div class="device-card-body">
          ${pricesHtml}
          <div class="device-desc">${dev.description ? escapeHtml(dev.description) : '—'}</div>
          <div class="device-actions">
            <button class="btn btn-primary" onclick="editDevice('${dev._id}')">✏️ ویرایش</button>
            <button class="btn btn-danger" onclick="deleteDevice('${dev._id}')">🗑️ حذف</button>
          </div>
        </div>
      `;
      grid.appendChild(card);
    });
  } catch (err) {
    grid.innerHTML = `<div style="color:red;">خطا: ${err.message}</div>`;
  }
}
async function openDeviceForm(deviceId = null) {
  if (deviceId === -1 || deviceId === '-1') deviceId = null;
  editingDeviceId = deviceId;
  const formModal = document.getElementById('deviceFormModal');
  document.getElementById('deviceForm').reset();
  document.getElementById('priceFieldsContainer').innerHTML = '';
  document.getElementById('customConsoleDiv').style.display = 'none';
  if (deviceId) {
    document.getElementById('deviceFormTitle').innerText = '✏️ ویرایش دستگاه';
    try {
      const gameNetId = await getCurrentGameNetId();
      const dev = await apiFetch(
        `/api/v1/devices/${deviceId}?gameNetId=${gameNetId}`
      );
      document.getElementById('deviceName').value = dev.name;
      const consoleSelect = document.getElementById('deviceConsole');
      if (
        Array.from(consoleSelect.options).some(
          (opt) => opt.value === dev.console
        )
      ) {
        consoleSelect.value = dev.console;
      } else {
        consoleSelect.value = 'سایر';
        document.getElementById('customConsoleDiv').style.display = 'block';
        document.getElementById('customConsoleName').value = dev.console;
      }
      document.getElementById('deviceDesc').value = dev.description || '';
      const radioMap = { vip: 'vip', royal: 'royal', legendary: 'legendary' };
      const status = Object.keys(radioMap).find((k) => dev[k]);
      if (status)
        document.querySelector(
          `input[name="specialStatus"][value="${status}"]`
        ).checked = true;
      else
        document.querySelector(
          'input[name="specialStatus"][value="none"]'
        ).checked = true;
      document.getElementById('pricingTypeSelect').value = dev.pricingType;
      await updateModesAndPricesByType(false);
      document.querySelectorAll('.mode-check').forEach((cb) => {
        cb.checked = dev.modes.includes(cb.value);
      });
      updatePriceFieldsByModes();
      for (let mode of dev.modes) {
        const input = document.getElementById(
          `price_${mode.replace(/ /g, '_')}`
        );
        if (input && dev.prices[mode])
          input.value = formatNumberWithCommas(dev.prices[mode]);
      }
    } catch (err) {
      customAlert(`خطا در بارگذاری دستگاه: ${err.message}`);
    }
  } else {
    document.getElementById('deviceFormTitle').innerText =
      '➕ افزودن دستگاه جدید';
    document.querySelector(
      'input[name="specialStatus"][value="none"]'
    ).checked = true;
    updateModesAndPricesByType(true);
  }
  formModal.style.display = 'flex';
}

function updateModesAndPricesByType(resetPrices = true) {
  const pricingType = document.getElementById('pricingTypeSelect').value;
  const modesContainer = document.getElementById('modesContainer');
  const priceFieldsContainer = document.getElementById('priceFieldsContainer');

  if (!modesContainer || !priceFieldsContainer) return;

  modesContainer.innerHTML = '';
  priceFieldsContainer.innerHTML = '';

  let checkboxesHtml = '';
  let defaultModes = getDefaultModesForPricingType(pricingType);

  if (pricingType === 'hourly_handles') {
    checkboxesHtml = `
      <label>دسته‌های پشتیبانی شده</label>
      <div style="display: flex; gap: 15px; flex-wrap: wrap;">
        <label><input type="checkbox" class="mode-check" value="1 دسته"> 1 دسته</label>
        <label><input type="checkbox" class="mode-check" value="2 دسته"> 2 دسته</label>
        <label><input type="checkbox" class="mode-check" value="3 دسته"> 3 دسته</label>
        <label><input type="checkbox" class="mode-check" value="4 دسته"> 4 دسته</label>
        <label><input type="checkbox" class="mode-check" value="معمولی"> معمولی (PC)</label>
        <label><input type="checkbox" class="mode-check" value="VIP"> VIP (PC)</label>
      </div>
    `;
  } else if (pricingType === 'hourly_fixed') {
    checkboxesHtml = `
      <label>نوع تعرفه</label>
      <div style="display: flex; gap: 15px; flex-wrap: wrap;">
        <label><input type="checkbox" class="mode-check" value="معمولی" ${defaultModes.includes('معمولی') ? 'checked' : ''}> معمولی</label>
      </div>
    `;
  } else if (pricingType === 'hourly_per_person') {
    checkboxesHtml = `
      <label>تعداد نفرات</label>
      <div style="display: flex; gap: 15px; flex-wrap: wrap;">
        <label><input type="checkbox" class="mode-check" value="یک نفر" ${defaultModes.includes('یک نفر') ? 'checked' : ''}> یک نفر</label>
        <label><input type="checkbox" class="mode-check" value="دو نفر" ${defaultModes.includes('دو نفر') ? 'checked' : ''}> دو نفر</label>
        <label><input type="checkbox" class="mode-check" value="سه نفر" ${defaultModes.includes('سه نفر') ? 'checked' : ''}> سه نفر</label>
        <label><input type="checkbox" class="mode-check" value="چهار نفر و بیشتر" ${defaultModes.includes('چهار نفر و بیشتر') ? 'checked' : ''}> چهار نفر و بیشتر</label>
      </div>
    `;
  }
  modesContainer.innerHTML = checkboxesHtml;

  // تابع ساخت فیلدهای قیمت
  const buildPriceFields = () => {
    // ذخیره مقادیر فعلی قیمت‌ها (قبل از حذف)
    const existingValues = {};
    document
      .querySelectorAll('#priceFieldsContainer .price-input')
      .forEach((input) => {
        const mode = input.id.replace('price_', '').replace(/_/g, ' ');
        existingValues[mode] = input.value;
      });

    priceFieldsContainer.innerHTML = '';
    const selectedModes = Array.from(
      document.querySelectorAll('.mode-check:checked')
    ).map((cb) => cb.value);

    selectedModes.forEach((mode) => {
      const div = document.createElement('div');
      div.className = 'price-input-group';
      const safeId = `price_${mode.replace(/ /g, '_')}`;
      div.innerHTML = `
      <label>قیمت ساعتی (${mode}):</label>
      <input type="text" id="${safeId}" class="price-input" 
             placeholder="مثلاً 50,000 ${currentPriceUnit}" 
             oninput="this.value = formatNumberWithCommas(this.value.replace(/,/g, ''))">
    `;
      priceFieldsContainer.appendChild(div);

      // بازیابی مقدار قبلی اگر وجود داشت
      const newInput = document.getElementById(safeId);
      if (newInput && existingValues[mode]) {
        newInput.value = existingValues[mode];
      }
    });
  };

  // اتصال رویداد تغییر چک‌باکس‌ها
  const attachCheckboxEvents = () => {
    const modeChecks = document.querySelectorAll('.mode-check');
    modeChecks.forEach((cb) => {
      cb.removeEventListener('change', buildPriceFields);
      cb.addEventListener('change', buildPriceFields);
    });
  };

  attachCheckboxEvents();
  if (resetPrices) buildPriceFields();
}

function closeDeviceForm() {
  document.getElementById('deviceFormModal').style.display = 'none';
  editingDeviceIndex = -1;
}

function updatePriceFieldsByModes() {
  const container = document.getElementById('priceFieldsContainer');
  if (!container) return;

  // ذخیره مقادیر فعلی
  const existingValues = {};
  document
    .querySelectorAll('#priceFieldsContainer .price-input')
    .forEach((input) => {
      const mode = input.id.replace('price_', '').replace(/_/g, ' ');
      existingValues[mode] = input.value;
    });

  const selectedModes = Array.from(
    document.querySelectorAll('.mode-check:checked')
  ).map((cb) => cb.value);
  container.innerHTML = '';

  for (let mode of selectedModes) {
    const div = document.createElement('div');
    div.className = 'input-group';
    div.style.marginBottom = '10px';
    const inputId = `price_${mode.replace(/ /g, '_')}`;
    div.innerHTML = `
      <label>💰 قیمت ساعتی برای ${mode}</label>
      <input type="text" id="${inputId}" class="price-input" placeholder="مبلغ به ${currentPriceUnit === 'Rial' ? 'ریال' : 'تومان'}" oninput="liveNumberFormat(this)">
    `;
    container.appendChild(div);

    // بازیابی مقدار
    const input = document.getElementById(inputId);
    if (input && existingValues[mode]) {
      input.value = existingValues[mode];
    }
  }
}

// ذخیره دستگاه از فرم
async function saveDeviceFromForm() {
  const name = document.getElementById('deviceName').value.trim();
  if (!name) return customAlert('نام دستگاه الزامی است');
  let consoleVal = document.getElementById('deviceConsole').value;
  if (consoleVal === 'سایر') {
    const customName = document
      .getElementById('customConsoleName')
      .value.trim();
    if (!customName) return customAlert('لطفاً نام دستگاه را وارد کنید');
    consoleVal = customName;
  }
  const description = document.getElementById('deviceDesc').value;
  let vip = false,
    royal = false,
    legendary = false;
  const selectedSpecial = document.querySelector(
    'input[name="specialStatus"]:checked'
  );
  if (selectedSpecial) {
    switch (selectedSpecial.value) {
      case 'vip':
        vip = true;
        break;
      case 'royal':
        royal = true;
        break;
      case 'legendary':
        legendary = true;
        break;
    }
  }
  const pricingType = document.getElementById('pricingTypeSelect').value;
  const selectedModes = Array.from(
    document.querySelectorAll('.mode-check:checked')
  ).map((cb) => cb.value);
  if (selectedModes.length === 0)
    return customAlert('حداقل یک گزینه باید انتخاب شود');
  const prices = {};
  for (let mode of selectedModes) {
    const inputId = `price_${mode.replace(/ /g, '_')}`;
    const input = document.getElementById(inputId);
    if (!input) return customAlert(`قیمت برای ${mode} یافت نشد`);
    let priceVal = parseNumberFromFormatted(input.value);
    if (currentPriceUnit === 'Rial') priceVal = Math.round(priceVal / 10);
    if (isNaN(priceVal) || priceVal <= 0)
      return customAlert(`قیمت برای ${mode} نامعتبر است`);
    prices[mode] = priceVal;
  }
  const deviceData = {
    name,
    console: consoleVal,
    pricingType,
    modes: selectedModes,
    prices,
    description,
    vip,
    royal,
    legendary,
  };
  try {
    const gameNetId = await getCurrentGameNetId();
    if (editingDeviceId) {
      await apiFetch(`/api/v1/devices/${editingDeviceId}`, {
        method: 'PUT',
        body: JSON.stringify({ ...deviceData, gameNetId }),
      });
    } else {
      await apiFetch('/api/v1/devices', {
        method: 'POST',
        body: JSON.stringify({ ...deviceData, gameNetId }),
      });
    }
    closeDeviceForm();
    await loadDevicesFromAPI();
    if (document.getElementById('deviceManagerModal').style.display === 'flex')
      renderDevicesGrid();
    customAlert('دستگاه با موفقیت ذخیره شد');
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

async function deleteDevice(deviceId) {
  if (!(await customConfirm('آیا از حذف این دستگاه مطمئن هستید؟'))) return;
  try {
    const gameNetId = await getCurrentGameNetId();
    await apiFetch(`/api/v1/devices/${deviceId}?gameNetId=${gameNetId}`, {
      method: 'DELETE',
    });
    await loadDevicesFromAPI();
    if (document.getElementById('deviceManagerModal').style.display === 'flex')
      renderDevicesGrid();
    customAlert('دستگاه حذف شد');
  } catch (err) {
    customAlert(`خطا: ${err.message}`);
  }
}

function editDevice(index) {
  openDeviceForm(index);
}

// ================== سطل آشغال (جلسات حذف شده) ==================

// ================== توابع مربوط به تخفیف ==================
// اعمال تخفیف روی مبلغ پایه (بازی + کافه - پیش‌پرداخت)
function applyDiscount(subtotal, discountPercent, discountFixed) {
  let discountAmount = 0;
  if (discountFixed && discountFixed > 0) {
    discountAmount = discountFixed;
  } else if (discountPercent && discountPercent > 0) {
    discountAmount = Math.round((subtotal * discountPercent) / 100);
  }
  // اطمینان از عدم منفی شدن نهایی
  return Math.max(0, subtotal - discountAmount);
}

// اضافه کردن لاگ تخفیف (در زمان بستن جلسه)
function addDiscountLog(
  day,
  index,
  discountAmount,
  unitLabel,
  subtotalBeforeDiscount,
  finalTotal
) {
  let session = gameNet[day]?.[index];
  if (!session) return;
  let now = new Date();
  let nowStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  let calc = calculateCost(session, nowStr);
  let message = `تخفیف ${discountAmount.toLocaleString()} ${unitLabel} (قبل از تخفیف: ${subtotalBeforeDiscount.toLocaleString()} ${unitLabel}، پس از تخفیف: ${finalTotal.toLocaleString()} ${unitLabel})`;
  addSessionLog(
    day,
    index,
    'تخفیف',
    message,
    calc.gameCost,
    session.cafeCost || 0
  );
}

// مدیریت همزمان دو فیلد تخفیف (در مودال ویرایش)
function enforceNumberOnly(inputElement) {
  inputElement.addEventListener('input', function (e) {
    this.value = this.value.replace(/[^0-9]/g, '');
    if (this.value === '') return;
    let num = parseInt(this.value, 10);
    if (num > 100) this.value = '100';
    if (num < 0) this.value = '0';
  });
}

// تابع همگام‌سازی تخفیف (درصد و مبلغ)
function setupDiscountSync() {
  const percentInput = document.getElementById('editDiscountPercent');
  const fixedInput = document.getElementById('editDiscountFixed');
  if (!percentInput || !fixedInput) return;

  // فقط عدد در درصد مجاز باشد
  enforceNumberOnly(percentInput);
  // فرمت خودکار مبلغ (ویرگول)
  if (typeof liveNumberFormat === 'function') {
    fixedInput.addEventListener('input', () => liveNumberFormat(fixedInput));
  }

  percentInput.addEventListener('input', function () {
    let val = this.value.trim();
    if (val !== '' && parseInt(val, 10) > 0) {
      fixedInput.value = '';
    }
  });

  fixedInput.addEventListener('input', function () {
    let raw = this.value.replace(/,/g, '');
    if (raw !== '' && parseInt(raw, 10) > 0) {
      percentInput.value = '';
    }
  });
}

// تابع همگام‌سازی هزینه اضافی
function setupExtraSync() {
  const percentInput = document.getElementById('editExtraPercent');
  const fixedInput = document.getElementById('editExtraFixed');
  if (!percentInput || !fixedInput) return;

  enforceNumberOnly(percentInput);
  if (typeof liveNumberFormat === 'function') {
    fixedInput.addEventListener('input', () => liveNumberFormat(fixedInput));
  }

  percentInput.addEventListener('input', function () {
    let val = this.value.trim();
    if (val !== '' && parseInt(val, 10) > 0) {
      fixedInput.value = '';
    }
  });

  fixedInput.addEventListener('input', function () {
    let raw = this.value.replace(/,/g, '');
    if (raw !== '' && parseInt(raw, 10) > 0) {
      percentInput.value = '';
    }
  });
}

function formatMoneyWithColor(amount, type = 'default') {
  if (amount === undefined || amount === null) return '-';
  let displayAmount = amount;
  let unit = currentPriceUnit === 'Rial' ? 'ریال' : 'تومان';
  if (currentPriceUnit === 'Rial') displayAmount = amount * 10;
  const formatted = displayAmount.toLocaleString() + ' ' + unit;
  let color = '';
  switch (type) {
    case 'rate':
      color = 'var(--primary)'; // آبی پررنگ برای نرخ ساعتی
      break;
    case 'positive':
      color = 'var(--success)'; // سبز برای اضافه‌شده
      break;
    case 'negative':
      color = 'var(--warning)'; // قرمز/نارنجی برای کم‌شده
      break;
    default:
      color = 'var(--text-main)';
  }
  return `<span style="color: ${color};">${formatted}</span>`;
}
function getEventIcon(eventType) {
  const icons = {
    session_start: '🎮',
    session_close: '🔒',
    mode_change: '🔄',
    table_change: '🚚',
    cafe_order: '☕',
    payment: '💰',
    edit: '✏️',
    reservation: '📅',
    reservation_start: '▶️',
    reactivate: '🔄',
  };
  return icons[eventType] || '📌';
}
function formatStructuredLog(log, currentPriceUnit) {
  const type = log.type;
  const data = log.data;
  const timestamp = new Date(log.timestamp).toLocaleTimeString('fa-IR');
  const icons = {
    session_start: '🎮',
    session_close: '🔒',
    mode_change: '🔄',
    table_change: '🚚',
    cafe_order: '☕',
    payment: '💰',
    edit: '✏️',
    reservation: '📅',
    reservation_start: '▶️',
    reactivate: '🔄',
  };
  const icon = icons[type] || '📌';

  const formatMoney = (amount) => {
    if (amount === undefined || amount === null) return '-';
    if (currentPriceUnit === 'Rial')
      return (amount * 10).toLocaleString() + ' ریال';
    return amount.toLocaleString() + ' تومان';
  };

  switch (type) {
    case 'session_start': {
      const rate =
        data.pricingRate ||
        getPricingRate(data.consoleType, data.mode, data.table);
      return `
    <div class="log-entry">  
      <div class="log-details">
        شروع بازی روی <span style="color: var(--primary); font-weight: bold;">${escapeHtml(data.table)}</span> با حالت <span style="color: var(--warning); font-weight: bold;">${escapeHtml(data.mode)}</span><br>
        کنسول: ${escapeHtml(data.consoleType)}<br>
        نرخ ساعتی: ${formatMoneyWithColor(rate, 'rate')}
      </div>
    </div>
  `;
    }
    case 'session_close': {
      // 1. نمایش بازه‌ها (مانند نمونه قدیم)
      let periodsHtml = '';
      if (data.periodsDetails && data.periodsDetails.length) {
        periodsHtml = data.periodsDetails
          .map((p, idx) => {
            const tableName = TABLE_CONFIGS[p.table]?.customName || p.table;
            return `
        <div style="margin-bottom: 4px;">
          <span class="log-detail-line">• بازه ${idx + 1}: <span class="log-highlight">${p.minutes} دقیقه</span> روی <span class="log-name">${escapeHtml(tableName)}</span> (<span class="log-console">${escapeHtml(p.consoleType)}</span> - <span class="log-mode">${escapeHtml(p.mode)}</span>) با نرخ ${formatMoney(p.rate)} در ساعت</span> 
          <span style="margin-right: 20px; color: var(--success);">هزینه ${formatMoney(p.cost)}</span>
        </div>
      `;
          })
          .join('');
      }
      let extraHtml = '';
      if (data.extraAmount && data.extraAmount !== 0) {
        let extraText = '';
        if (data.extraPercent && data.extraPercent !== 0) {
          extraText = `${data.extraPercent}% (${formatMoney(data.extraAmount)})`;
        } else if (data.extraFixed && data.extraFixed !== 0) {
          extraText = `${formatMoney(data.extraFixed)}`;
        }
        extraHtml = `<div style="margin-top: 5px;">➕ هزینه اضافی: <span style="color: var(--success); font-weight: bold;">${extraText}</span></div>`;
      }

      // 2. قانون حداقل یک ساعت
      const totalMinutes = data.totalMinutes || 0;
      const hasChanges = data.hasChanges;
      const useMinimumHour = data.useMinimumHour;
      let ruleHtml = '';

      if (totalMinutes < 60) {
        if (!hasChanges) {
          if (useMinimumHour) {
            ruleHtml = `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) و هیچ تغییری در دسته/میز رخ نداده است. با توجه به فعال بودن گزینه «حداقل یک ساعت»، هزینه یک ساعت کامل محاسبه شده است.</span>`;
          } else {
            ruleHtml = `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) اما گزینه «حداقل یک ساعت» غیرفعال است، بنابراین هزینه بر اساس دقیقه واقعی محاسبه گردیده است.</span>`;
          }
        } else {
          ruleHtml = `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) اما به دلیل تغییر دسته/میز، قانون «حداقل یک ساعت» اعمال نمی‌شود و هزینه بر اساس دقیقه واقعی محاسبه شده است.</span>`;
        }
      } else {
        ruleHtml = `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (≥ ۱ ساعت). هزینه بر اساس دقیقه واقعی محاسبه شده است.</span>`;
      }

      // 3. هزینه نهایی بازی (بدون عبارت اضافی)
      const gameCostRounded = roundFinalPrice(data.gameCost);
      const costInfo = `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): <span style="color: var(--success); font-weight: bold;">${formatMoney(gameCostRounded)}</span></span>`;
      // 4. جدول نهایی کافه (با حذف خطوط تکراری)
      let cafeTableHtml = '';
      if (data.cafeItems && data.cafeItems.length > 0) {
        let tableRows = '';
        let totalCafe = 0;
        data.cafeItems.forEach((item) => {
          const itemTotal = item.qty * item.price;
          totalCafe += itemTotal;
          tableRows += `<tr style="border-bottom:1px solid rgba(150,150,150,0.2);">
        <td style="text-align:right; padding:4px;">${escapeHtml(item.name)}</td>
        <td style="text-align:center; padding:4px;">${item.qty}</td>
        <td style="text-align:left; padding:4px;">${formatMoney(item.price)}</td>
        <td style="text-align:left; padding:4px; color:var(--success);">${formatMoney(itemTotal)}</td>
      </td>`;
        });
        cafeTableHtml = `
      <div style="margin-top: 10px;">
        <span class="log-info">☕ سفارشات کافه:</span><br>
        <table class="log-cafe-table" style="width:100%; border-collapse:collapse; margin-top:5px; font-size:0.8rem;">
          <thead><tr style="border-bottom:1px solid var(--primary);">
            <th style="text-align:right; padding:4px;">آیتم</th>
            <th style="text-align:center; padding:4px;">تعداد</th>
            <th style="text-align:left; padding:4px;">قیمت واحد</th>
            <th style="text-align:left; padding:4px;">جمع</th>
          </tr></thead>
          <tbody>${tableRows}</tbody>
          <tfoot><tr style="border-top:2px solid var(--primary);">
            <td colspan="3" style="text-align:left; font-weight:bold;">جمع کل کافه</td>
            <td style="text-align:left; font-weight:bold; color:var(--success);">${formatMoney(totalCafe)}</td>
          </tr></tfoot>
        </table>
      </div>
    `;
      }

      // 5. جمع‌بندی نهایی (فقط یک خط مبلغ نهایی بعد از جدول)
      // توجه: فوتر مودال لاگ قبلاً جمع نهایی را نشان می‌دهد، بنابراین اینجا نیازی به تکرار نیست.
      // در صورت تمایل به نمایش دوباره، می‌توانید خط زیر را فعال کنید:
      // const finalTotalHtml = `<div style="margin-top:8px;"><strong>💰 مبلغ نهایی قابل پرداخت: <span style="color:var(--success);">${formatMoney(data.finalTotal)}</span></strong></div>`;

      return `
    <div class="log-entry"> 
     <div class="log-details">
        ${periodsHtml}
        ${ruleHtml}<br>
        ${costInfo}<br>
         ${extraHtml}
        ${cafeTableHtml}
      </div>
    </div>
  `;
    }
    case 'mode_change': {
      return `
    <div class="log-entry"> 
     <div class="log-details">
        <span class="log-info">⏱️ پس از <span class="log-highlight">${data.minutesSpent} دقیقه</span> از شروع بازی روی <span class="log-name">${escapeHtml(data.table)}</span> (<span class="log-console">${escapeHtml(data.consoleType)}</span>):</span><br>
        <span class="log-change">تغییر از <span class="log-mode">${escapeHtml(data.oldMode)}</span> با نرخ ${formatMoneyWithColor(data.oldRate, 'rate')} در ساعت به <span class="log-mode">${escapeHtml(data.newMode)}</span> با نرخ ${formatMoneyWithColor(data.newRate, 'rate')} در ساعت (هزینه بازه قبل: ${formatMoneyWithColor(data.costOfPeriod, 'positive')})</span><br>
        <span class="log-info">▶️ شروع بازه جدید با حالت <span class="log-mode">${escapeHtml(data.newMode)}</span> روی همان میز با نرخ ساعتی ${formatMoneyWithColor(data.newRate, 'rate')}</span>
      </div>
    </div>
  `;
    }
    case 'table_change': {
      return `
    <div class="log-entry"> 
      <div class="log-details">
        <span class="log-info">⏱️ پس از <span class="log-highlight">${data.minutesSpent} دقیقه</span> از شروع بازی روی <span class="log-name">${escapeHtml(data.oldTable)}</span> با حالت <span class="log-mode">${escapeHtml(data.oldMode)}</span> با نرخ ساعتی ${formatMoneyWithColor(data.oldRate, 'rate')}:</span><br>
        <span class="log-change">انتقال میز از <span class="log-name">${escapeHtml(data.oldTable)}</span> به <span class="log-name">${escapeHtml(data.newTable)}</span> (هزینه بازه قبل: ${formatMoneyWithColor(data.costOfPeriod, 'positive')})</span><br>
        <span class="log-info">▶️ ادامه بازی روی میز <span class="log-name">${escapeHtml(data.newTable)}</span> با <span class="log-mode">${escapeHtml(data.newMode)}</span> با نرخ ساعتی ${formatMoneyWithColor(data.newRate, 'rate')}</span>
      </div>
    </div>
  `;
    }
    case 'cafe_order': {
      let tableHtml =
        '<table style="width:100%; border-collapse:collapse; font-size:0.8rem; direction:rtl;">';
      tableHtml +=
        '<thead><tr style="border-bottom:1px solid var(--primary);">';
      tableHtml += '<th style="text-align:right; padding:6px 4px;">آیتم</th>';
      tableHtml += '<th style="text-align:center; padding:6px 4px;">تعداد</th>';
      tableHtml +=
        '<th style="text-align:left; padding:6px 4px;">قیمت واحد</th>';
      tableHtml +=
        '<th style="text-align:left; padding:6px 4px;">تغییر هزینه</th>';
      tableHtml += '</td></thead><tbody>';
      let totalChange = 0;
      if (
        data.changes &&
        Array.isArray(data.changes) &&
        data.changes.length > 0
      ) {
        data.changes.forEach((change) => {
          const delta = change.delta;
          const changeAmount = delta * change.price;
          totalChange += changeAmount;
          const sign = delta > 0 ? '+' : '';
          const deltaColor = delta > 0 ? '#00ff66' : '#ff5555';
          const displayDelta = `${sign}${Math.abs(delta)}`;
          tableHtml += `<tr style="border-bottom:1px solid rgba(150,150,150,0.2);">`;
          tableHtml += `<td style="text-align:right; padding:6px 4px;">${escapeHtml(change.name)}</td>`;
          tableHtml += `<td style="text-align:center; padding:6px 4px;">(${change.oldQty} ← ${change.newQty})<span style="color:${deltaColor};"> ${displayDelta} </span> </td>`;
          tableHtml += `<td style="text-align:left; padding:6px 4px;">${formatMoney(change.price)}</td>`;
          tableHtml += `<td style="text-align:left; padding:6px 4px; color:${deltaColor};">${sign}${formatMoney(Math.abs(changeAmount))}</td>`;
          tableHtml += `</tr>`;
        });
      } else {
        tableHtml +=
          '<tr><td colspan="4" style="text-align:center;">تغییری ثبت نشده<td></td>';
      }
      const totalSign = totalChange >= 0 ? '+' : '-';
      const totalColor = totalChange >= 0 ? 'var(--success)' : 'var(--warning)';
      tableHtml += `</tbody><tfoot><tr style="border-top:2px solid var(--primary);">`;
      tableHtml += `<td colspan="3" style="text-align:left; font-weight:bold;">جمع کل تغییرات</td>`;
      tableHtml += `<td style="text-align:left; font-weight:bold; color: ${totalColor};">${totalSign}${formatMoney(Math.abs(totalChange))}</td>`;
      tableHtml += `</tr></tfoot></table>`;

      return `
    <div class="log-entry"> 
      <div class="log-details">
        ${tableHtml}
      </div>
    </div>
  `;
    }
    case 'payment': {
      return `
    <div class="log-entry"> 
      <div class="log-details">
        <div style="margin-bottom: 4px;">مبلغ پرداختی: <span style="color: var(--success); font-weight: bold;">${formatMoney(data.amount)}</span></div>
        <div>کل پیش‌پرداخت تاکنون: <span style="color: var(--success); font-weight: bold;">${formatMoney(data.totalPaidSoFar)}</span></div>
      </div>
    </div>
  `;
    }
    case 'edit': {
      const oldV = data.oldValues || {};
      const newV = data.newValues || {};
      const changesList = [];

      if (oldV.timeStart !== undefined) {
        changesList.push(
          `⏱️ ساعت شروع: <span style="color: var(--warning);">${escapeHtml(oldV.timeStart)}</span> <span dir="ltr">←</span> <span style="color: var(--success);">${escapeHtml(newV.timeStart)}</span>`
        );
      }
      if (oldV.timeEnd !== undefined) {
        changesList.push(
          `⏱️ ساعت پایان: <span style="color: var(--warning);">${escapeHtml(oldV.timeEnd)}</span> <span dir="ltr">←</span> <span style="color: var(--success);">${escapeHtml(newV.timeEnd)}</span>`
        );
      }
      if (oldV.mode !== undefined) {
        changesList.push(
          `🎮 حالت بازی: <span style="color: var(--warning);">${escapeHtml(oldV.mode)}</span> <span dir="ltr">←</span> <span style="color: var(--success);">${escapeHtml(newV.mode)}</span>`
        );
      }
      if (oldV.discountPercent !== undefined) {
        changesList.push(
          `🏷️ تخفیف درصدی: <span style="color: var(--warning);">${oldV.discountPercent}%</span> <span dir="ltr">←</span> <span style="color: var(--success);">${newV.discountPercent}%</span>`
        );
      }
      if (oldV.discountFixed !== undefined) {
        changesList.push(
          `🏷️ تخفیف مبلغی: <span style="color: var(--warning);">${formatMoney(oldV.discountFixed)}</span> <span dir="ltr">←</span> <span style="color: var(--success);">${formatMoney(newV.discountFixed)}</span>`
        );
      }
      if (oldV.extraPercent !== undefined) {
        changesList.push(
          `➕ هزینه اضافی درصدی: <span style="color: var(--warning);">${oldV.extraPercent}%</span> <span dir="ltr">←</span> <span style="color: var(--success);">${newV.extraPercent}%</span>`
        );
      }
      if (oldV.extraFixed !== undefined) {
        changesList.push(
          `➕ هزینه اضافی مبلغی: <span style="color: var(--warning);">${formatMoney(oldV.extraFixed)}</span> <span dir="ltr">←</span> <span style="color: var(--success);">${formatMoney(newV.extraFixed)}</span>`
        );
      }
      if (oldV.note !== undefined) {
        const oldNote =
          oldV.note.length > 50
            ? oldV.note.substring(0, 50) + '...'
            : oldV.note;
        const newNote =
          newV.note.length > 50
            ? newV.note.substring(0, 50) + '...'
            : newV.note;
        changesList.push(
          `📝 یادداشت: <span style="color: var(--warning);">"${escapeHtml(oldNote)}"</span> <span dir="ltr">←</span> <span style="color: var(--success);">"${escapeHtml(newNote)}"</span>`
        );
      }

      const changesHtml =
        changesList.length > 0
          ? `<ul style="margin: 5px 0 0 20px; padding: 0; list-style: disc;">${changesList.map((item) => `<li>${item}</li>`).join('')}</ul>`
          : '<div>تغییری ثبت نشده است.</div>';

      return `
    <div class="log-entry"> 
      <div class="log-details">
        ${changesHtml}
      </div>
    </div>
  `;
    }
    case 'reservation': {
      return `
    <div class="log-entry"> 
      <div class="log-details">
        <div style="margin-bottom: 4px;">
          میز <span style="color: var(--primary); font-weight: bold;">${escapeHtml(data.table)}</span> 
          برای ساعت <span style="color: var(--text-muted);">${data.timeStart}</span> 
          ${data.reservedDay ? `(روز ${escapeHtml(data.reservedDay)})` : ''}
          ${data.date ? ` - تاریخ ${escapeHtml(data.date)}` : ''}
        </div>
        <div>
          👤 <span style="color: var(--warning); font-weight: bold;">${escapeHtml(data.customerName)}</span>
          ${data.customerPhone ? `  📞 ${escapeHtml(data.customerPhone)}` : ''}
        </div>
      </div>
    </div>
  `;
    }
    case 'reservation_start': {
      const rate =
        data.pricingRate ||
        getPricingRate(data.consoleType, data.mode, data.table);
      return `
    <div class="log-entry"> 
     <div class="log-details">
        <div>شروع بازی روی <span style="color: var(--primary); font-weight: bold;">${escapeHtml(data.table)}</span> با حالت <span style="color: var(--warning); font-weight: bold;">${escapeHtml(data.mode)}</span> (کنسول: ${escapeHtml(data.consoleType)})</div>
        <div>نرخ ساعتی: <span style="color: var(--success); font-weight: bold;">${formatMoney(rate)}</span></div>
        <div style="margin-top: 4px; color: var(--text-muted);">زمان شروع واقعی: ${data.actualStart}</div>
      </div>
    </div>
  `;
    }
    case 'reactivate': {
      const downTime = data.downTimeMinutes || 0;
      const downText =
        downTime > 0 ? `${downTime} دقیقه بعد از پایان جلسه` : 'بلافاصله';
      return `
    <div class="log-entry"> 
    <div class="log-details">
        <div>🕒 جلسه ${downText} دوباره فعال شد.</div>
        <div>💰 هزینه بازی تا قبل از ادامه: <span style="color: var(--success); font-weight: bold;">${formatMoney(data.previousGameCost)}</span></div>
        <div>☕ هزینه کافه تا قبل از ادامه: ${formatMoney(data.previousCafeCost)}</div>
        <div style="margin-top: 5px;">▶️ ادامه روی میز <span style="color: var(--primary); font-weight: bold;">${escapeHtml(data.table)}</span> با حالت <span style="color: var(--warning); font-weight: bold;">${escapeHtml(data.mode)}</span> (کنسول: ${escapeHtml(data.consoleType)}) و نرخ ساعتی <span style="color: var(--success); font-weight: bold;">${formatMoney(data.pricingRate)}</span></div>
      </div>
    </div>
  `;
    }
    default: {
      return `
        <div class="log-entry">
          <div class="log-header"><span class="log-icon">${icon}</span> <span class="log-time">${timestamp}</span> <strong>${type}</strong></div>
          <div class="log-details"><pre>${JSON.stringify(data, null, 2)}</pre></div>
        </div>
      `;
    }
  }
}
// ////////////////////////////////////
// ////////////////////////////////////
// ////////////////////////////////////
// پایین تمام کد ها باشند
// پایین تمام کد ها باشند
// پایین تمام کد ها باشند
// ///////////////////////////////////

//  ================== اتصال رویدادهای مدیریت دستگاه‌ها ==================

// اتصال رویداد submit فرم
document.getElementById('deviceForm')?.addEventListener('submit', (e) => {
  e.preventDefault();
  saveDeviceFromForm();
});

// افزودن شنونده رویداد در سطح سند
document.addEventListener('keydown', handleEnterInModals);

document.addEventListener('change', function (e) {
  if (e.target.classList && e.target.classList.contains('mode-check')) {
    updatePriceFieldsByModes();
  }
});

document.addEventListener('DOMContentLoaded', function () {
  // بررسی وجود توکن برای لاگین خودکار
  checkAuthOnLoad();
  // اتصال دکمه افزودن دستگاه جدید (فقط یک بار و در زمان مناسب)
  const addDeviceBtn = document.getElementById('addNewDeviceBtn');
  if (addDeviceBtn) {
    addDeviceBtn.addEventListener('click', () => openDeviceForm(-1));
  }

  const themeSelect = document.getElementById('themeSelect');
  if (themeSelect) {
    themeSelect.addEventListener('change', function (e) {
      changeTheme(e.target.value);
    });
  }

  // اتصال دکمه لاگین (بدون onclick در HTML)
  const loginBtn = document.querySelector('.btn-login');
  if (loginBtn) {
    loginBtn.removeAttribute('onclick');
    loginBtn.addEventListener('click', checkLogin);
  }
  initTheme();
});
