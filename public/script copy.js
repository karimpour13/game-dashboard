let USE_MINIMUM_HOUR = true;
let USE_ROUND_DOWN_PRICE = false;

// ================== مدیریت رمز عبور پویا ==================
function getSystemPassword() {
  return localStorage.getItem("SYSTEM_PASSWORD") || "";
}

function setSystemPassword(pass) {
  if (pass === null || pass === undefined) pass = "";
  localStorage.setItem("SYSTEM_PASSWORD", pass);
}

/**
 * بررسی می‌کند که آیا عملیات با featureId نیاز به تأیید رمز دارد.
 * اگر رمز سیستم خالی باشد => همیشه true (بدون رمز)
 * در غیر این صورت اگر تنظیمات امنیتی آن ویژگی نیاز به رمز داشته باشد، رمز می‌پرسد.
 * @param {string} featureId کلید در SECURITY_SETTINGS (مثلاً 'generalSettings')
 * @returns {Promise<boolean>} true اگر مجاز باشد، false اگر رمز اشتباه یا انصراف
 */
async function requirePasswordIfNeeded(featureId) {
  const systemPass = getSystemPassword();
  if (systemPass === "") return true; // رمز سیستم فعال نیست

  if (!SECURITY_SETTINGS[featureId]) return true; // این ویژگی نیازی به رمز ندارد

  const entered = await customPrompt("رمز عبور سیستم را وارد کنید:", "text");
  if (entered === null) return false; // انصراف
  return entered === systemPass;
}

// ================== ضد دک (غیرفعال کردن inspect) ==================
document.addEventListener("keydown", function (e) {
  if (e.key === "F12") e.preventDefault();
  if (e.ctrlKey && e.shiftKey && e.key === "I") e.preventDefault();
  if (e.ctrlKey && e.shiftKey && e.key === "J") e.preventDefault();
  if ((e.ctrlKey && e.key === "u") || (e.ctrlKey && e.key === "U"))
    e.preventDefault();
  if ((e.ctrlKey && e.key === "s") || (e.ctrlKey && e.key === "S"))
    e.preventDefault();
});

let isIncomeRevealed = false;

let currentPriceUnit = "Toman"; // 'Toman' or 'Rial'
let currentGameNetName = "سامانه مدیریت گیم‌نت گیم لند";

// ================== آیکون تومان SVG ==================
const TOMAN_ICON = `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#toman"></use></svg>`;
function formatMoneyWithIcon(amount) {
  if (amount === undefined || amount === null) amount = 0;
  let displayAmount = amount;
  let icon = TOMAN_ICON;
  if (currentPriceUnit === "Rial") {
    displayAmount = amount * 10;
    icon = `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#rial"></use></svg>`;
  }
  return displayAmount.toLocaleString() + " " + icon;
}
function updateRoundDownPrice(value) {
  USE_ROUND_DOWN_PRICE = value;
  saveGeneralSettings();
  render(); // برای اعمال روی جلسات بسته شده (اگر نیاز باشد)
}

function loadGeneralSettings() {
  const savedName = localStorage.getItem("GAME_NET_NAME");
  const savedUnit = localStorage.getItem("PRICE_UNIT");
  const savedMinHour = localStorage.getItem("USE_MINIMUM_HOUR");
  const savedRoundDown = localStorage.getItem("USE_ROUND_DOWN_PRICE");
  if (savedRoundDown !== null) USE_ROUND_DOWN_PRICE = savedRoundDown === "true";
  else USE_ROUND_DOWN_PRICE = false;
  const roundDownToggle = document.getElementById("roundDownPriceToggle");
  if (roundDownToggle) roundDownToggle.checked = USE_ROUND_DOWN_PRICE;
  if (savedName) currentGameNetName = savedName;
  if (savedUnit && (savedUnit === "Toman" || savedUnit === "Rial"))
    currentPriceUnit = savedUnit;
  else currentPriceUnit = "Toman";
  if (savedMinHour !== null) USE_MINIMUM_HOUR = savedMinHour === "true";
  else USE_MINIMUM_HOUR = true;

  const nameInput = document.getElementById("gameNetNameInput");
  if (nameInput) nameInput.value = currentGameNetName;
  const unitSelect = document.getElementById("priceUnitSelect");
  if (unitSelect) unitSelect.value = currentPriceUnit;
  const minHourToggle = document.getElementById("minHourToggle");
  if (minHourToggle) minHourToggle.checked = USE_MINIMUM_HOUR;

  // بروزرسانی عنوان صفحه
  const h1 = document.querySelector("#mainContainer h1");
  if (h1) h1.innerText = currentGameNetName;

  // بازخوانی مقادیر نمایشی قیمت‌ها در مودال تعرفه
  if (typeof PRICING !== "undefined") {
    initSettings();
  }
  const pwdInput = document.getElementById("systemPasswordInput");
  if (pwdInput) pwdInput.value = getSystemPassword();
  attachSystemPasswordEvents();
}
function formatMoneyText(amount) {
  if (amount === undefined || amount === null) amount = 0;
  let displayAmount = amount;
  let unit = "تومان";
  if (currentPriceUnit === "Rial") {
    displayAmount = amount * 10;
    unit = "ریال";
  }
  return displayAmount.toLocaleString() + " " + unit;
}

function updateMinimumHour(value) {
  USE_MINIMUM_HOUR = value;
  saveGeneralSettings();
  render(); // بازرندر جدول برای بروزرسانی هزینه‌های زنده
}

function normalizeConsoleType(consoleType) {
  const mapping = {
    "PS5 Pro": "PS5",
    PS3: "PS4",
    "Xbox X": "Xbox",
    "Xbox S": "Xbox",
    "Xbox One": "Xbox",
  };
  return mapping[consoleType] || consoleType;
}

function getPricingRate(consoleType, mode, tableNum) {
  let tableConfig = TABLE_CONFIGS[tableNum];
  // اولویت اول: قیمت‌های دستی ثبت شده در دستگاه (مدیریت دستگاه‌ها)
  if (tableConfig && tableConfig.prices && tableConfig.prices[mode]) {
    return tableConfig.prices[mode];
  }
  // اگر نبود، از PRICING سراسری با نرمالایز استفاده کن (برای سازگاری)
  let normalizedConsole = normalizeConsoleType(consoleType);
  if (PRICING[normalizedConsole] && PRICING[normalizedConsole][mode]) {
    return PRICING[normalizedConsole][mode];
  }
  return 0;
}

function getRateForSession(session) {
  let tableNum = parseInt(session.table.replace("میز ", ""));
  return getPricingRate(session.consoleType, session.mode, tableNum);
}
// بررسی می‌کند که آیا حالت انتخابی (mode) برای میز مورد نظر قیمت‌گذاری شده است یا خیر
function isModeValidForTable(tableName, mode) {
  const tableNum = parseInt(tableName.replace("میز ", ""));
  const config = TABLE_CONFIGS[tableNum];
  if (!config) return false;
  // استفاده از تابع موجود getPricingRate که در صورت نبود قیمت، 0 برمی‌گرداند
  const price = getPricingRate(config.console, mode, tableNum);
  return price > 0;
}

function saveGeneralSettings() {
  localStorage.setItem("GAME_NET_NAME", currentGameNetName);
  localStorage.setItem("PRICE_UNIT", currentPriceUnit);
  localStorage.setItem("USE_MINIMUM_HOUR", USE_MINIMUM_HOUR.toString());
  localStorage.setItem("USE_ROUND_DOWN_PRICE", USE_ROUND_DOWN_PRICE.toString());
}

function updateGameNetName(value) {
  currentGameNetName = value;
  const h1 = document.querySelector("#mainContainer h1");
  if (h1) h1.innerText = currentGameNetName;
  saveGeneralSettings();
}

function updatePriceUnit(value) {
  currentPriceUnit = value;
  saveGeneralSettings();
  initSettings();
  updateCafePricePlaceholder(); // به‌روزرسانی placeholder فیلد قیمت
  render();
}

function formatNumberWithCommas(x) {
  if (x === null || x === undefined || isNaN(x)) return "";
  return x.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}
function parseNumberFromFormatted(str) {
  if (!str) return 0;
  return parseInt(str.replace(/,/g, ""), 10) || 0;
}
function liveNumberFormat(inputElement) {
  let cursorPos = inputElement.selectionStart;
  let oldValue = inputElement.value;
  let raw = oldValue.replace(/,/g, "");
  if (raw === "") raw = "0";
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
  element.type = "text";
  element.inputMode = "numeric";
  element.addEventListener("input", () => liveNumberFormat(element));
  let initialRaw = parseNumberFromFormatted(element.value);
  if (!isNaN(initialRaw) && initialRaw !== 0)
    element.value = formatNumberWithCommas(initialRaw);
  else if (element.value === "" || element.value === "0") element.value = "";
}

function roundFinalPrice(amount) {
  if (USE_ROUND_DOWN_PRICE) {
    // گرد به پایین به مضرب ۵۰۰۰
    return Math.floor(amount / 5000) * 5000;
  } else {
    // گرد به پایین به هزار تومان (رفتار قبلی)
    return Math.floor(amount / 1000) * 1000;
  }
}

function getValidModesForTable(tableName) {
  const tableNum = parseInt(tableName.replace("میز ", ""));
  const config = TABLE_CONFIGS[tableNum];
  if (!config) return ["معمولی"];

  let modes = config.modes || [];
  if (modes.length === 0) {
    const pricingType =
      config.pricingType || getDefaultPricingType(config.console);
    if (pricingType === "hourly_handles") {
      modes = ["1 دسته", "2 دسته", "3 دسته", "4 دسته", "معمولی", "VIP"];
    } else if (pricingType === "hourly_per_person") {
      modes = ["یک نفر", "دو نفر", "سه نفر", "چهار نفر و بیشتر"];
    } else {
      modes = ["معمولی"];
    }
  }
  return modes;
}

// ================== مودال سفارشی ==================
function showCustomModal(title, message, isConfirm = false, inputType = null) {
  return new Promise((resolve) => {
    const modal = document.getElementById("customModal");
    const titleEl = document.getElementById("customModalTitle");
    const bodyEl = document.getElementById("customModalBody");
    const confirmBtn = document.getElementById("customModalConfirmBtn");
    const cancelBtn = document.getElementById("customModalCancelBtn");

    titleEl.innerText = title;
    bodyEl.innerHTML = "";

    if (inputType === "text" || inputType === "number") {
      // نمایش پیام توضیحی
      const msgDiv = document.createElement("div");
      msgDiv.style.marginBottom = "15px";
      msgDiv.style.fontSize = "0.9rem";
      msgDiv.style.color = "var(--text-muted)";
      msgDiv.style.textAlign = "right";
      msgDiv.innerText = message;
      bodyEl.appendChild(msgDiv);

      const input = document.createElement("input");
      if (inputType === "number") {
        input.type = "text";
        input.inputMode = "numeric";
        input.placeholder = "مبلغ را وارد کنید";
        attachLiveFormatting(input);
      } else {
        input.type = "text";
        input.placeholder = "...";
      }
      input.style.width = "100%";
      input.style.padding = "8px";
      input.style.borderRadius = "8px";
      input.style.border = "1px solid #ccc";
      input.style.background = "var(--input-bg)";
      input.style.color = "var(--text-main)";
      bodyEl.appendChild(input);

      const confirmHandler = () => {
        cleanup();
        let val = input.value;
        if (inputType === "number") val = parseNumberFromFormatted(val);
        resolve(val);
      };
      const cancelHandler = () => {
        cleanup();
        resolve(null);
      };
      const cleanup = () => {
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
        modal.style.display = "none";
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.onclick = cancelHandler;
      cancelBtn.style.display = "inline-block";
    } else if (isConfirm) {
      const msgDiv = document.createElement("div");
      msgDiv.style.marginBottom = "15px";
      msgDiv.style.fontSize = "0.9rem";
      msgDiv.style.color = "var(--text-main)";
      msgDiv.style.textAlign = "right";
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
        confirmBtn.removeEventListener("click", confirmHandler);
        cancelBtn.removeEventListener("click", cancelHandler);
        modal.style.display = "none";
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.onclick = cancelHandler;
      cancelBtn.style.display = "inline-block";
    } else {
      const msgDiv = document.createElement("div");
      msgDiv.style.marginBottom = "15px";
      msgDiv.style.fontSize = "0.9rem";
      msgDiv.style.color = "var(--text-main)";
      msgDiv.style.textAlign = "right";
      msgDiv.innerText = message;
      bodyEl.appendChild(msgDiv);

      const confirmHandler = () => {
        cleanup();
        resolve();
      };
      const cleanup = () => {
        confirmBtn.removeEventListener("click", confirmHandler);
        modal.style.display = "none";
      };
      confirmBtn.onclick = confirmHandler;
      cancelBtn.style.display = "none";
    }

    modal.style.display = "flex";
  });
}
async function customAlert(msg) {
  await showCustomModal("پیام", msg, false);
}
async function customConfirm(msg) {
  return await showCustomModal("تأیید", msg, true);
}
async function customPrompt(msg, type = "text") {
  return await showCustomModal("ورودی", msg, true, type);
}

// ================== لاگین ==================
async function checkLogin() {
  const username = document.getElementById("loginUsername").value;
  const password = document.getElementById("loginPassword").value;

  try {
    const response = await fetch("/api/v1/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "خطا در ورود");

    // ذخیره توکن‌ها و اطلاعات کاربر
    localStorage.setItem("accessToken", data.accessToken);
    localStorage.setItem("refreshToken", data.refreshToken);
    localStorage.setItem("user", JSON.stringify(data.user));

    // مخفی کردن صفحه لاگین و نمایش اپ
    document.getElementById("loginScreen").style.display = "none";
    document.getElementById("appScreen").style.display = "block";
    initSystem(); // تابع فعلی که از localStorage بار می‌کند
  } catch (err) {
    customAlert("❌ نام کاربری یا رمز عبور اشتباه است!");
  }
}
async function logout() {
  const confirmed = await customConfirm("آیا از خروج مطمئن هستید؟");
  if (!confirmed) return;

  const token = localStorage.getItem("accessToken");
  if (token) {
    try {
      await fetch("/api/v1/auth/logout", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
    } catch (err) {}
  }

  localStorage.removeItem("accessToken");
  localStorage.removeItem("refreshToken");
  localStorage.removeItem("user");

  document.getElementById("loginUsername").value = "";
  document.getElementById("loginPassword").value = "";
  document.getElementById("loginScreen").style.display = "flex";
  document.getElementById("appScreen").style.display = "none";
}
async function checkAuthOnLoad() {
  const token = localStorage.getItem("accessToken");
  if (!token) return; // توکن نیست، در صفحه لاگین بمان

  try {
    const res = await fetch("/api/v1/auth/me", {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const data = await res.json();
      localStorage.setItem("user", JSON.stringify(data.user));
      // مخفی کردن لاگین و نمایش اپ
      document.getElementById("loginScreen").style.display = "none";
      document.getElementById("appScreen").style.display = "block";
      initSystem(); // بعداً اصلاح می‌شود تا از API داده بگیرد
    } else {
      // توکن نامعتبر است
      localStorage.removeItem("accessToken");
      localStorage.removeItem("refreshToken");
      localStorage.removeItem("user");
    }
  } catch (err) {
    console.error("Auth check failed", err);
  }
}

document.getElementById("loginPassword").addEventListener("keypress", (e) => {
  if (e.key === "Enter") checkLogin();
});

const DAYS = [
  "یکشنبه",
  "دوشنبه",
  "سه‌شنبه",
  "چهارشنبه",
  "پنجشنبه",
  "جمعه",
  "شنبه",
];
let TOTAL_TABLES = 10;
let PRICING = {
  PS4: { "1 دسته": 50000, "2 دسته": 60000, "3 دسته": 80000, "4 دسته": 100000 },
  PS5: { "1 دسته": 70000, "2 دسته": 80000, "3 دسته": 100000, "4 دسته": 120000 },
  Xbox: { "1 دسته": 60000, "2 دسته": 70000, "3 دسته": 90000, "4 دسته": 110000 },
  PC: { معمولی: 80000, VIP: 100000 },
  VIP: {
    "1 دسته": 100000,
    "2 دسته": 120000,
    "3 دسته": 150000,
    "4 دسته": 180000,
  },
  VIP_PS4: {
    "1 دسته": 60000,
    "2 دسته": 70000,
    "3 دسته": 90000,
    "4 دسته": 110000,
  },
  VIP_PS5: {
    "1 دسته": 80000,
    "2 دسته": 90000,
    "3 دسته": 110000,
    "4 دسته": 130000,
  },
  VIP_Xbox: {
    "1 دسته": 70000,
    "2 دسته": 80000,
    "3 دسته": 100000,
    "4 دسته": 120000,
  },
};
let TABLE_CONFIGS = {};
for (let i = 1; i <= TOTAL_TABLES; i++)
  TABLE_CONFIGS[i] = { console: "PS4", isVip: false, customName: `میز ${i}` };
let cafeMenu = [
  { id: 1, name: "اسپرسو", price: 50000, stock: 50 },
  { id: 2, name: "آب معدنی", price: 15000, stock: 100 },
  { id: 3, name: "چای", price: 30000, stock: 200 },
];
let gameNet = {};
DAYS.forEach((day) => (gameNet[day] = []));
let activeModalSessionIndex = -1;
let editingIndex = -1;
let currentDateString = "";
let timerInterval = null;
const daySelect = document.getElementById("daySelect");
const tableSelect = document.getElementById("tableSelect");
const timeStart = document.getElementById("timeStart");
const sessionsBody = document.getElementById("sessionsBody");

// ================== توابع کمکی لاگ جدید (با ذخیره هزینه‌ها) ==================
function addSessionLog(
  day,
  index,
  eventType,
  message,
  gameCost = null,
  cafeCost = null,
) {
  let session = gameNet[day]?.[index];
  if (!session) return;
  if (!session.logs) session.logs = [];
  let timestamp = new Date().toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  if (gameCost === null || cafeCost === null) {
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    let calc = calculateCost(session, nowStr);
    gameCost = calc.gameCost;
    cafeCost = session.cafeCost || 0;
  }
  session.logs.push({ timestamp, eventType, message, gameCost, cafeCost });
  saveSettingsToStorage();
}

function logCalculationDetails(
  day,
  index,
  session,
  endStr,
  calcResult,
  actionType,
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
      parseInt(p.start.split(":")[0]) * 60 + parseInt(p.start.split(":")[1]);
    let endMin =
      parseInt(p.end.split(":")[0]) * 60 + parseInt(p.end.split(":")[1]);
    if (endMin < startMin) endMin += 24 * 60;
    let minutes = endMin - startMin;
    if (minutes > 0) {
      totalMinutes += minutes;
      let tableNum = parseInt(p.table.replace("میز ", ""));
      let { rate, cost } = getPeriodCost(
        p.start,
        p.end,
        p.mode,
        p.consoleType,
        tableNum,
      );
      let flooredCost = Math.floor(cost);
      let tableName = TABLE_CONFIGS[tableNum]?.customName || p.table;
      periodsDetails.push(
        `<span class="log-detail-line">• بازه ${idx + 1}: <span class="log-highlight">${minutes} دقیقه</span> روی <span class="log-name">${tableName}</span> (<span class="log-console">${p.consoleType}</span> - <span class="log-mode">${p.mode}</span>) با نرخ ${formatMoneyWithIcon(rate)} در ساعت → هزینه ${formatMoneyWithIcon(flooredCost)}</span>`,
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
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) → اعمال حداقل یک ساعت.</span>`,
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} (معادل ${effectiveMinutes} دقیقه با میانگین وزنی)</span>`,
    );
  } else if (useMinHour && totalMinutes < 60) {
    msgLines.push(
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) ← محاسبه بر اساس دقیقه واقعی (قانون حداقل یک ساعت اعمال نمی شود).</span>`,
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} </span>`,
    );
  } else if (!useMinHour && totalMinutes < 60) {
    msgLines.push(
      `<span class="log-info">⏱️ مجموع زمان بازی ${totalMinutes} دقیقه (کمتر از ۱ ساعت) → محاسبه بر اساس دقیقه واقعی (قانون حداقل یک ساعت غیرفعال است).</span>`,
    );
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)} (معادل ${totalMinutes} دقیقه با میانگین وزنی)</span>`,
    );
  } else {
    msgLines.push(
      `<span class="log-info">💰 هزینه نهایی بازی (گرد شده): ${formatMoneyWithIcon(roundedGameCost)}</span>`,
    );
  }

  if (session.cafeItems && session.cafeItems.length > 0) {
    msgLines.push(
      `<span class="log-separator">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>`,
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
      `<span class="log-separator">- - - - - - - - - - - - - - - - - - - - - - - - - - - - - -</span>`,
    );
    msgLines.push(
      `<span class="log-info">☕ هزینه کافه: ${formatMoneyWithIcon(session.cafeCost)}</span>`,
    );
  }
  const msg = msgLines.join("<br>");

  addSessionLog(
    day,
    index,
    "بستن جلسه",
    msg,
    calcResult.gameCost,
    session.cafeCost || 0,
  );
}

function getPeriodCost(startStr, endStr, mode, consoleType, tableNum) {
  let startMin =
    parseInt(startStr.split(":")[0]) * 60 + parseInt(startStr.split(":")[1]);
  let endMin =
    parseInt(endStr.split(":")[0]) * 60 + parseInt(endStr.split(":")[1]);
  if (endMin < startMin) endMin += 24 * 60;
  let minutes = endMin - startMin;
  if (minutes <= 0) return { minutes, rate: 0, cost: 0 };

  let rate = getPricingRate(consoleType, mode, tableNum);
  let cost = Math.floor((minutes / 60) * rate); // ← تغییر: round → floor
  return { minutes, rate, cost };
}

function formatPeriodDetails(
  period,
  index,
  totalMinutes,
  weightedAvgRate,
  effectiveMinutes,
) {
  const start = period.start;
  const end = period.end;
  const mode = period.mode;
  const consoleType = period.consoleType;
  const tableNum = parseInt(period.table.replace("میز ", ""));
  const tableName = TABLE_CONFIGS[tableNum]?.customName || period.table;

  const { minutes, rate, cost } = getPeriodCost(
    start,
    end,
    mode,
    consoleType,
    tableNum,
  );
  if (minutes === 0) return "";

  let line = `بازه ${index}: ${minutes} دقیقه روی ${tableName} (${consoleType} - ${mode}) با نرخ ${rate.toLocaleString()} تومان/ساعت → هزینه ${cost.toLocaleString()} تومان`;
  return line;
}
function calculateCost(session, endStr, options = {}) {
  const forceSingleMode = options.forceSingleMode === true;
  const useMinimumHour =
    options.useMinimumHour !== undefined
      ? options.useMinimumHour
      : USE_MINIMUM_HOUR;

  function getRatePerHour(consoleType, mode, tableNum) {
    return getPricingRate(consoleType, mode, tableNum);
  }

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
      parseInt(p.start.split(":")[0]) * 60 + parseInt(p.start.split(":")[1]);
    let endMin =
      parseInt(p.end.split(":")[0]) * 60 + parseInt(p.end.split(":")[1]);
    if (endMin < startMin) endMin += 24 * 60;
    let minutes = endMin - startMin;
    if (minutes < 0) minutes = 0;
    totalMinutes += minutes;
    let tableNum = parseInt(p.table.replace("میز ", ""));
    let rate = getRatePerHour(p.consoleType, p.mode, tableNum);
    totalWeightedRate += minutes * rate;
  }

  if (totalMinutes === 0) {
    return {
      durationStr: "0.00",
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
  let weightedAvgRate = totalWeightedRate / totalMinutes;
  let effectiveMinutes = totalMinutes;

  // قانون حداقل یک ساعت فقط زمانی اعمال شود که:
  // 1. گزینه حداقل یک ساعت فعال باشد
  // 2. هیچ تغییری در طول جلسه رخ نداده باشد
  // 3. مجموع زمان کمتر از 60 دقیقه باشد
  if (useMinimumHour && !hasChanges && totalMinutes < 60) {
    effectiveMinutes = 60;
  }

  let gameCost = Math.round((effectiveMinutes / 60) * weightedAvgRate);
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
  { id: "exportExcel", label: "📊 خروجی اکسل", default: true },
  { id: "clearDay", label: "🗑️ پاکسازی کل روز", default: true },
  { id: "trashModal", label: "🗑️ مشاهده سطل آشغال", default: true },
  { id: "revealIncome", label: "💰 نمایش درآمد", default: true },
  {
    id: "deleteSession",
    label: "❌ حذف رکورد (انتقال به سطل آشغال)",
    default: true,
  },
  { id: "manageCafe", label: "☕ مدیریت کافه", default: true },
  { id: "manageDevices", label: "🖥️ مدیریت دستگاه‌ها", default: true },
  { id: "generalSettings", label: "⚙️ تنظیمات عمومی", default: true },
];
let SECURITY_SETTINGS = {};

function loadSecuritySettings() {
  const saved = localStorage.getItem("SECURITY_SETTINGS");
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
  saveSecuritySettings(); // ذخیره مجدد برای یکسان‌سازی
}

function saveSecuritySettings() {
  localStorage.setItem("SECURITY_SETTINGS", JSON.stringify(SECURITY_SETTINGS));
}

function renderSecurityToggles() {
  const container = document.getElementById("securityTogglesContainer");
  if (!container) return;
  container.innerHTML = "";
  SECURITY_FEATURES.forEach((feature) => {
    const isChecked =
      SECURITY_SETTINGS[feature.id] !== undefined
        ? SECURITY_SETTINGS[feature.id]
        : feature.default;
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.alignItems = "center";
    row.style.padding = "8px 0";
    row.style.borderBottom = "1px solid rgba(150,150,150,0.1)";

    const label = document.createElement("span");
    label.style.fontSize = "0.85rem";
    label.innerText = feature.label;

    const toggleWrap = document.createElement("label");
    toggleWrap.style.display = "flex";
    toggleWrap.style.alignItems = "center";
    toggleWrap.style.gap = "8px";
    toggleWrap.style.cursor = "pointer";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = isChecked;
    checkbox.style.width = "18px";
    checkbox.style.height = "18px";
    checkbox.style.accentColor = "var(--primary)";
    checkbox.style.cursor = "pointer";

    const toggleText = document.createElement("span");
    toggleText.style.fontSize = "0.8rem";
    toggleText.innerText = isChecked ? "نیاز به رمز" : "بدون رمز";
    toggleText.style.color = isChecked ? "var(--success)" : "var(--text-muted)";

    checkbox.addEventListener("change", (e) => {
      SECURITY_SETTINGS[feature.id] = e.target.checked;
      saveSecuritySettings();
      toggleText.innerText = e.target.checked ? "نیاز به رمز" : "بدون رمز";
      toggleText.style.color = e.target.checked
        ? "var(--success)"
        : "var(--text-muted)";
    });

    toggleWrap.appendChild(checkbox);
    toggleWrap.appendChild(toggleText);
    row.appendChild(label);
    row.appendChild(toggleWrap);
    container.appendChild(row);
  });
}

// ================== تابع کمکی برای تاریخ شمسی روز هفته جاری ==================
function getPersianDateForDay(dayName) {
  const weekDays = [
    "شنبه",
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
  ];
  const today = new Date();

  // دریافت نام روز جاری به فارسی (مثلاً "پنجشنبه")
  const todayPersian = today.toLocaleDateString("fa-IR", { weekday: "long" });

  // پیدا کردن ایندکس امروز و روز هدف در آرایه weekDays
  const todayIndex = weekDays.indexOf(todayPersian);
  const targetIndex = weekDays.indexOf(dayName);

  if (todayIndex === -1 || targetIndex === -1) return "";

  let diff = targetIndex - todayIndex;
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + diff);

  return targetDate
    .toLocaleDateString("fa-IR", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
    .replace(/\//g, "/");
}
// ================== توابع اصلی سیستم ==================
function loadSettings() {
  loadDeletedSessions();
  const savedDevices = localStorage.getItem("GAMENET_DEVICES");
  if (savedDevices) {
    DEVICES = JSON.parse(savedDevices);
    rebuildTablesAndPricing();
  } else {
    loadDevices(); // این تابع DEVICES را مقداردهی و rebuild می‌کند
  }

  const savedCafe = localStorage.getItem("CAFE_MENU");
  const savedGameNet = localStorage.getItem("GAME_NET_DATA");
  if (savedCafe) cafeMenu = JSON.parse(savedCafe);
  if (savedGameNet) {
    gameNet = JSON.parse(savedGameNet);
    for (let day in gameNet) {
      if (Array.isArray(gameNet[day])) {
        for (let session of gameNet[day]) {
          if (!session.logs) session.logs = [];
          if (session.note === undefined) session.note = "";
          // اضافه کردن فیلد date برای جلسات قدیمی
          if (!session.date) {
            session.date = getPersianDateForDay(day);
          }
        }
      }
    }
  } else {
    DAYS.forEach((day) => (gameNet[day] = []));
  }
}
function saveSettingsToStorage() {
  localStorage.setItem("TABLE_CONFIGS", JSON.stringify(TABLE_CONFIGS));
  localStorage.setItem("PRICING", JSON.stringify(PRICING));
  localStorage.setItem("TOTAL_TABLES", TOTAL_TABLES.toString());
  localStorage.setItem("CAFE_MENU", JSON.stringify(cafeMenu));
  localStorage.setItem("GAME_NET_DATA", JSON.stringify(gameNet));
  saveDeletedSessions();
}
async function openSettingsModal(modalId) {
  // بررسی رمز برای مودال‌های محافظت شده
  let featureId = null;
  if (modalId === "generalSettingsModal") featureId = "generalSettings";
  else if (modalId === "manageCafeModal") featureId = "manageCafe";

  if (featureId) {
    const authorized = await requirePasswordIfNeeded(featureId);
    if (!authorized) return;
  }

  document.getElementById(modalId).style.display = "flex";
  if (modalId === "generalSettingsModal") {
    renderSecurityToggles();
    // مقداردهی فیلد رمز
    const pwdInput = document.getElementById("systemPasswordInput");
    if (pwdInput) pwdInput.value = getSystemPassword();
    attachSystemPasswordEvents();
  }
  if (modalId === "manageCafeModal") {
    updateCafePricePlaceholder();
    renderCafeMenus();
  }
}

function closeSettingsModal(modalId) {
  document.getElementById(modalId).style.display = "none";
}
// ================== مدیریت تم رنگی ==================
function changeTheme(themeName) {
  const validThemes = [
    "dark",
    "light",
    "cyberpunk",
    "midnight",
    "ocean",
    "golden",
    "lilac",
    "pale-pink",
    "pearl-white",
    "pastel-teal",
    "deep-sea",
    "pistachio",
    "light-coral",
    "deep-coral",
    "high-contrast",
  ];
  if (!validThemes.includes(themeName)) themeName = "dark";
  document.body.setAttribute("data-theme", themeName);
  localStorage.setItem("APP_THEME", themeName);
  const themeSelect = document.getElementById("themeSelect");
  updateTimePickerColorScheme();
  if (themeSelect) themeSelect.value = themeName;
}

function initTheme() {
  const savedTheme = localStorage.getItem("APP_THEME");
  const validThemes = [
    "dark",
    "light",
    "cyberpunk",
    "midnight",
    "ocean",
    "golden",
    "lilac",
    "pale-pink",
    "pearl-white",
    "pastel-teal",
    "deep-sea",
    "pistachio",
    "light-coral",
    "deep-coral",
    "high-contrast",
  ];
  if (savedTheme && validThemes.includes(savedTheme)) {
    changeTheme(savedTheme);
  } else {
    changeTheme("dark");
  }
}
function getConsoleColorClass(consoleType) {
  if (consoleType === "PS5") return "console-ps5";
  if (consoleType === "PS4") return "console-ps4";
  if (consoleType === "Xbox") return "console-xbox";
  if (consoleType === "PC") return "console-pc";
  return "";
}

// // به‌روزرسانی گزینه‌های معتبر حالت بازی بر اساس میز انتخاب شده
function updateModeSelectOptions() {
  const table = tableSelect.value;
  const tableNum = parseInt(table.replace("میز ", ""));
  const config = TABLE_CONFIGS[tableNum];
  const modeSelect = document.getElementById("modeSelect");
  if (!config || !modeSelect) return;

  const pricingType =
    config.pricingType || getDefaultPricingType(config.console);
  let validModes = [];

  // تعیین لیست گزینه‌ها براساس نوع قیمت‌گذاری
  if (pricingType === "hourly_handles") {
    validModes = ["1 دسته", "2 دسته", "3 دسته", "4 دسته", "معمولی", "VIP"];
  } else if (pricingType === "hourly_per_person") {
    validModes = ["یک نفر", "دو نفر", "سه نفر", "چهار نفر و بیشتر"];
  } else {
    // hourly_fixed
    validModes = ["معمولی"];
  }

  // همچنین اگر در تنظیمات دستگاه modes ذخیره شده باشد، اولویت با آن است
  if (config.modes && Array.isArray(config.modes) && config.modes.length > 0) {
    validModes = config.modes;
  }

  const currentValue = modeSelect.value;

  // بازسازی گزینه‌ها
  modeSelect.innerHTML = "";
  validModes.forEach((mode) => {
    const option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;
    modeSelect.appendChild(option);
  });

  // انتخاب مقدار پیش‌فرض معتبر
  if (validModes.includes(currentValue)) {
    modeSelect.value = currentValue;
  } else if (validModes.length > 0) {
    modeSelect.value = validModes[0];
  }

  // حذف حاشیه قرمز
  modeSelect.style.border = "";
}

// ================== بهبود فیلد زمان ==================
function initTimePickerBehavior() {
  // انتخاب همه فیلدهای زمان در کل صفحه
  const allTimeInputs = document.querySelectorAll('input[type="time"]');
  allTimeInputs.forEach((input) => {
    // جلوگیری از افزودن چندباره listener
    input.removeEventListener("click", handleTimeInputClick);
    input.addEventListener("click", handleTimeInputClick);
  });
}

function handleTimeInputClick(e) {
  // جلوگیری از اجرای دوباره اگر قبلاً پیکر باز است (اختیاری)
  e.stopPropagation();
  const input = e.currentTarget;
  if (typeof input.showPicker === "function") {
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
  const theme = document.body.getAttribute("data-theme") || "dark";
  const lightThemes = ["light", "pearl-white", "pastel-teal", "pale-pink"];
  const isLight = lightThemes.includes(theme);
  const colorScheme = isLight ? "light" : "dark";

  allTimeInputs.forEach((input) => {
    input.style.colorScheme = colorScheme;
  });
}

function initSystem() {
  loadSettings();
  initTheme();
  // ساخت گزینه‌های روز به همراه تاریخ شمسی
  daySelect.innerHTML = "";
  const weekDays = [
    "شنبه",
    "یکشنبه",
    "دوشنبه",
    "سه‌شنبه",
    "چهارشنبه",
    "پنجشنبه",
    "جمعه",
  ];
  weekDays.forEach((day) => {
    const persianDate = getPersianDateForDay(day);
    const optionText = `${day}${"&nbsp;".repeat(10)}(${persianDate})`;
    const option = new Option(optionText, day);
    option.innerHTML = optionText; // برای رندر HTML
    daySelect.appendChild(option);
  });

  generateTableSelect();
  updateModeSelectOptions();
  const today = new Date();
  const todayPersian = today.toLocaleDateString("fa-IR", { weekday: "long" });
  daySelect.value = todayPersian;
  const persianDate = getPersianDateForDay(todayPersian);
  currentDateString = `📅 ${persianDate}`;
  timeStart.value = `${today.getHours().toString().padStart(2, "0")}:${today.getMinutes().toString().padStart(2, "0")}`;

  render();
  if (timerInterval) clearInterval(timerInterval);
  loadGeneralSettings();
  loadSecuritySettings();
  updateCafePricePlaceholder();
  initTimePickerBehavior();
  updateTimePickerColorScheme();
  attachGeneralSettingsEvents();

  daySelect.onchange = () => {
    currentDateString = `📅 ${getPersianDateForDay(daySelect.value)}`;
    render();
  };

  if (tableSelect) {
    tableSelect.removeEventListener("change", updateModeSelectOptions);
    tableSelect.addEventListener("change", updateModeSelectOptions);
  }

  startLiveTimer();
}

function attachGeneralSettingsEvents() {
  const nameInput = document.getElementById("gameNetNameInput");
  if (nameInput) {
    nameInput.removeEventListener("input", handleNameInput);
    nameInput.addEventListener("input", handleNameInput);
  }
  const unitSelect = document.getElementById("priceUnitSelect");
  if (unitSelect) {
    unitSelect.removeEventListener("change", handleUnitChange);
    unitSelect.addEventListener("change", handleUnitChange);
  }
}
function attachSystemPasswordEvents() {
  const pwdInput = document.getElementById("systemPasswordInput");
  const toggleBtn = document.getElementById("toggleSystemPassword");
  if (!pwdInput) return;

  // ذخیره خودکار هنگام تغییر
  const savePassword = () => {
    setSystemPassword(pwdInput.value);
  };
  pwdInput.removeEventListener("input", savePassword);
  pwdInput.addEventListener("input", savePassword);

  if (toggleBtn) {
    const newToggle = toggleBtn.cloneNode(true);
    toggleBtn.parentNode.replaceChild(newToggle, toggleBtn);
    newToggle.addEventListener("click", () => {
      const type =
        pwdInput.getAttribute("type") === "password" ? "text" : "password";
      pwdInput.setAttribute("type", type);
      newToggle.textContent = type === "password" ? "👁️ نمایش" : "🙈 مخفی";
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
  const currentDay = daySelect.value;
  const sessions = gameNet[currentDay] || [];
  const activeTables = sessions
    .filter((s) => s.status === "active")
    .map((s) => s.table);
  const reservedTables = sessions
    .filter((s) => s.status === "reserved")
    .map((s) => s.table);
  const selectedValue = tableSelect.value;

  tableSelect.innerHTML = "";
  for (let i = 0; i < DEVICES.length; i++) {
    const dev = DEVICES[i];
    const tableName = "میز " + (i + 1);
    let displayName = dev.name;

    // برچسب‌های ویژه با متن ساده
    let badges = "";
    if (dev.vip) badges += "[VIP👑] ";
    if (dev.royal) badges += "[Royal💎] ";
    if (dev.legendary) badges += "[Legendary🌟] ";
    const consoleLabel = `(${dev.console})`;

    let baseLabel = `${displayName} ${consoleLabel} ${badges}`;

    let statusSuffix = "";
    // ۱۶ فاصله بدون شکست برای چسباندن وضعیت به سمت راست
    const spaces =
      "\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0\u00A0";
    if (activeTables.includes(tableName)) {
      statusSuffix = spaces + "🔴 فعال";
    } else if (reservedTables.includes(tableName)) {
      statusSuffix = spaces + "🟡 رزرو";
    }

    const option = new Option(baseLabel + statusSuffix, tableName);
    tableSelect.appendChild(option);
  }

  if (
    selectedValue &&
    [...tableSelect.options].some((opt) => opt.value === selectedValue)
  ) {
    tableSelect.value = selectedValue;
  }
}

function updateTableCount() {
  let val = parseInt(document.getElementById("tableCountInput").value);
  if (val > 0) {
    TOTAL_TABLES = val;
    for (let i = 1; i <= TOTAL_TABLES; i++)
      if (!TABLE_CONFIGS[i])
        TABLE_CONFIGS[i] = {
          console: "PS4",
          isVip: false,
          customName: `میز ${i}`,
        };
    generateTableSelect();
    renderTableSettings();
    saveSettingsToStorage();
  }
}
function initSettings() {}
function updateGamePrices() {}
function renderTableSettings() {}
function saveTableSettings() {}
function renderCafeMenus() {
  const list = document.getElementById("cafeSettingsList");
  if (!list) return;
  const itemCount = cafeMenu.length;
  let columns = 2;
  if (itemCount >= 5 && itemCount <= 8) columns = 3;
  else if (itemCount >= 9) columns = 4;
  const modalContent = document.querySelector(
    "#manageCafeModal .modal-content",
  );
  if (modalContent) {
    let newWidth = columns * 220 + 50;
    newWidth = Math.min(newWidth, window.innerWidth * 0.95);
    modalContent.style.width = `${newWidth}px`;
  }
  list.className = "cafe-settings-list";
  list.style.gridTemplateColumns = `repeat(${columns}, minmax(200px, 1fr))`;
  list.style.gap = "15px";
  list.innerHTML = "";
  cafeMenu.forEach((item, index) => {
    const card = document.createElement("div");
    card.className = "table-setting-card";
    card.style.minWidth = "200px";
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
  let [h, m] = timeStr.split(":").map(Number);
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
  let [hour, minute] = timeStr.split(":").map(Number);
  let targetDate = new Date();
  targetDate.setHours(hour, minute, 0, 0);
  let dayDiff = targetDayIndex - currentDayIndex;
  if (dayDiff < 0) dayDiff += 7;
  targetDate.setDate(now.getDate() + dayDiff);
  if (dayDiff === 0 && targetDate < now) targetDate.setDate(now.getDate() + 7);
  return targetDate.getTime();
}
function parseTime(timeStr) {
  let [h, m] = timeStr.split(":").map(Number);
  return h * 60 + m;
}
function isTableActive(day, table) {
  return gameNet[day].some((s) => s.table === table && s.status === "active");
}
function sortTableByTime() {
  let day = daySelect.value;
  if (!gameNet[day]) return;
  gameNet[day].sort((a, b) => {
    let w = { active: 1, reserved: 2, closed: 3 };
    if (w[a.status] !== w[b.status]) return w[a.status] - w[b.status];
    return getStartTimeMs(b.timeStart) - getStartTimeMs(a.timeStart);
  });
  saveSettingsToStorage();
  render();
}
async function addPayment(index) {
  let day = daySelect.value;
  let s = gameNet[day][index];

  const isRial = currentPriceUnit === "Rial";
  const unitLabel = isRial ? "ریال" : "تومان";

  while (true) {
    const amount = await customPrompt(
      `لطفا مبلغ بیعانه/پرداختی وسط بازی (${unitLabel}) را وارد کنید:`,
      "number",
    );

    if (amount === null) return; // انصراف کاربر

    if (isNaN(amount) || amount <= 0) {
      await customAlert("لطفاً یک عدد معتبر و بزرگتر از صفر وارد کنید.");
      continue;
    }

    if (isRial && amount % 10 !== 0) {
      await customAlert(
        "⚠️ در حالت ریال، مبلغ باید مضربی از ۱۰ باشد (چون هر ۱۰ ریال = ۱ تومان). لطفاً مجدداً وارد کنید.",
      );
      continue;
    }

    let amountInToman = isRial ? amount / 10 : amount;
    s.paidAmount = (s.paidAmount || 0) + amountInToman;

    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    let calc = calculateCost(s, nowStr);

    // نمایش لاگ فقط با واحد انتخابی کاربر
    addSessionLog(
      day,
      index,
      "پرداخت",
      `پرداخت مبلغ ${amount.toLocaleString()} ${unitLabel}`,
      calc.gameCost,
      s.cafeCost || 0,
    );

    saveSettingsToStorage();
    render();
    return;
  }
}
function populateReserveModalTables() {
  const reserveTableSelect = document.getElementById("reserveModalTableSelect");
  if (!reserveTableSelect) return;
  reserveTableSelect.innerHTML = "";
  for (let i = 0; i < DEVICES.length; i++) {
    const dev = DEVICES[i];
    const tableName = "میز " + (i + 1);
    const label = `${dev.name} (${dev.console}${dev.vip || dev.royal || dev.legendary ? " - VIP 👑" : ""})`;
    reserveTableSelect.appendChild(new Option(label, tableName));
  }
}
function openReservationModal() {
  let start = timeStart.value;
  if (!start) return customAlert("ساعت رزرو را مشخص کنید.");
  populateReserveModalTables();
  document.getElementById("reserveModalTableSelect").value = tableSelect.value;
  document.getElementById("reserveModalTime").value = start;
  document.getElementById("reserveName").value = "";
  document.getElementById("reservePhone").value = "";
  document.getElementById("reserveModal").style.display = "flex";
}
function closeReservationModal() {
  document.getElementById("reserveModal").style.display = "none";
}
function saveReservation() {
  let day = daySelect.value;
  let table = document.getElementById("reserveModalTableSelect").value;
  let start = document.getElementById("reserveModalTime").value;
  let mode = document.getElementById("modeSelect").value;
  let tableNum = parseInt(table.replace("میز ", ""));
  let config = TABLE_CONFIGS[tableNum] || { console: "PS4", isVip: false };
  let consoleType = config.console;
  let cName = document.getElementById("reserveName").value;
  let cPhone = document.getElementById("reservePhone").value;
  if (!start) return customAlert("ساعت رزرو را مشخص کنید.");
  if (!cName) return customAlert("وارد کردن نام مشتری الزامی است.");
  // بررسی اعتبار حالت انتخابی برای این میز
  if (!isModeValidForTable(table, mode)) {
    customAlert(
      `❌ حالت بازی "${mode}" برای این میز معتبر نیست. لطفاً حالت دیگری انتخاب کنید.`,
    );
    return;
  }

  gameNet[day].push({
    status: "reserved",
    table,
    timeStart: start,
    startTimeMs: null,
    timeEnd: null,
    mode,
    consoleType,
    history: [],
    cafeItems: [],
    cafeCost: 0,
    gameCost: 0,
    totalAmount: 0,
    paidAmount: 0,
    note: "",
    logs: [],
    customerName: cName,
    customerPhone: cPhone,
    reservedDay: day,
    date: getPersianDateForDay(day),
  });
  saveSettingsToStorage();
  closeReservationModal();
  render();
  neonFlash();
}

function startReservedSession(index) {
  let day = daySelect.value;
  let s = gameNet[day][index];
  if (isTableActive(day, s.table))
    return customAlert(
      "این میز در حال حاضر فعال است! ابتدا بازی فعلی را ببندید.",
    );
  s.status = "active";
  let now = new Date();
  s.timeStart = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  s.startTimeMs = Date.now();
  let rate = getRateForSession(s);
  let msg = `<span class="log-info">▶️ شروع جلسه (از حالت رزرو) روی <span class="log-name">${s.table}</span></span><br>`;
  msg += `<span class="log-info">حالت بازی: <span class="log-mode">${s.mode}</span> با نرخ ساعتی <span class="log-rate">${rate.toLocaleString()}</span> تومان</span>`;
  addSessionLog(day, index, "شروع بازی", msg, 0, s.cafeCost || 0);
  saveSettingsToStorage();
  render();
  neonFlash();
}

function startSession() {
  let day = daySelect.value,
    table = tableSelect.value,
    start = timeStart.value,
    mode = document.getElementById("modeSelect").value;
  let tableNum = parseInt(table.replace("میز ", ""));
  let config = TABLE_CONFIGS[tableNum] || { console: "PS4", isVip: false };
  let consoleType = config.console;
  if (!start) return customAlert("ساعت ورود را مشخص کنید.");
  if (isTableActive(day, table))
    return customAlert("این میز در حال حاضر فعال است! ابتدا آن را ببندید.");

  // بررسی اعتبار حالت انتخابی برای این میز
  if (!isModeValidForTable(table, mode)) {
    customAlert(
      `❌ حالت بازی "${mode}" برای این میز معتبر نیست. لطفاً حالت دیگری انتخاب کنید.`,
    );
    return;
  }

  let hasReservation = gameNet[day].some(
    (s) => s.table === table && s.status === "reserved",
  );

  const createNewSession = (isResume = false) => {
    const newSession = {
      status: "active",
      table,
      timeStart: start,
      startTimeMs: Date.now(),
      timeEnd: null,
      mode,
      consoleType,
      history: [],
      cafeItems: [],
      cafeCost: 0,
      gameCost: 0,
      totalAmount: 0,
      paidAmount: 0,
      note: "",
      logs: [],
      discountPercent: 0,
      discountFixed: 0,
      date: getPersianDateForDay(day),
    };
    gameNet[day].push(newSession);
    let newIndex = gameNet[day].length - 1;
    let rate = getRateForSession(newSession);
    let msg = `<span class="log-info">🎮 شروع بازی روی <span class="log-name">${config.customName || table}</span> (<span class="log-console">${consoleType}</span>)</span><br>`;
    msg += `<span class="log-info">حالت بازی: <span class="log-mode">${mode}</span> با نرخ ساعتی <span class="log-rate">${formatMoneyText(rate)}</span></span>`;
    if (isResume)
      msg = `<span class="log-info">▶️ شروع جلسه (از حالت رزرو) روی <span class="log-name">${config.customName || table}</span><br><span class="log-info">حالت بازی: <span class="log-mode">${mode}</span> با نرخ ساعتی <span class="log-rate">${formatMoneyText(rate)}</span></span>`;
    addSessionLog(day, newIndex, "شروع بازی", msg, 0, 0);
    let now = new Date();
    timeStart.value = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    saveSettingsToStorage();
    render();
    neonFlash();
  };

  if (hasReservation) {
    customConfirm(
      "⚠️ هشدار: این میز برای امروز رزرو شده است! آیا مطمئن هستید که می‌خواهید بازی جدیدی را شروع کنید؟",
    ).then((res) => {
      if (res) createNewSession(false);
    });
  } else {
    createNewSession(false);
  }
}

// ================== اصلاح تابع بستن سشن (رفع مشکل عدم واکنش دکمه) ==================
function closeSessionAuto(index) {
  try {
    const day = daySelect.value;
    const sessions = gameNet[day];
    if (!sessions || !sessions[index]) {
      console.error("سشن معتبر نیست:", { day, index, sessions });
      customAlert("خطا: جلسه مورد نظر یافت نشد.");
      return;
    }

    const s = sessions[index];
    if (s.status !== "active") {
      customAlert("این جلسه قبلاً بسته شده است یا در وضعیت مناسبی نیست.");
      return;
    }

    const now = new Date();
    const nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    let calc;
    try {
      calc = calculateCost(s, nowStr);
      if (calc.weightedAvgRate === undefined) calc.weightedAvgRate = 0;
      if (calc.effectiveMinutes === undefined)
        calc.effectiveMinutes = calc.totalMinutes;
    } catch (calcErr) {
      console.error("خطا در محاسبه هزینه:", calcErr);
      customAlert("خطا در محاسبه هزینه. لطفاً دوباره تلاش کنید.");
      return;
    }

    s.timeEnd = nowStr;
    s.hours = calc.durationStr;
    s.gameCost = calc.gameCost;

    let subtotal = calc.total - (s.paidAmount || 0);
    let discountAmount = 0;
    if (s.discountFixed && s.discountFixed > 0) {
      discountAmount = s.discountFixed;
    } else if (s.discountPercent && s.discountPercent > 0) {
      discountAmount = Math.round((subtotal * s.discountPercent) / 100);
    }
    let finalTotal = subtotal - discountAmount;
    if (finalTotal < 0) finalTotal = 0;

    // ✅ گرد کردن به پایین (حذف سه رقم آخر)
    finalTotal = roundFinalPrice(finalTotal);
    s.totalAmount = finalTotal;
    s.status = "closed";

    logCalculationDetails(day, index, s, nowStr, calc, "بستن جلسه");

    if (discountAmount > 0) {
      const unitLabel = currentPriceUnit === "Rial" ? "ریال" : "تومان";
      const msg = `تخفیف ${discountAmount.toLocaleString()} ${unitLabel} (قبل از تخفیف: ${subtotal.toLocaleString()} ${unitLabel}، پس از تخفیف: ${finalTotal.toLocaleString()} ${unitLabel})`;
      addSessionLog(day, index, "تخفیف", msg, calc.gameCost, s.cafeCost || 0);
    }

    saveSettingsToStorage();
    render();
  } catch (err) {
    console.error("خطای غیرمنتظره در closeSessionAuto:", err);
    customAlert("خطا در بستن جلسه. لطفاً با پشتیبانی تماس بگیرید.");
  }
}
// اطمینان از دسترسی سراسری به تابع بستن
window.closeSessionAuto = closeSessionAuto;

async function deleteSession(index) {
  const authorized = await requirePasswordIfNeeded("deleteSession");
  if (!authorized) return;
  let result = await customConfirm(
    "آیا این رکورد به سطل آشغال منتقل شود؟ (قابل بازیابی نیست)",
  );
  if (!result) return;

  let day = daySelect.value;
  let s = gameNet[day][index];
  // بازگرداندن موجودی کافه
  s.cafeItems.forEach((ordered) => {
    let item = cafeMenu.find((c) => c.id === ordered.id);
    if (item) item.stock += ordered.qty;
  });
  const deletedEntry = {
    session: JSON.parse(JSON.stringify(s)),
    deletedAt: new Date().toISOString(),
    originalDay: day,
  };
  deletedSessions.push(deletedEntry);
  gameNet[day].splice(index, 1);
  saveSettingsToStorage();
  render();
  renderCafeMenus();
}
async function openTrashModal() {
  const authorized = await requirePasswordIfNeeded("trashModal");
  if (!authorized) return;

  renderTrashModal();
  document.getElementById("trashModal").style.display = "flex";
}

function closeTrashModal() {
  document.getElementById("trashModal").style.display = "none";
}

function renderTrashModal() {
  const tbody = document.getElementById("trashTableBody");
  if (!tbody) return;
  tbody.innerHTML = "";

  if (deletedSessions.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="6" style="text-align:center;">سطل آشغال خالی است.</td></tr>';
    return;
  }

  deletedSessions.forEach((entry, idx) => {
    const s = entry.session;
    const deletedDate = new Date(entry.deletedAt).toLocaleString("fa-IR");
    const row = tbody.insertRow();

    // نام میز (با نام سفارشی)
    let tableNum = parseInt(s.table.replace("میز ", ""));
    let displayName = TABLE_CONFIGS[tableNum]?.customName || s.table;

    row.insertCell(0).innerHTML = displayName;
    row.insertCell(1).innerHTML = `${s.consoleType} (${s.mode})`;
    row.insertCell(2).innerHTML =
      `${s.timeStart}${s.timeEnd ? " تا " + s.timeEnd : ""}`;
    row.insertCell(3).innerHTML = entry.originalDay;
    row.insertCell(4).innerHTML = deletedDate;

    // دکمه مشاهده لاگ
    const btnCell = row.insertCell(5);
    const viewLogsBtn = document.createElement("button");
    viewLogsBtn.className = "btn btn-log btn-log-delete-modal";
    viewLogsBtn.innerHTML = "📜 لاگ";
    viewLogsBtn.style.padding = "4px 16px";
    viewLogsBtn.style.fontSize = "0.75rem";
    viewLogsBtn.onclick = () => viewTrashSessionLogs(idx);
    btnCell.appendChild(viewLogsBtn);

    // (اختیاری) دکمه حذف همیشگی
    const deleteForeverBtn = document.createElement("button");
    deleteForeverBtn.className = "btn btn-danger";
    deleteForeverBtn.innerHTML = "🗑️ حذف همیشگی";
    deleteForeverBtn.style.padding = "4px 8px";
    deleteForeverBtn.style.fontSize = "0.75rem";
    deleteForeverBtn.style.marginRight = "8px";
    deleteForeverBtn.onclick = async () => {
      if (await customConfirm("آیا این رکورد را برای همیشه حذف می‌کنید؟")) {
        deletedSessions.splice(idx, 1);
        saveDeletedSessions();
        renderTrashModal();
      }
    };
    btnCell.appendChild(deleteForeverBtn);
  });
}

function viewTrashSessionLogs(trashIndex) {
  const entry = deletedSessions[trashIndex];
  if (!entry) return;
  const session = entry.session;

  // نمایش لاگ با همان مودال موجود، اما با داده‌های جلسه آرشیو شده
  // ما تابع کمکی جدیدی نمی‌سازیم، بلکه لاگ را مستقیماً از data پر می‌کنیم (کپی از openSessionLogsModal)
  showSessionLogsFromData(session, `لاگ‌های جلسه حذف شده - ${session.table}`);
}

function showSessionLogsFromData(session, title) {
  const logs = session.logs || [];
  const tbody = document.getElementById("logsTableBody");
  const tfoot = document.getElementById("logsTableFoot");
  tbody.innerHTML = "";

  let prevGameCost = 0;
  let prevCafeCost = 0;
  let totalGameDelta = 0;
  let totalCafeDelta = 0;

  function convertAmount(amountInToman) {
    if (currentPriceUnit === "Rial") return amountInToman * 10;
    return amountInToman;
  }
  function getCurrencyIconHtml() {
    if (currentPriceUnit === "Rial") {
      return `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#rial"></use></svg>`;
    }
    return TOMAN_ICON;
  }
  function formatDelta(valueInToman) {
    const converted = convertAmount(valueInToman);
    const sign = converted >= 0 ? "+" : "";
    const color =
      converted > 0 ? "#00ff66" : converted < 0 ? "#ff5555" : "#8892b0";
    return `<span style="color: ${color};">${sign}${converted.toLocaleString()} ${getCurrencyIconHtml()}</span>`;
  }
  function formatAbsolute(amountInToman) {
    const converted = convertAmount(amountInToman);
    return `${converted.toLocaleString()} ${getCurrencyIconHtml()}`;
  }

  const eventIcons = {
    "شروع بازی": "🎮",
    "بستن جلسه": "🔒",
    "تغییر دسته": "🔄",
    "انتقال میز": "🚚",
    پرداخت: "💰",
    "ویرایش رکورد": "✏️",
    "تغییر سفارش کافه": "☕",
    رزرو: "📅",
    "ویرایش رزرو": "📝",
  };
  function getEventIcon(eventType) {
    return eventIcons[eventType] || "📌";
  }

  if (logs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;">هیچ رویدادی ثبت نشده است. </tr>';
  } else {
    logs.forEach((log) => {
      const absoluteGame = log.gameCost || 0;
      const absoluteCafe = log.cafeCost || 0;
      const deltaGame = absoluteGame - prevGameCost;
      const deltaCafe = absoluteCafe - prevCafeCost;
      totalGameDelta += deltaGame;
      totalCafeDelta += deltaCafe;
      prevGameCost = absoluteGame;
      prevCafeCost = absoluteCafe;

      const row = tbody.insertRow();
      row.insertCell(0).innerHTML =
        `<div style="text-align:center">${log.timestamp}</div>`;
      row.insertCell(1).innerHTML =
        `<div style="text-align:center">${getEventIcon(log.eventType)} ${log.eventType || "رویداد"}</div>`;
      row.insertCell(2).innerHTML =
        `<div style="text-align:right">${log.message}</div>`;
      row.insertCell(3).innerHTML =
        `<div style="text-align:left">${formatDelta(deltaGame)}</div>`;
      row.insertCell(4).innerHTML =
        `<div style="text-align:left">${formatDelta(deltaCafe)}</div>`;
    });
  }

  const paid = session.paidAmount || 0;
  const totalBeforePaid = totalGameDelta + totalCafeDelta;
  const net = totalBeforePaid - paid;

  let discountAmount = 0;
  if (session.discountFixed && session.discountFixed > 0) {
    discountAmount = session.discountFixed;
  } else if (session.discountPercent && session.discountPercent > 0) {
    discountAmount = Math.round((net * session.discountPercent) / 100);
  }
  const netAfterDiscount = net - discountAmount;
  const roundedNet = roundFinalPrice(netAfterDiscount);
  const finalAmount = netAfterDiscount >= 0 ? roundedNet : Math.abs(roundedNet);
  const finalMessage =
    netAfterDiscount >= 0
      ? `💰 مبلغ نهایی قابل پرداخت (بازی + کافه − پیش‌پرداخت − تخفیف) - ${getRoundingDescription()}`
      : `🔄 مبلغ بستانکاری به مشتری (پیش‌پرداخت بیشتر از هزینه کل) - ${getRoundingDescription()}`;
  const finalColor = netAfterDiscount >= 0 ? "var(--primary)" : "#ffaa00";

  const roundedTotalGameDelta = roundFinalPrice(totalGameDelta);
  const roundedTotalCafeDelta = roundFinalPrice(totalCafeDelta);

  let paidRow =
    paid > 0
      ? `<tr style="border-top: 1px solid var(--warning);">
        <td colspan="3" style="text-align:left; font-weight:bold;">💰 پیش‌پرداخت ثبت شده</td>
        <td colspan="2" style="text-align:left; color: var(--warning);">- ${formatAbsolute(paid)}</td>
      </tr>`
      : "";

  let discountRow =
    discountAmount > 0
      ? `<tr style="border-top: 1px solid var(--primary);">
        <td colspan="3" style="text-align:left; font-weight:bold;">🏷️ تخفیف اعمال شده</td>
        <td colspan="2" style="text-align:left; color: #ffaa00;">- ${formatAbsolute(discountAmount)}</td>
      </tr>`
      : "";

  tfoot.innerHTML = `
    ${paidRow}
    ${discountRow}
    <tr style="border-top: 2px solid var(--primary);">
      <td colspan="3" style="text-align:left; font-weight:bold;">جمع کل تغییرات (بازی + کافه) - ${getRoundingDescription()}</td>
      <td style="text-align:left;">${formatAbsolute(roundedTotalGameDelta)}</td>
      <td style="text-align:left;">${formatAbsolute(roundedTotalCafeDelta)}</td>
    </tr>
    <tr style="background: rgba(0,243,255,0.1);">
      <td colspan="3" style="text-align:left; font-weight:bold;">${finalMessage}</td>
      <td colspan="2" style="text-align:left; font-size:1.1rem; color: ${finalColor};">
        ${formatAbsolute(Math.abs(roundedNet))}
      </td>
    </tr>
  `;

  const modal = document.getElementById("sessionLogsModal");
  modal.style.display = "flex";
  modal.style.zIndex = "2100";
  const modalTitle = modal.querySelector("h3");
  if (modalTitle) modalTitle.innerText = title || "📜 گزارش رویدادهای میز";
}

function openChangeModeModal(index) {
  activeModalSessionIndex = index;
  let day = daySelect.value;
  let session = gameNet[day][index];
  let tableName = session.table;
  let validModes = getValidModesForTable(tableName);
  let modeSelect = document.getElementById("newModeSelect");

  modeSelect.innerHTML = "";
  validModes.forEach((mode) => {
    let option = document.createElement("option");
    option.value = mode;
    option.textContent = mode;
    if (mode === session.mode) option.selected = true;
    modeSelect.appendChild(option);
  });

  document.getElementById("changeModeModal").style.display = "flex";
}
function showModeSelectionModal(validModes, currentMode) {
  return new Promise((resolve) => {
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.style.display = "flex";
    modal.style.zIndex = "10001";
    modal.innerHTML = `
            <div class="modal-content" style="width:300px; text-align:center;">
                <h3>انتخاب حالت بازی</h3>
                <p>حالت فعلی "${currentMode}" برای میز جدید معتبر نیست.<br>لطفاً حالت جدید را انتخاب کنید:</p>
                <select id="tempModeSelect" style="width:100%; padding:8px; margin:15px 0;">
                    ${validModes.map((m) => `<option value="${m}">${m}</option>`).join("")}
                </select>
                <div style="display:flex; gap:10px;">
                    <button id="tempModeConfirm" class="btn btn-success">تأیید</button>
                    <button id="tempModeCancel" class="btn btn-danger">لغو</button>
                </div>
            </div>
        `;
    document.body.appendChild(modal);

    const confirmBtn = modal.querySelector("#tempModeConfirm");
    const cancelBtn = modal.querySelector("#tempModeCancel");
    const selectEl = modal.querySelector("#tempModeSelect");

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
  document.getElementById("changeModeModal").style.display = "none";
}
function saveChangeMode() {
  let day = daySelect.value;
  let s = gameNet[day][activeModalSessionIndex];
  let newMode = document.getElementById("newModeSelect").value;
  if (newMode === s.mode) return closeChangeModeModal();

  // بررسی اعتبار حالت جدید برای میز فعلی
  if (!isModeValidForTable(s.table, newMode)) {
    customAlert(`❌ حالت "${newMode}" برای میز ${s.table} معتبر نیست.`);
    return;
  }

  let oldMode = s.mode;

  let now = new Date();
  let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  let lastStart =
    s.history && s.history.length > 0
      ? s.history[s.history.length - 1].end
      : s.timeStart;
  let tableNum = parseInt(s.table.replace("میز ", ""));
  let tableName = TABLE_CONFIGS[tableNum]?.customName || s.table;

  let oldRate = getPricingRate(s.consoleType, oldMode, tableNum);
  let newRate = getPricingRate(s.consoleType, newMode, tableNum);

  let { minutes, cost } = getPeriodCost(
    lastStart,
    nowStr,
    oldMode,
    s.consoleType,
    tableNum,
  );
  let flooredCost = Math.floor(cost); // ← گرد کردن هزینه بازه قبل

  let msgLines = [];
  msgLines.push(
    `<span class="log-info">⏱️ پس از <span class="log-highlight">${minutes} دقیقه</span> از شروع بازی روی <span class="log-name">${tableName}</span> (<span class="log-console">${s.consoleType}</span>):</span>`,
  );
  msgLines.push(
    `<span class="log-change">تغییر از <span class="log-mode">${oldMode}</span> با نرخ ${formatMoneyWithIcon(oldRate)} در ساعت به <span class="log-mode">${newMode}</span> با نرخ ${formatMoneyWithIcon(newRate)} در ساعت (هزینه بازه قبل: ${formatMoneyWithIcon(flooredCost)})</span>`,
  );
  msgLines.push(
    `<span class="log-info">▶️ شروع بازه جدید با دسته <span class="log-mode">${newMode}</span> روی همان میز</span>`,
  );

  if (!s.history) s.history = [];
  s.history.push({
    start: lastStart,
    end: nowStr,
    mode: oldMode,
    table: s.table,
    consoleType: s.consoleType,
    action: `تغییر دسته از ${oldMode} به ${newMode}`,
  });
  s.mode = newMode;

  let calcBefore = calculateCost(s, nowStr);
  addSessionLog(
    day,
    activeModalSessionIndex,
    "تغییر دسته",
    msgLines.join("<br>"),
    calcBefore.gameCost,
    s.cafeCost || 0,
  );

  saveSettingsToStorage();
  closeChangeModeModal();
  render();
}
function openChangeTableModal(index) {
  activeModalSessionIndex = index;
  let day = daySelect.value;
  let s = gameNet[day][index];
  let select = document.getElementById("newTableSelect");
  if (select) {
    select.innerHTML = "";
    // استفاده از آرایه DEVICES به جای TOTAL_TABLES
    for (let i = 0; i < DEVICES.length; i++) {
      let tableName = "میز " + (i + 1);
      // میز فعلی و میزهایی که هم‌اکنون فعال هستند را حذف می‌کنیم
      if (tableName !== s.table && !isTableActive(day, tableName)) {
        let dev = DEVICES[i];
        let displayText = `${dev.name} (${dev.console}${dev.vip || dev.royal || dev.legendary ? " - VIP 👑" : ""})`;
        select.appendChild(new Option(displayText, tableName));
      }
    }
  }
  document.getElementById("changeTableModal").style.display = "flex";
}
function closeChangeTableModal() {
  document.getElementById("changeTableModal").style.display = "none";
}
async function saveChangeTable() {
  let day = daySelect.value;
  let s = gameNet[day][activeModalSessionIndex];
  let newTable = document.getElementById("newTableSelect").value;
  if (!newTable || newTable === s.table) return closeChangeTableModal();

  let oldTable = s.table;
  let oldTableNum = parseInt(oldTable.replace("میز ", ""));
  let newTableNum = parseInt(newTable.replace("میز ", ""));
  let oldCustomName = TABLE_CONFIGS[oldTableNum]?.customName || oldTable;
  let newCustomName = TABLE_CONFIGS[newTableNum]?.customName || newTable;

  // بررسی اعتبار حالت فعلی برای میز جدید
  let validModesForNewTable = getValidModesForTable(newTable);
  let newMode = s.mode;
  if (!validModesForNewTable.includes(s.mode)) {
    const selectedMode = await showModeSelectionModal(
      validModesForNewTable,
      s.mode,
    );
    if (!selectedMode) return; // انصراف از تغییر میز
    newMode = selectedMode;
  }

  let now = new Date();
  let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  let oldConsole = s.consoleType;
  let oldMode = s.mode;
  let lastStart =
    s.history && s.history.length > 0
      ? s.history[s.history.length - 1].end
      : s.timeStart;

  let { minutes, cost } = getPeriodCost(
    lastStart,
    nowStr,
    oldMode,
    oldConsole,
    oldTableNum,
  );

  let msgLines = [];
  msgLines.push(
    `<span class="log-info">⏱️ پس از <span class="log-highlight">${minutes} دقیقه</span> از شروع بازی روی <span class="log-name">${oldCustomName}</span> (<span class="log-console">${oldConsole}</span> - <span class="log-mode">${oldMode}</span>):</span>`,
  );
  msgLines.push(
    `<span class="log-change">انتقال میز از <span class="log-name">${oldCustomName}</span> به <span class="log-name">${newCustomName}</span> (هزینه بازه قبل: ${formatMoneyWithIcon(cost)})</span>`,
  );

  if (!s.history) s.history = [];
  s.history.push({
    start: lastStart,
    end: nowStr,
    mode: oldMode,
    table: oldTable,
    consoleType: oldConsole,
    action: `انتقال میز از ${oldCustomName} به ${newCustomName}`,
  });

  s.table = newTable;
  let conf = TABLE_CONFIGS[newTableNum] || {
    console: oldConsole,
    isVip: false,
  };
  s.consoleType = conf.console;

  // تغییر حالت در صورت نیاز
  let modeChanged = newMode !== oldMode;
  if (modeChanged) {
    s.mode = newMode;
    msgLines.push(
      `<span class="log-change">تغییر دسته از ${oldMode} به ${newMode}</span>`,
    );
  }

  msgLines.push(
    `<span class="log-info">▶️ شروع بازه جدید روی <span class="log-name">${newCustomName}</span> (<span class="log-console">${s.consoleType}</span> - <span class="log-mode">${s.mode}</span>)</span>`,
  );

  let calcBefore = calculateCost(s, nowStr);
  addSessionLog(
    day,
    activeModalSessionIndex,
    "انتقال میز",
    msgLines.join("<br>"),
    calcBefore.gameCost,
    s.cafeCost || 0,
  );

  saveSettingsToStorage();
  closeChangeTableModal();
  render();
}

// ================== توابع مودال کافه ==================
let currentCafeSessionIndex = null;
let currentCafeQuantities = {};
let originalCafeItems = [];
function openCafeModal(index) {
  currentCafeSessionIndex = index;
  let day = daySelect.value;
  let session = gameNet[day][index];
  let tableNum = parseInt(session.table.replace("میز ", ""));
  let tableName = TABLE_CONFIGS[tableNum]?.customName || session.table;
  document.getElementById("modalTableName").innerText = tableName;
  originalCafeItems = JSON.parse(JSON.stringify(session.cafeItems || []));
  currentCafeQuantities = {};
  cafeMenu.forEach((item) => {
    let existing = session.cafeItems.find((c) => c.id === item.id);
    currentCafeQuantities[item.id] = existing ? existing.qty : 0;
  });
  renderCafeModalList();
  updateOrderSummary();
  document.getElementById("cafeModal").style.display = "flex";
}
function renderCafeModalList() {
  const container = document.getElementById("modalCafeList");
  if (!container) return;
  container.innerHTML = "";
  cafeMenu.forEach((item) => {
    const qty = currentCafeQuantities[item.id] || 0;
    const maxStock =
      item.stock + (originalCafeItems.find((c) => c.id === item.id)?.qty || 0);
    const card = document.createElement("div");
    card.className = "cafe-item-card";
    card.style.background = "var(--input-bg)";
    card.style.borderRadius = "12px";
    card.style.padding = "10px";
    card.style.border = "1px solid rgba(150,150,150,0.2)";
    card.style.display = "flex";
    card.style.flexDirection = "column";
    card.style.gap = "8px";
    const nameDiv = document.createElement("div");
    nameDiv.style.fontWeight = "bold";
    nameDiv.style.color = "var(--primary)";
    nameDiv.innerHTML = `${item.name} <span style="color:var(--success); font-size:0.8rem;"> ( ${formatMoneyWithIcon(item.price)} ) </span>`;
    const stockSpan = document.createElement("div");
    stockSpan.style.fontSize = "0.7rem";
    stockSpan.style.color = "var(--text-muted)";
    stockSpan.innerText = `موجودی انبار: ${item.stock}`;
    const controls = document.createElement("div");
    controls.style.display = "flex";
    controls.style.alignItems = "center";
    controls.style.justifyContent = "space-between";
    controls.style.gap = "8px";
    const qtyWrapper = document.createElement("div");
    qtyWrapper.style.display = "flex";
    qtyWrapper.style.alignItems = "center";
    qtyWrapper.style.gap = "5px";
    const minusBtn = document.createElement("button");
    minusBtn.innerText = "-";
    minusBtn.className = "qty-btn";
    minusBtn.style.width = "28px";
    minusBtn.style.height = "28px";
    minusBtn.style.borderRadius = "6px";
    minusBtn.style.background = "var(--panel-bg)";
    minusBtn.style.border = "1px solid var(--primary)";
    minusBtn.style.color = "var(--primary)";
    minusBtn.style.cursor = "pointer";
    minusBtn.style.fontWeight = "bold";
    minusBtn.onclick = (e) => {
      e.preventDefault();
      changeCafeItemQty(item.id, -1);
    };
    const qtyInput = document.createElement("input");
    qtyInput.type = "number";
    qtyInput.id = `modal_cafe_qty_${item.id}`;
    qtyInput.value = qty;
    qtyInput.min = 0;
    qtyInput.max = maxStock;
    qtyInput.style.width = "60px";
    qtyInput.style.textAlign = "center";
    qtyInput.style.margin = "0";
    qtyInput.style.padding = "4px";
    qtyInput.style.background = "var(--input-bg)";
    qtyInput.style.color = "var(--text-main)";
    qtyInput.style.border = "1px solid rgba(150,150,150,0.2)";
    qtyInput.style.borderRadius = "6px";
    qtyInput.onchange = (e) => {
      let newVal = parseInt(e.target.value);
      if (isNaN(newVal)) newVal = 0;
      if (newVal > maxStock) newVal = maxStock;
      if (newVal < 0) newVal = 0;
      currentCafeQuantities[item.id] = newVal;
      qtyInput.value = newVal;
      updateOrderSummary();
    };
    const plusBtn = document.createElement("button");
    plusBtn.innerText = "+";
    plusBtn.className = "qty-btn";
    plusBtn.style.width = "28px";
    plusBtn.style.height = "28px";
    plusBtn.style.borderRadius = "6px";
    plusBtn.style.background = "var(--panel-bg)";
    plusBtn.style.border = "1px solid var(--primary)";
    plusBtn.style.color = "var(--primary)";
    plusBtn.style.cursor = "pointer";
    plusBtn.style.fontWeight = "bold";
    plusBtn.onclick = (e) => {
      e.preventDefault();
      changeCafeItemQty(item.id, 1);
    };
    qtyWrapper.appendChild(minusBtn);
    qtyWrapper.appendChild(qtyInput);
    qtyWrapper.appendChild(plusBtn);
    const cancelBtn = document.createElement("button");
    cancelBtn.innerHTML = "🗑️";
    cancelBtn.title = "حذف کامل این آیتم";
    cancelBtn.style.background = "rgba(255,0,85,0.2)";
    cancelBtn.style.border = "none";
    cancelBtn.style.borderRadius = "6px";
    cancelBtn.style.width = "32px";
    cancelBtn.style.height = "28px";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.style.color = "var(--warning)";
    cancelBtn.style.fontSize = "1rem";
    cancelBtn.onclick = (e) => {
      e.preventDefault();
      currentCafeQuantities[item.id] = 0;
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
  if (window.innerWidth < 600) container.style.gridTemplateColumns = "1fr";
  else container.style.gridTemplateColumns = "repeat(2, 1fr)";
}
function changeCafeItemQty(itemId, delta) {
  const maxStock =
    cafeMenu.find((i) => i.id === itemId).stock +
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
  const summaryDiv = document.getElementById("currentOrderSummary");
  if (!summaryDiv) return;
  const selectedItems = [];
  let total = 0;
  for (let item of cafeMenu) {
    let qty = currentCafeQuantities[item.id] || 0;
    if (qty > 0) {
      let cost = qty * item.price;
      total += cost;
      selectedItems.push({
        id: item.id,
        name: item.name,
        qty,
        price: item.price,
        cost,
      });
    }
  }
  summaryDiv.innerHTML = "";
  if (selectedItems.length === 0) {
    summaryDiv.innerHTML =
      "<div style='text-align:center; color:var(--text-muted); padding:8px;'>هیچ آیتمی انتخاب نشده است.</div>";
    return;
  }
  const table = document.createElement("table");
  table.style.width = "100%";
  table.style.borderCollapse = "collapse";
  table.style.fontSize = "0.8rem";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr style="border-bottom:1px solid rgba(150,150,150,0.3);"><th style="text-align:right; padding:4px 2px;">آیتم</th><th style="text-align:center; padding:4px 2px;">تعداد</th><th style="text-align:left; padding:4px 2px;">قیمت</th><th style="text-align:center; padding:4px 2px;"></th></tr>`;
  table.appendChild(thead);
  const tbody = document.createElement("tbody");
  selectedItems.forEach((item) => {
    const row = tbody.insertRow();
    row.style.borderBottom = "1px solid rgba(150,150,150,0.1)";
    const nameCell = row.insertCell(0);
    nameCell.style.textAlign = "right";
    nameCell.style.padding = "6px 2px";
    nameCell.innerText = item.name;
    const qtyCell = row.insertCell(1);
    qtyCell.style.textAlign = "center";
    qtyCell.style.padding = "6px 2px";
    qtyCell.innerText = item.qty;
    const priceCell = row.insertCell(2);
    priceCell.style.textAlign = "left";
    priceCell.style.padding = "6px 2px";
    priceCell.style.color = "var(--success)";
    priceCell.innerHTML = formatMoneyWithIcon(item.cost);
    const actionCell = row.insertCell(3);
    actionCell.style.textAlign = "center";
    actionCell.style.padding = "6px 2px";
    const delBtn = document.createElement("button");
    delBtn.innerHTML = "🗑️";
    delBtn.style.background = "none";
    delBtn.style.border = "none";
    delBtn.style.cursor = "pointer";
    delBtn.style.color = "var(--warning)";
    delBtn.style.fontSize = "1rem";
    delBtn.title = "حذف از سفارش";
    delBtn.onclick = () => {
      currentCafeQuantities[item.id] = 0;
      const input = document.getElementById(`modal_cafe_qty_${item.id}`);
      if (input) input.value = 0;
      updateOrderSummary();
    };
    actionCell.appendChild(delBtn);
  });
  table.appendChild(tbody);
  const tfoot = document.createElement("tfoot");
  const totalRow = tfoot.insertRow();
  totalRow.style.borderTop = "2px solid var(--primary)";
  const totalCell = totalRow.insertCell(0);
  totalCell.colSpan = 3;
  totalCell.style.textAlign = "left";
  totalCell.style.padding = "8px 2px 4px";
  totalCell.style.fontWeight = "bold";
  totalCell.innerHTML = `💰 جمع کل: ${formatMoneyWithIcon(total)}`;
  const emptyCell = totalRow.insertCell(1);
  emptyCell.style.display = "none";
  tfoot.appendChild(totalRow);
  table.appendChild(tfoot);
  summaryDiv.appendChild(table);
}

function closeCafeModal() {
  document.getElementById("cafeModal").style.display = "none";
  currentCafeSessionIndex = null;
  currentCafeQuantities = {};
  originalCafeItems = [];
}

// ------------------------------------------------------------
// توابع جدید برای تایمر معکوس
// ------------------------------------------------------------
function formatRemainingTime(ms) {
  if (ms <= 0) return "اتمام یافت";
  let totalSeconds = Math.floor(ms / 1000);
  let hours = Math.floor(totalSeconds / 3600);
  let minutes = Math.floor((totalSeconds % 3600) / 60);
  let seconds = totalSeconds % 60;
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

async function setCountdownTimer(index) {
  let day = daySelect.value;
  let session = gameNet[day][index];
  if (!session || session.status !== "active") {
    customAlert("فقط برای جلسات فعال می‌توان تایمر تنظیم کرد.");
    return;
  }
  const minutesInput = await customPrompt(
    "مدت زمان (به دقیقه) را وارد کنید:",
    "number",
  );
  if (minutesInput === null) return;
  let minutes = parseInt(minutesInput);
  if (isNaN(minutes) || minutes <= 0) {
    customAlert("لطفاً یک عدد معتبر و بزرگتر از صفر وارد کنید.");
    return;
  }
  const now = Date.now();
  const durationMs = minutes * 60 * 1000;
  session.countdownEnd = now + durationMs;
  session.countdownActive = true;
  saveSettingsToStorage();
  render();
  customAlert(`تایمر ${minutes} دقیقه‌ای با موفقیت تنظیم شد.`);
}

function checkAndNotifyCountdownTimers() {
  const day = daySelect.value;
  if (!gameNet[day]) return;
  let needRender = false;
  gameNet[day].forEach((session, idx) => {
    if (
      session.status === "active" &&
      session.countdownActive &&
      session.countdownEnd
    ) {
      if (Date.now() >= session.countdownEnd) {
        // زمان تایمر به پایان رسیده است
        session.countdownActive = false;
        session.countdownEnd = null;
        needRender = true;
        // نمایش هشدار
        let tableNum = parseInt(session.table.replace("میز ", ""));
        let tableName = TABLE_CONFIGS[tableNum]?.customName || session.table;
        customAlert(
          `⏰ هشدار تایمر: زمان تعیین شده برای ${tableName} به پایان رسید!`,
        );
      }
    }
  });
  if (needRender) {
    saveSettingsToStorage();
    render();
  }
}

function updateCountdownTooltips() {
  const day = daySelect.value;
  if (!gameNet[day]) return;
  const now = Date.now();
  document.querySelectorAll(".countdown-timer").forEach((el) => {
    const end = parseInt(el.getAttribute("data-end"));
    if (isNaN(end)) return;
    const remaining = Math.max(0, end - now);
    const tooltipSpan = el.querySelector(".custom-tooltip");
    if (tooltipSpan) {
      tooltipSpan.innerText = `زمان باقیمانده: ${formatRemainingTime(remaining)}`;
    }
    // اگر زمان تمام شده، المنت را مخفی کنیم (render بعدی آن را حذف می‌کند)
    if (remaining <= 0) {
      el.style.display = "none";
    }
  });
}

// ================== توابع یادداشت ==================
// یادداشت‌ها کامنت شدند (حذف دکمه‌ها)
// function updateSessionNote(index, text) { ... }
// let currentNoteSessionIndex = null;
// function openNoteModal(index) { ... }
// function closeDedicatedNoteModal() { ... }
// function saveDedicatedNote() { ... }
// document.getElementById('saveDedicatedNoteBtn').addEventListener('click', saveDedicatedNote);
// document.getElementById('closeDedicatedNoteBtn').addEventListener('click', closeDedicatedNoteModal);

// ================== مودال لاگ با ستون‌های جدید و جمع کل ==================
// ================== مودال لاگ با آیکون، دلتا، کسر پیش‌پرداخت و نمایش بستانکاری ==================
// ================== مودال لاگ با پشتیبانی از واحد پول انتخاب شده ==================

function openSessionLogsModal(index) {
  const day = daySelect.value;
  const session = gameNet[day][index];
  if (!session) return;

  const logs = session.logs || [];
  const tbody = document.getElementById("logsTableBody");
  const tfoot = document.getElementById("logsTableFoot");
  tbody.innerHTML = "";

  let prevGameCost = 0;
  let prevCafeCost = 0;
  let totalGameDelta = 0;
  let totalCafeDelta = 0;

  function convertAmount(amountInToman) {
    if (currentPriceUnit === "Rial") return amountInToman * 10;
    return amountInToman;
  }
  function getCurrencyIconHtml() {
    if (currentPriceUnit === "Rial") {
      return `<svg style="width: 16px; height: 19px; fill: var(--text-muted); display: inline-block; vertical-align: middle; margin-right: 2px;"><use xlink:href="#rial"></use></svg>`;
    }
    return TOMAN_ICON;
  }
  function formatDelta(valueInToman) {
    const converted = convertAmount(valueInToman);
    const sign = converted >= 0 ? "+" : "";
    const color =
      converted > 0 ? "#00ff66" : converted < 0 ? "#ff5555" : "#8892b0";
    return `<span style="color: ${color};">${sign}${converted.toLocaleString()} ${getCurrencyIconHtml()}</span>`;
  }
  function formatAbsolute(amountInToman) {
    const converted = convertAmount(amountInToman);
    return `${converted.toLocaleString()} ${getCurrencyIconHtml()}`;
  }

  const eventIcons = {
    "شروع بازی": "🎮",
    "بستن جلسه": "🔒",
    "تغییر دسته": "🔄",
    "انتقال میز": "🚚",
    پرداخت: "💰",
    "ویرایش رکورد": "✏️",
    "تغییر سفارش کافه": "☕",
    رزرو: "📅",
    "ویرایش رزرو": "📝",
    تخفیف: "🏷️",
  };
  function getEventIcon(eventType) {
    return eventIcons[eventType] || "📌";
  }

  if (logs.length === 0) {
    tbody.innerHTML =
      '<tr><td colspan="5" style="text-align:center;">هیچ رویدادی ثبت نشده است. </tr>';
  } else {
    logs.forEach((log) => {
      const absoluteGame = log.gameCost || 0;
      const absoluteCafe = log.cafeCost || 0;
      const deltaGame = absoluteGame - prevGameCost;
      const deltaCafe = absoluteCafe - prevCafeCost;
      totalGameDelta += deltaGame;
      totalCafeDelta += deltaCafe;
      prevGameCost = absoluteGame;
      prevCafeCost = absoluteCafe;

      const row = tbody.insertRow();
      row.insertCell(0).innerHTML =
        `<div style="text-align:center">${log.timestamp}</div>`;
      row.insertCell(1).innerHTML =
        `<div style="text-align:center">${getEventIcon(log.eventType)} ${log.eventType || "رویداد"}</div>`;
      row.insertCell(2).innerHTML =
        `<div style="text-align:right">${log.message}</div>`;
      row.insertCell(3).innerHTML =
        `<div style="text-align:left">${formatDelta(deltaGame)}</div>`;
      row.insertCell(4).innerHTML =
        `<div style="text-align:left">${formatDelta(deltaCafe)}</div>`;
    });
  }

  const paid = session.paidAmount || 0;
  let totalBeforePaid = totalGameDelta + totalCafeDelta;
  let subtotal = totalBeforePaid - paid;

  let discountAmount = 0;
  if (session.discountFixed && session.discountFixed > 0) {
    discountAmount = session.discountFixed;
  } else if (session.discountPercent && session.discountPercent > 0) {
    discountAmount = Math.round((subtotal * session.discountPercent) / 100);
  }
  const netAfterDiscount = subtotal - discountAmount;
  const roundedNet = roundFinalPrice(netAfterDiscount);
  const finalAmount = netAfterDiscount >= 0 ? roundedNet : Math.abs(roundedNet);
  const finalMessage =
    netAfterDiscount >= 0
      ? `💰 مبلغ نهایی قابل پرداخت (بازی + کافه − پیش‌پرداخت − تخفیف) - ${getRoundingDescription()}`
      : `🔄 مبلغ بستانکاری به مشتری (پیش‌پرداخت بیشتر از هزینه کل) - ${getRoundingDescription()}`;
  const finalColor = netAfterDiscount >= 0 ? "var(--primary)" : "#ffaa00";

  const roundedTotalGameDelta = roundFinalPrice(totalGameDelta);
  const roundedTotalCafeDelta = roundFinalPrice(totalCafeDelta);

  let paidRow =
    paid > 0
      ? `<tr style="border-top: 1px solid var(--warning);">
        <td colspan="3" style="text-align:left; font-weight:bold;">💰 پیش‌پرداخت ثبت شده</td>
        <td colspan="2" style="text-align:left; color: var(--warning);">- ${formatAbsolute(paid)}</td>
      </tr>`
      : "";

  let discountRow =
    discountAmount > 0
      ? `<tr style="border-top: 1px solid var(--primary);">
        <td colspan="3" style="text-align:left; font-weight:bold;">🏷️ تخفیف اعمال شده</td>
        <td colspan="2" style="text-align:left; color: #ffaa00;">- ${formatAbsolute(discountAmount)}</td>
      </tr>`
      : "";

  tfoot.innerHTML = `
    ${paidRow}
    ${discountRow}
    <tr style="border-top: 2px solid var(--primary);">
      <td colspan="3" style="text-align:left; font-weight:bold;">جمع کل تغییرات (بازی + کافه) - ${getRoundingDescription()}</td>
      <td style="text-align:left;">${formatAbsolute(roundedTotalGameDelta)}</td>
      <td style="text-align:left;">${formatAbsolute(roundedTotalCafeDelta)}</td>
    </tr>
    <tr style="background: rgba(0,243,255,0.1);">
      <td colspan="3" style="text-align:left; font-weight:bold;">${finalMessage}</td>
      <td colspan="2" style="text-align:left; font-size:1.1rem; color: ${finalColor};">
        ${formatAbsolute(Math.abs(roundedNet))}
      </td>
    </tr>
  `;

  const modal = document.getElementById("sessionLogsModal");
  modal.style.display = "flex";
  modal.style.zIndex = "2100";
  setTimeout(() => {
    let scrollDiv = modal.querySelector(
      ".modal-content > div:first-of-type + div",
    );
    if (!scrollDiv)
      scrollDiv = modal.querySelector(
        '.modal-content > div[style*="overflow-y"]',
      );
    if (scrollDiv && !scrollDiv.classList.contains("logs-scroll-container")) {
      scrollDiv.classList.add("logs-scroll-container");
    }
  }, 10);
}
// ================== بازنویسی تابع ذخیره سفارش کافه برای تولید جدول HTML در لاگ ==================
function saveCafeOrder() {
  let day = daySelect.value;
  let session = gameNet[day][currentCafeSessionIndex];
  if (!session) {
    closeCafeModal();
    return;
  }

  let lowStockWarnings = [];
  let finalCafeItems = [];
  let newCafeCost = 0;

  // تولید جدول HTML تغییرات با راست‌چینی کامل
  let changesHtml =
    '<table style="width:100%; border-collapse:collapse; font-size:0.8rem; direction:rtl;">';
  changesHtml += '<thead><tr style="border-bottom:1px solid var(--primary);">';
  changesHtml += '<th style="text-align:right; padding:6px 4px;">آیتم</th>';
  changesHtml += '<th style="text-align:right; padding:6px 4px;">تعداد</th>';
  changesHtml +=
    '<th style="text-align:right; padding:6px 4px;">قیمت واحد</th>';
  changesHtml +=
    '<th style="text-align:right; padding:6px 4px;">تغییر هزینه</th>';
  changesHtml += "</tr></thead><tbody>";

  for (let item of cafeMenu) {
    let newQty = currentCafeQuantities[item.id] || 0;
    let oldQty = originalCafeItems.find((c) => c.id === item.id)?.qty || 0;
    let delta = newQty - oldQty;
    if (delta !== 0) {
      if (delta > 0 && delta > item.stock) {
        customAlert(`موجودی ${item.name} کافی نیست!`);
        return;
      }
      item.stock -= delta;
      if (item.stock < 10 && item.stock >= 0)
        lowStockWarnings.push(`${item.name} (باقیمانده: ${item.stock})`);

      const changeAmount = delta * item.price;
      const sign = delta > 0 ? "+" : "";
      const color = delta > 0 ? "#00ff66" : "#ff5555";
      changesHtml += `<tr style="border-bottom:1px solid rgba(150,150,150,0.2);">`;
      changesHtml += `<td style="text-align:right; padding:6px 4px;">${escapeHtml(item.name)}</td>`;
      changesHtml += `<td style="text-align:right; padding:6px 4px;"><span style="color:${color};">${sign}${delta}</span></td>`;
      changesHtml += `<td style="text-align:right; padding:6px 4px;">${formatMoneyWithIcon(item.price)}</td>`;
      changesHtml += `<td style="text-align:right; padding:6px 4px; color:${color};">${sign}${formatMoneyWithIcon(Math.abs(changeAmount))}</td>`;
      changesHtml += `</tr>`;
    }
    if (newQty > 0) {
      finalCafeItems.push({
        id: item.id,
        name: item.name,
        price: item.price,
        qty: newQty,
      });
      newCafeCost += newQty * item.price;
    }
  }

  changesHtml += "</tbody></table>";

  session.cafeItems = finalCafeItems;
  session.cafeCost = newCafeCost;
  if (session.status === "closed") {
    let totalGame = session.gameCost || 0;
    let totalAmount = totalGame + newCafeCost - (session.paidAmount || 0);
    session.totalAmount = Math.max(0, totalAmount);
  }

  // ثبت لاگ فقط در صورت وجود تغییر
  if (changesHtml.includes("<tr")) {
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    let calc = calculateCost(session, nowStr);
    addSessionLog(
      day,
      currentCafeSessionIndex,
      "تغییر سفارش کافه",
      changesHtml, // جدول با راست‌چینی اصلاح شده
      calc.gameCost,
      newCafeCost,
    );
  }

  saveSettingsToStorage();
  closeCafeModal();
  render();
  renderCafeMenus();

  if (lowStockWarnings.length > 0) {
    customAlert(
      "⚠️ هشدار سیستم: موجودی محصولات زیر رو به اتمام است (کمتر از ۱۰ عدد):\n\n" +
        lowStockWarnings.join("\n"),
    );
  }
}

// ================== بهبود تابع ویرایش رزرو برای استفاده از نام سفارشی میز ==================
// (تنها بخش لاگ آن تغییر کرده)
async function saveEditReservation() {
  let day = daySelect.value;
  let session = gameNet[day][editingReservationIndex];
  if (!session || session.status !== "reserved") {
    customAlert("رکورد رزرو معتبر نیست.");
    closeEditReservationModal();
    return;
  }

  let newTable = document.getElementById("editReserveTableSelect").value;
  let newTime = document.getElementById("editReserveTime").value;
  let newName = document.getElementById("editReserveName").value.trim();
  let newPhone = document.getElementById("editReservePhone").value.trim();
  let newNote = document.getElementById("editReserveNoteInput").value;

  if (!newTime) {
    customAlert("لطفاً ساعت رزرو را مشخص کنید.");
    return;
  }
  if (!newName) {
    customAlert("لطفاً نام مشتری را وارد کنید.");
    return;
  }

  let conflict = gameNet[day].some((s, idx) => {
    if (idx === editingReservationIndex) return false;
    return (
      s.table === newTable && (s.status === "active" || s.status === "reserved")
    );
  });
  if (conflict) {
    customAlert(
      "میز انتخاب شده در این زمان فعال یا رزرو شده است. لطفاً میز دیگری انتخاب کنید.",
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

  let newTableNum = parseInt(newTable.replace("میز ", ""));
  let newConfig = TABLE_CONFIGS[newTableNum] || {
    console: session.consoleType,
    isVip: false,
  };
  session.consoleType = newConfig.console;

  let changes = [];
  // استفاده از نام سفارشی میز در لاگ
  let oldTableNum = parseInt(oldTable.replace("میز ", ""));
  let newTableNumLog = parseInt(newTable.replace("میز ", ""));
  let oldCustomName =
    (TABLE_CONFIGS[oldTableNum] && TABLE_CONFIGS[oldTableNum].customName) ||
    oldTable;
  let newCustomName =
    (TABLE_CONFIGS[newTableNumLog] &&
      TABLE_CONFIGS[newTableNumLog].customName) ||
    newTable;

  if (oldTable !== newTable)
    changes.push(`میز از ${oldCustomName} به ${newCustomName}`);
  if (oldTime !== newTime) changes.push(`ساعت از ${oldTime} به ${newTime}`);
  if (oldName !== newName)
    changes.push(`نام مشتری از "${oldName}" به "${newName}"`);
  if (oldPhone !== newPhone)
    changes.push(`شماره تماس از "${oldPhone}" به "${newPhone}"`);
  if ((oldNote || "") !== (newNote || "")) changes.push(`یادداشت تغییر کرد`);

  if (changes.length > 0) {
    addSessionLog(
      day,
      editingReservationIndex,
      "ویرایش رزرو",
      `ویرایش رزرو: ${changes.join("، ")}`,
      0,
      0,
    );
  }

  saveSettingsToStorage();
  closeEditReservationModal();
  render();
  customAlert("ویرایش رزرو با موفقیت ذخیره شد.");
}
function closeSessionLogsModal() {
  document.getElementById("sessionLogsModal").style.display = "none";
}

// ================== ویرایش رکورد ==================
function openEditModal(index) {
  editingIndex = index;
  let s = gameNet[daySelect.value][index];
  window._oldSessionForEdit = JSON.parse(JSON.stringify(s));

  document.getElementById("editTimeStart").value = s.timeStart;
  document.getElementById("editModeSelect").value = s.mode;

  // بارگذاری مقادیر تخفیف
  let discountPercentInput = document.getElementById("editDiscountPercent");
  let discountFixedInput = document.getElementById("editDiscountFixed");
  if (discountPercentInput) discountPercentInput.value = s.discountPercent || 0;
  if (discountFixedInput)
    discountFixedInput.value = s.discountFixed
      ? formatNumberWithCommas(s.discountFixed)
      : "";

  let endGroup = document.getElementById("editTimeEndGroup");
  if (s.status === "closed") {
    endGroup.style.display = "flex";
    document.getElementById("editTimeEnd").value = s.timeEnd;
  } else {
    endGroup.style.display = "none";
  }

  document.getElementById("editNoteInput").value = s.note || "";

  // مدیریت تایمر معکوس
  const countdownDiv = document.getElementById("countdownControl");
  const countdownStatusSpan = document.getElementById("countdownStatus");
  if (s.status === "active") {
    countdownDiv.style.display = "block";
    document.getElementById("editCountdownMinutes").value = "";
    if (s.countdownActive && s.countdownEnd) {
      let remainingSec = Math.max(0, (s.countdownEnd - Date.now()) / 1000);
      let remainingMin = Math.ceil(remainingSec / 60);
      countdownStatusSpan.innerText = `⏲️ تایمر فعال: ${remainingMin} دقیقه باقی مانده`;
    } else {
      countdownStatusSpan.innerText = "تایمر فعال نیست";
    }
  } else {
    countdownDiv.style.display = "none";
  }

  setupDiscountFieldsSync(); // اتصال رویدادهای همگام‌سازی تخفیف

  document.getElementById("editModal").style.display = "flex";
  initTimePickerBehavior();
  updateTimePickerColorScheme();
}

function setCountdownFromEdit() {
  let day = daySelect.value;
  let session = gameNet[day][editingIndex];
  if (!session || session.status !== "active") {
    customAlert("فقط برای جلسات فعال می‌توان تایمر تنظیم کرد.");
    closeEditModal();
    return;
  }

  let minutesInput = document.getElementById("editCountdownMinutes").value;
  let minutes = parseInt(minutesInput);
  if (isNaN(minutes) || minutes <= 0) {
    customAlert("لطفاً یک عدد معتبر و بزرگتر از صفر وارد کنید.");
    return;
  }

  const now = Date.now();
  session.countdownEnd = now + minutes * 60 * 1000;
  session.countdownActive = true;
  saveSettingsToStorage();

  // به‌روزرسانی وضعیت در مودال
  document.getElementById("countdownStatus").innerText =
    `⏲️ تایمر ${minutes} دقیقه‌ای تنظیم شد.`;
  document.getElementById("editCountdownMinutes").value = "";

  render();
  customAlert(`تایمر ${minutes} دقیقه‌ای با موفقیت تنظیم شد.`);
}

function clearCountdownFromEdit() {
  let day = daySelect.value;
  let session = gameNet[day][editingIndex];
  if (!session) return;

  session.countdownActive = false;
  session.countdownEnd = null;
  saveSettingsToStorage();

  document.getElementById("countdownStatus").innerText = "تایمر لغو شد.";
  render();
  customAlert("تایمر معکوس لغو شد.");
}
function adjustEditCafeQty(itemId, delta) {
  let input = document.getElementById(`edit_cafe_qty_${itemId}`);
  if (input) {
    let newVal = parseInt(input.value) + delta;
    let max = parseInt(input.getAttribute("max"));
    if (isNaN(newVal)) newVal = 0;
    if (newVal < 0) newVal = 0;
    if (max !== undefined && newVal > max) newVal = max;
    input.value = newVal;
  }
}
function closeEditModal() {
  document.getElementById("editModal").style.display = "none";
  window._oldSessionForEdit = null;
  // پاک کردن فیلدهای تایمر
  document.getElementById("editCountdownMinutes").value = "";
  document.getElementById("countdownStatus").innerText = "";
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
    let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    let calc = calculateCost(
      newS,
      newS.status === "closed" ? newS.timeEnd : nowStr,
    );
    addSessionLog(
      day,
      index,
      "ویرایش رکورد",
      changes.join("، "),
      calc.gameCost,
      newS.cafeCost || 0,
    );
  }
}

// ========== قانون مالی اصلاح شده در ویرایش رکورد (تغییر  دسته) ==========

function saveEdit() {
  let day = daySelect.value;
  let s = gameNet[day][editingIndex];
  let oldSession = window._oldSessionForEdit || JSON.parse(JSON.stringify(s));

  let newTimeStart = document.getElementById("editTimeStart").value;
  let newMode = document.getElementById("editModeSelect").value;
  let newNote = document.getElementById("editNoteInput").value;
  let newDiscountPercent =
    parseFloat(document.getElementById("editDiscountPercent").value) || 0;
  let newDiscountFixed =
    parseNumberFromFormatted(
      document.getElementById("editDiscountFixed").value,
    ) || 0;
  if (newDiscountPercent < 0) newDiscountPercent = 0;
  if (newDiscountPercent > 100) newDiscountPercent = 100;

  let modeChanged = newMode !== s.mode;
  let timeStartChanged = newTimeStart !== s.timeStart;

  // بررسی اعتبار حالت جدید در صورت تغییر mode
  if (modeChanged && !isModeValidForTable(s.table, newMode)) {
    customAlert(`❌ حالت بازی "${newMode}" برای میز ${s.table} معتبر نیست.`);
    return;
  }

  // ذخیره تغییرات پایه
  s.timeStart = newTimeStart;
  s.mode = newMode;
  s.note = newNote;
  s.discountPercent = newDiscountPercent;
  s.discountFixed = newDiscountFixed;

  // اگر زمان شروع تغییر کرده باشد، تمام بازه‌های تاریخچه را جابجا کن
  if (timeStartChanged && s.history && s.history.length > 0) {
    let oldStart = oldSession.timeStart;
    let newStart = newTimeStart;
    let diffMinutes = getTimeDiffInMinutes(oldStart, newStart);

    function shiftTime(timeStr, minutes) {
      let [h, m] = timeStr.split(":").map(Number);
      let total = h * 60 + m + minutes;
      total = (total + 1440) % 1440; // اطمینان از قرار گرفتن در محدوده 0-1439
      let nh = Math.floor(total / 60);
      let nm = total % 60;
      return `${nh.toString().padStart(2, "0")}:${nm.toString().padStart(2, "0")}`;
    }

    for (let i = 0; i < s.history.length; i++) {
      s.history[i].start = shiftTime(s.history[i].start, diffMinutes);
      s.history[i].end = shiftTime(s.history[i].end, diffMinutes);
    }
    if (s.status === "closed" && s.timeEnd) {
      s.timeEnd = shiftTime(s.timeEnd, diffMinutes);
    }
  }

  if (s.status === "active" && timeStartChanged) {
    s.startTimeMs = getStartTimeMs(newTimeStart);
  }

  // ========== محاسبه هزینه و زمان قبل و بعد برای لاگ ==========
  let oldCost = 0,
    newCost = 0;
  let oldTotalMinutes = 0,
    newTotalMinutes = 0;
  let now = new Date();
  let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  if (s.status === "active") {
    let oldCalc = calculateCost(oldSession, nowStr);
    oldCost = oldCalc.gameCost;
    oldTotalMinutes = oldCalc.totalMinutes;
    let newCalc = calculateCost(s, nowStr);
    newCost = newCalc.gameCost;
    newTotalMinutes = newCalc.totalMinutes;
  } else if (s.status === "closed") {
    let newEnd = document.getElementById("editTimeEnd").value;
    if (newEnd) s.timeEnd = newEnd;
    let oldCalc = calculateCost(oldSession, oldSession.timeEnd);
    let newCalc = calculateCost(s, s.timeEnd, { forceSingleMode: modeChanged });
    oldCost = oldCalc.gameCost;
    newCost = newCalc.gameCost;
    oldTotalMinutes = oldCalc.totalMinutes;
    newTotalMinutes = newCalc.totalMinutes;
    s.hours = newCalc.durationStr;
    s.gameCost = newCost;
    let subtotal = newCalc.total - (s.paidAmount || 0);
    let finalTotal = applyDiscount(
      subtotal,
      s.discountPercent,
      s.discountFixed,
    );
    finalTotal = roundFinalPrice(finalTotal);
    s.totalAmount = finalTotal;
  }

  // جمع‌آوری تغییرات برای لاگ (به صورت خطوط جدا و رنگی)
  // جایگزینی خطوط داخل تابع saveEdit (جایی که logLines ساخته می‌شود)
  let logLines = [];

  if (timeStartChanged) {
    logLines.push(
      `<span class="log-info">⏱️ تغییر ساعت شروع بازی از <span class="log-highlight">${oldSession.timeStart}</span> به <span class="log-highlight">${newTimeStart}</span></span>`,
    );
    logLines.push(
      `<span class="log-info">⏱️ زمان کل بازی: <span class="log-highlight">${oldTotalMinutes} دقیقه</span> ← <span class="log-highlight">${newTotalMinutes} دقیقه</span> (${newTotalMinutes - oldTotalMinutes >= 0 ? "+" : ""}${newTotalMinutes - oldTotalMinutes} دقیقه)</span>`,
    );
  }

  if (modeChanged) {
    logLines.push(
      `<span class="log-change">🔄 تغییر دسته از <span class="log-mode">${oldSession.mode}</span> به <span class="log-mode">${newMode}</span></span>`,
    );
  }

  if ((oldSession.discountPercent || 0) !== newDiscountPercent) {
    logLines.push(
      `<span class="log-info">🏷️ تغییر درصد تخفیف از <span class="log-highlight">${oldSession.discountPercent || 0}%</span> به <span class="log-highlight">${newDiscountPercent}%</span></span>`,
    );
  }
  if ((oldSession.discountFixed || 0) !== newDiscountFixed) {
    logLines.push(
      `<span class="log-info">🏷️ تغییر تخفیف مبلغی از ${formatMoneyWithIcon(oldSession.discountFixed || 0)} به ${formatMoneyWithIcon(newDiscountFixed)}</span>`,
    );
  }

  let oldCostRounded = roundFinalPrice(oldCost);
  let newCostRounded = roundFinalPrice(newCost);
  let diff = newCostRounded - oldCostRounded;
  let diffText =
    diff >= 0
      ? `+${formatMoneyWithIcon(diff)}`
      : `${formatMoneyWithIcon(Math.abs(diff))}`;

  logLines.push(
    `<span class="log-info">💰 هزینه نهایی بازی: ${formatMoneyWithIcon(oldCostRounded)} ← ${formatMoneyWithIcon(newCostRounded)} (${diffText})</span>`,
  );

  if (timeStartChanged && newTotalMinutes !== oldTotalMinutes) {
    let reason =
      newTotalMinutes > oldTotalMinutes ? "افزایش زمان بازی" : "کاهش زمان بازی";
    logLines.push(
      `<span class="log-info">📊 دلیل تغییر هزینه: ${reason}</span>`,
    );
  }

  let message = logLines.join("<br>");

  // ثبت لاگ فقط اگر تغییری وجود داشته باشد
  if (
    timeStartChanged ||
    modeChanged ||
    (oldSession.discountPercent || 0) !== newDiscountPercent ||
    (oldSession.discountFixed || 0) !== newDiscountFixed
  ) {
    addSessionLog(
      day,
      editingIndex,
      "ویرایش رکورد",
      message,
      newCost,
      s.cafeCost || 0,
    );
  }

  saveSettingsToStorage();
  closeEditModal();
  render();
}

function getRoundingDescription() {
  if (USE_ROUND_DOWN_PRICE) {
    if (currentPriceUnit === "Rial") {
      return "گرد شده به پایین (مضرب ۵۰,۰۰۰ ریال)";
    } else {
      return "گرد شده به پایین (مضرب ۵,۰۰۰ تومان)";
    }
  } else {
    if (currentPriceUnit === "Rial") {
      return "گرد شده به پایین (۱۰,۰۰۰ ریال)";
    } else {
      return "گرد شده به پایین (۱,۰۰۰ تومان)";
    }
  }
}

// تابع کمکی برای محاسبه مجموع دقیقه‌های بازی از history + timeStart تا end (یا حال)
function calculateTotalMinutes(session) {
  let periods = [];
  if (session.history && session.history.length > 0) {
    periods = [...session.history];
    let now = new Date();
    let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
    periods.push({
      start: session.history[session.history.length - 1].end,
      end: session.status === "active" ? nowStr : session.timeEnd,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    periods.push({
      start: session.timeStart,
      end:
        session.status === "active"
          ? new Date().toLocaleTimeString("fa-IR", {
              hour: "2-digit",
              minute: "2-digit",
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
      parseInt(p.start.split(":")[0]) * 60 + parseInt(p.start.split(":")[1]);
    let endMin =
      parseInt(p.end.split(":")[0]) * 60 + parseInt(p.end.split(":")[1]);
    if (endMin < startMin) endMin += 24 * 60;
    total += endMin - startMin;
  }
  return total;
}

function applyDiscount(subtotal, discountPercent, discountFixed) {
  let discountAmount = 0;
  if (discountFixed && discountFixed > 0) {
    discountAmount = discountFixed;
  } else if (discountPercent && discountPercent > 0) {
    discountAmount = Math.round((subtotal * discountPercent) / 100);
  }
  return Math.max(0, subtotal - discountAmount);
}

// تابع کمکی برای محاسبه اختلاف زمان بر حسب دقیقه (newStart - oldStart)
function getTimeDiffInMinutes(oldTime, newTime) {
  // oldTime و newTime به صورت "HH:MM" هستند
  const [oldHour, oldMin] = oldTime.split(":").map(Number);
  const [newHour, newMin] = newTime.split(":").map(Number);

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
    const authorized = await requirePasswordIfNeeded("revealIncome");
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
  if (!str) return "";
  return str.replace(
    /[&<>]/g,
    (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[m] || m,
  );
}

// ================== استخراج تغییرات دسته و میز از تاریخچه ==================
function getModeChangeTooltipContent(history) {
  if (!history || history.length === 0) return "";
  const changes = [];
  for (let entry of history) {
    if (entry.action && entry.action.includes("تغییر دسته")) {
      changes.push(
        `<li><i class="fas fa-exchange-alt"></i> ${escapeHtml(entry.action)}</li>`,
      );
    }
  }
  if (changes.length === 0) return "";
  return `<div class="custom-tooltip"><ul>${changes.join("")}</ul></div>`;
}

function getTableChangeTooltipContent(history) {
  if (!history || history.length === 0) return "";
  const changes = [];
  for (let entry of history) {
    if (entry.action && entry.action.includes("انتقال میز")) {
      changes.push(
        `<li><i class="fas fa-exchange-alt"></i> ${escapeHtml(entry.action)}</li>`,
      );
    }
  }
  if (changes.length === 0) return "";
  return `<div class="custom-tooltip"><ul>${changes.join("")}</ul></div>`;
}

function render() {
  generateTableSelect();
  let day = daySelect.value;
  const selectedDate = getPersianDateForDay(day);
  document.getElementById("currentDayDisplay").innerHTML =
    `${currentDateString} - روز ${day}`;
  sessionsBody.innerHTML = "";
  let totalIncome = 0,
    closedCount = 0;

  if (gameNet[day]) {
    const filteredSessions = gameNet[day].filter(
      (s) => s.date === selectedDate,
    );
    filteredSessions.forEach((s, i) => {
      if (s.status === "closed") {
        totalIncome += s.totalAmount;
        closedCount++;
      }
      let tableNum = parseInt(s.table.replace("میز ", ""));
      let config = TABLE_CONFIGS[tableNum];
      let isVip = config ? config.isVip : false;
      let displayName =
        config && config.customName ? config.customName : s.table;
      let rowClass = isVip ? " row-vip" : "";
      let consoleClass = getConsoleColorClass(s.consoleType);
      let tr = document.createElement("tr");
      if (s.status === "active")
        tr.className = `row-active ${rowClass} ${consoleClass}`;
      else if (s.status === "reserved")
        tr.className = `row-reserved ${rowClass} ${consoleClass}`;
      else tr.className = `row-closed ${rowClass} ${consoleClass}`;
      let consoleBorderColor = "#555";
      if (s.consoleType === "PS5") consoleBorderColor = "#ffffff";
      else if (s.consoleType === "PS4") consoleBorderColor = "#003791";
      else if (s.consoleType === "Xbox") consoleBorderColor = "#107C10";
      else if (s.consoleType === "PC") consoleBorderColor = "#FF0000";
      tr.style.borderRight = `5px solid ${consoleBorderColor}`;

      // ========== آیکون تغییر میز (در ستون اول) ==========
      let tableChangeIcon = "";
      let tableTooltip = getTableChangeTooltipContent(s.history);
      if (tableTooltip) {
        tableChangeIcon = `<span class="change-indicator" style="margin-right: 6px;">
                    <i class="fas fa-exchange-alt change-icon"></i>
                    ${tableTooltip}
                </span>`;
      }

      // ========== آیکون تغییر دسته (در ستون دوم) ==========
      let modeChangeIcon = "";
      let modeTooltip = getModeChangeTooltipContent(s.history);
      if (modeTooltip) {
        modeChangeIcon = `<span class="change-indicator" style="margin-right: 6px;">
                    <i class="fas fa-exchange-alt change-icon"></i>
                    ${modeTooltip}
                </span>`;
      }

      // ---------- ساخت بخش سفارشات/کافه یکپارچه ----------
      let orderSectionHtml = "";
      let cafeAddBtn = "";
      if (s.status === "active" || s.status === "closed") {
        cafeAddBtn = `<button class="btn-cafe" onclick="openCafeModal(${i})"><i class="fas fa-mug-hot"></i> سفارش کافه</button>`;
      } else {
        // برای رزرو: دکمه نامرئی برای حفظ ارتفاع (فقط فضا اشغال می‌کند)
        cafeAddBtn = `<button class="btn-cafe" style="visibility: hidden; pointer-events: none;"><i class="fas fa-mug-hot"></i> سفارش کافه</button>`;
      }

      let orderItemsHtml = "";
      if (s.status === "reserved") {
        // نمایش اطلاعات مشتری با ساختار badge مشابه
        orderItemsHtml = `
          <div style="display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-start;">
            <span class="badge badge-cafe">👤 ${escapeHtml(s.customerName)}</span>
            ${s.customerPhone ? `<span class="badge badge-cafe">📞 ${escapeHtml(s.customerPhone)}</span>` : ""}
          </div>
        `;
      } else {
        // نمایش آیتم‌های کافه
        if (s.cafeItems && s.cafeItems.length > 0) {
          orderItemsHtml =
            `<div style="display: flex; flex-wrap: wrap; gap: 5px; justify-content: flex-start;">` +
            s.cafeItems
              .map(
                (c) =>
                  `<span class="badge badge-cafe">${escapeHtml(c.name)} (${c.qty})</span>`,
              )
              .join("") +
            `</div>`;
        } else {
          orderItemsHtml = `<span style="color:var(--text-muted);">-</span>`;
        }
      }

      // ستون سفارشات با ساختار ثابت
      const orderColumnHtml = `
        <div style="display: flex; flex-direction: column; gap: 8px;">
          <div>${cafeAddBtn}</div>
          <div>${orderItemsHtml}</div>
        </div>
      `;

      // ------------------------------------------------------------
      // بخش تایمر معکوس
      let countdownHtml = "";
      if (s.status === "active" && s.countdownActive && s.countdownEnd) {
        let remaining = s.countdownEnd - Date.now();
        let remainingText = formatRemainingTime(remaining);
        countdownHtml = `<span class="change-indicator countdown-timer" data-end="${s.countdownEnd}" data-index="${i}" style="margin-right:8px; cursor:help;">⏲️ <span class="custom-tooltip">زمان باقیمانده: ${remainingText}</span></span>`;
      }
      let timeEndHtml = "";
      if (s.status === "active")
        timeEndHtml = `<span class="live-timer" id="timer_${i}">00:00:00</span>${countdownHtml}`;
      else if (s.status === "reserved")
        timeEndHtml = `<span class="live-timer reserved" id="timer_${i}">در حال محاسبه...</span>`;
      else
        timeEndHtml = `<span dir="ltr">${s.timeEnd}</span> <small>(${s.hours}h)</small>`;
      // ------------------------------------------------------------

      let costHtml = "";
      if (s.status === "active")
        costHtml = `<span style="color:var(--text-muted)" id="live_cost_${i}">در حال محاسبه...</span>`;
      else if (s.status === "reserved")
        costHtml = `<span style="color:var(--text-muted)">-</span>`;
      else
        costHtml = `<span style="color:var(--primary); font-weight:bold;">${formatMoneyWithIcon(s.totalAmount)}</span>`;

      if (s.paidAmount)
        costHtml += `<br><small style="color:var(--success)">پیش‌پرداخت: ${formatMoneyWithIcon(s.paidAmount)}</small>`;

      let actionHtml = "";
      if (s.status === "active") {
        actionHtml = `<div style="display:flex; flex-direction:column; gap:6px;">
        <div style="display:flex; gap:6px; justify-content:space-between;">
            <button class="btn-success" style="flex:1;" onclick="closeSessionAuto(${i})">✔ بستن</button>
            <button class="btn-primary" style="flex:1;" onclick="openEditModal(${i})">✏️ ویرایش</button>
        </div>
        <div style="display:flex; gap:6px; justify-content:space-between;">
            <button class="btn-warning" style="flex:1; color:black; font-weight:bold;" onclick="openChangeModeModal(${i})">🎮 دسته</button>
            <button class="btn-info" style="flex:1; background:var(--secondary); color:white;" onclick="openChangeTableModal(${i})">🔄 میز</button>
        </div>
        <div style="display:flex; gap:6px; justify-content:space-between;">
            <button class="btn-primary" style="flex:1;" onclick="addPayment(${i})">💰 پیش‌پرداخت</button>
            <button class="btn-log" style="flex:1; background:rgba(255,215,0,0.05); border:1px solid #ffd700; color:#ffd700;" onclick="openSessionLogsModal(${i})">📜 لاگ</button>
        </div>
    </div>`;
      } else if (s.status === "reserved") {
        actionHtml = `<div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; gap:6px; justify-content:space-between;"><button class="btn-success" style="flex:1;" onclick="startReservedSession(${i})">▶️ شروع</button><button class="btn-danger" style="flex:1;" onclick="deleteSession(${i})">🗑️ لغو</button></div>
                    <div style="display:flex; gap:6px; justify-content:space-between;"><button class="btn-primary" style="flex:1;" onclick="openEditReservationModal(${i})">✏️ ویرایش</button><button class="btn-log" style="flex:1; background:rgba(255,215,0,0.05); border:1px solid #ffd700; color:#ffd700;" onclick="openSessionLogsModal(${i})">📜 لاگ</button></div>
                </div>`;
      } else {
        actionHtml = `<div style="display:flex; flex-direction:column; gap:6px;">
                    <div style="display:flex; gap:6px; justify-content:space-between;"><button class="btn-danger" style="flex:1;" onclick="deleteSession(${i})">🗑️ حذف</button><button class="btn-primary" style="flex:1;" onclick="openEditModal(${i})">✏️ ویرایش</button></div>
                    <div style="display:flex; gap:6px; justify-content:space-between;"><button class="btn-log" style="flex:1; background:rgba(255,215,0,0.05); border:1px solid #ffd700; color:#ffd700;" onclick="openSessionLogsModal(${i})">📜 لاگ</button></div>
                </div>`;
      }

      // تعیین برچسب ویژه بر اساس اولویت: Legendary > Royal > VIP
      let specialBadge = "";
      const configs = TABLE_CONFIGS[tableNum];
      if (configs && configs.legendary) {
        specialBadge = ` <span class="badge-legendary">Legendary 🌟</span>`;
      } else if (configs && configs.royal) {
        specialBadge = ` <span class="badge-royal">Royal 💎</span>`;
      } else if (configs && configs.vip) {
        specialBadge = ` <span class="badge-vip">VIP 👑</span>`;
      }

      tr.innerHTML = `
                <td>
                    <span class="badge badge-table">${displayName}</span>${specialBadge}
                    ${tableChangeIcon}
                </td>
                <td>
                    <span class="badge badge-mode">${s.consoleType}</span> 
                    <small>${s.mode}</small>
                    ${modeChangeIcon}
                </td>
                <td dir="ltr" style="${s.status === "reserved" ? "font-weight:bold; color:var(--primary);" : ""}">${s.timeStart}</td>
                <td>${timeEndHtml}</td>
                <td>${orderColumnHtml}</td>
                <td>${costHtml}</td>
                <td>${actionHtml}</td>
            `;
      sessionsBody.appendChild(tr);

      // نمایش یادداشت
      if (s.note && s.note.trim() !== "") {
        let noteRow = document.createElement("tr");
        noteRow.className = "note-row";
        let parentBorderColor = tr.style.borderRight;
        if (parentBorderColor) noteRow.style.borderRight = parentBorderColor;
        else noteRow.style.borderRight = "2px solid var(--text-muted)";
        let fullNote = s.note;
        let lines = fullNote.split("\n");
        let isLong = lines.length > 2;
        let truncated = isLong
          ? lines.slice(0, 2).join("\n") + "..."
          : fullNote;
        let noteId = `note_${i}_${Date.now()}`;
        let noteContent = `<span id="${noteId}" class="note-content">${escapeHtml(isLong ? truncated : fullNote).replace(/\n/g, "<br>")}</span>`;
        if (isLong)
          noteContent += `<button class="note-toggle-btn" onclick="toggleNoteExpand('${noteId}')">بیشتر</button>`;
        let labelHtml = `<span class="note-label">📝 یادداشت:</span>`;
        noteRow.innerHTML = `<td colspan="7" style="padding:6px 12px; text-align:right;">${labelHtml} ${noteContent}</td>`;
        sessionsBody.appendChild(noteRow);
        noteRow.setAttribute("data-fullnote", fullNote);
        noteRow.setAttribute("data-truncated", truncated);
        noteRow.setAttribute("data-noteid", noteId);
      }
    });
  }

  let incomeEl = document.getElementById("totalAmountDisplay");
  incomeEl.style.cursor = "pointer";
  incomeEl.onclick = revealIncome;
  if (isIncomeRevealed) {
    incomeEl.innerHTML = formatMoneyWithIcon(totalIncome);
    incomeEl.classList.remove("hidden-income-blur");
  } else {
    incomeEl.innerText = "*** (کلیک برای نمایش) ***";
    incomeEl.classList.add("hidden-income-blur");
  }
  document.getElementById("recordCountDisplay").innerText = closedCount;
}

function startLiveTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    let day = daySelect.value;
    if (!gameNet[day]) return;
    // به‌روزرسانی تایمر زنده و هزینه جاری
    gameNet[day].forEach((s, i) => {
      try {
        if (s.status === "active") {
          let startMs = s.startTimeMs || getStartTimeMs(s.timeStart);
          let diffSeconds = Math.floor((Date.now() - startMs) / 1000);
          if (diffSeconds < 0) diffSeconds = 0;
          let hrs = Math.floor(diffSeconds / 3600)
            .toString()
            .padStart(2, "0");
          let mins = Math.floor((diffSeconds % 3600) / 60)
            .toString()
            .padStart(2, "0");
          let secs = (diffSeconds % 60).toString().padStart(2, "0");
          let timerEl = document.getElementById(`timer_${i}`);
          if (timerEl) timerEl.innerText = `${hrs}:${mins}:${secs}`;
          let costEl = document.getElementById(`live_cost_${i}`);
          if (costEl) {
            let now = new Date();
            let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
            let calc = calculateCost(s, nowStr);
            costEl.innerHTML = `<small>کافه: ${formatMoneyWithIcon(s.cafeCost || 0)}</small><br><b>بازی: ${formatMoneyWithIcon(calc.gameCost)}</b>`;
          }
        } else if (s.status === "reserved") {
          let reservedDayName = s.reservedDay || day;
          let reserveMs = getReserveTimeMs(reservedDayName, s.timeStart);
          let diffSeconds = Math.floor((reserveMs - Date.now()) / 1000);
          let timerEl = document.getElementById(`timer_${i}`);
          if (timerEl) {
            if (diffSeconds > 0) {
              let hrs = Math.floor(diffSeconds / 3600)
                .toString()
                .padStart(2, "0");
              let mins = Math.floor((diffSeconds % 3600) / 60)
                .toString()
                .padStart(2, "0");
              let secs = (diffSeconds % 60).toString().padStart(2, "0");
              timerEl.innerText = `⏳ ${hrs}:${mins}:${secs}`;
              timerEl.className = "live-timer reserved";
            } else {
              timerEl.innerText = "⚠️ زمان رزرو رسید!";
              timerEl.className = "live-timer warning";
            }
          }
        }
      } catch (e) {
        console.error(e);
      }
    });
    // بررسی انقضای تایمرهای معکوس و به‌روزرسانی tooltip
    checkAndNotifyCountdownTimers();
    updateCountdownTooltips();
  }, 1000);
}
function toggleNoteExpand(noteId) {
  let container = document.getElementById(noteId);
  if (!container) return;
  let noteRow = container.closest(".note-row");
  if (!noteRow) return;
  let fullNote = noteRow.getAttribute("data-fullnote");
  let truncated = noteRow.getAttribute("data-truncated");
  let btn = container.parentElement?.querySelector(".note-toggle-btn");
  if (!btn) btn = container.nextElementSibling;
  if (!btn) return;
  if (btn.innerText.includes("بیشتر")) {
    container.innerHTML = escapeHtml(fullNote).replace(/\n/g, "<br>");
    btn.innerHTML = "&nbsp;&nbsp; نمایش کمتر";
  } else {
    container.innerHTML = escapeHtml(truncated).replace(/\n/g, "<br>");
    btn.innerText = "  بیشتر";
  }
}

async function secureExportToExcel() {
  const authorized = await requirePasswordIfNeeded("exportExcel");
  if (!authorized) return;

  let day = daySelect.value;
  let records = gameNet[day];
  if (records.length === 0) {
    customAlert("هیچ رکوردی برای این روز ثبت نشده است!");
    return;
  }
  let tableUsage = {};
  records.forEach((session) => {
    if (session.timeStart && session.timeEnd && session.status === "closed") {
      let t1 = session.timeStart.split(":");
      let t2 = session.timeEnd.split(":");
      let d1 = new Date();
      d1.setHours(t1[0], t1[1], 0);
      let d2 = new Date();
      d2.setHours(t2[0], t2[1], 0);
      if (d2 < d1) d2.setDate(d2.getDate() + 1);
      let diffHours = (d2 - d1) / (1000 * 60 * 60);
      let tableNum = parseInt(session.table.replace("میز ", ""));
      let tableName = TABLE_CONFIGS[tableNum]?.customName || session.table;
      if (!tableUsage[tableName]) tableUsage[tableName] = 0;
      tableUsage[tableName] += diffHours;
    }
  });

  const currencyLabel = currentPriceUnit === "Rial" ? "ریال" : "تومان";
  let csvContent = "\uFEFF";
  csvContent += `نام میز,کنسول,حالت بازی,ساعت ورود/رزرو,ساعت خروج,یادداشت,هزینه بازی (${currencyLabel}),جزئیات سفارش/مشتری,هزینه کافه (${currencyLabel}),پیش‌پرداخت (${currencyLabel}),مبلغ نهایی (${currencyLabel}),وضعیت\n`;
  let totalDayIncome = 0,
    closedCount = 0;
  records.forEach((r) => {
    let statusFa =
      r.status === "active"
        ? "در حال بازی"
        : r.status === "reserved"
          ? "رزرو شده"
          : "بسته شده";
    let timeEndStr =
      r.status === "active" || r.status === "reserved" ? "-" : r.timeEnd;
    let finalAmount =
      r.status === "active" || r.status === "reserved" ? "-" : r.totalAmount;
    let cafeDetails = "-";
    if (r.status === "reserved")
      cafeDetails = `مشتری: ${r.customerName} - ${r.customerPhone || ""}`;
    else if (r.cafeItems && r.cafeItems.length > 0)
      cafeDetails = r.cafeItems.map((c) => `${c.name} (${c.qty})`).join(" | ");
    if (r.status === "closed") {
      totalDayIncome += r.totalAmount;
      closedCount++;
    }
    let safeNote = r.note ? r.note.replace(/,/g, " ") : "-";
    let tableNum = parseInt(r.table.replace("میز ", ""));
    let displayName = TABLE_CONFIGS[tableNum]?.customName || r.table;

    let gameCostVal = r.gameCost || 0;
    let cafeCostVal = r.cafeCost || 0;
    let paidVal = r.paidAmount || 0;
    let finalVal = typeof finalAmount === "number" ? finalAmount : 0;
    if (currentPriceUnit === "Rial") {
      gameCostVal *= 10;
      cafeCostVal *= 10;
      paidVal *= 10;
      finalVal *= 10;
    }

    csvContent += `${displayName},${r.consoleType},${r.mode},${r.timeStart},${timeEndStr},${safeNote},${gameCostVal},${cafeDetails},${cafeCostVal},${paidVal},${finalVal},${statusFa}\n`;
  });
  let totalIncomeDisplay = totalDayIncome;
  if (currentPriceUnit === "Rial") totalIncomeDisplay *= 10;
  csvContent += `\n,,,,,,تعداد رکوردهای بسته:,${closedCount},,,مجموع درآمد روز (${currencyLabel}):,${totalIncomeDisplay}\n`;
  csvContent += "\n\nآمار کارکرد میزها (ساعت)\nنام میز,مجموع ساعت استفاده\n";
  for (let tName in tableUsage)
    csvContent += `${tName},${tableUsage[tName].toFixed(2)} ساعت\n`;
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  const dateFa = new Date().toLocaleDateString("fa-IR").replace(/\//g, "-");
  link.setAttribute("href", url);
  link.setAttribute("download", `گزارش_${day}_${dateFa}.csv`);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
async function clearDayWithPassword() {
  const authorized = await requirePasswordIfNeeded("clearDay");
  if (!authorized) return;
  if (await customConfirm("پاکسازی کل روز؟ (موجودی کافه باز نمی‌گردد)")) {
    gameNet[daySelect.value] = [];
    saveSettingsToStorage();
    render();
  }
}

function updateCafePricePlaceholder() {
  const priceInput = document.getElementById("newCafePrice");
  if (!priceInput) return;
  const unitLabel = currentPriceUnit === "Rial" ? "ریال" : "تومان";
  priceInput.placeholder = `قیمت (${unitLabel})`;
}
function addCafeItem() {
  let n = document.getElementById("newCafeName").value;
  let priceInput = document.getElementById("newCafePrice").value;
  let st = parseInt(document.getElementById("newCafeStock").value);

  if (!n) {
    customAlert("لطفاً نام آیتم را وارد کنید.");
    return;
  }

  let priceInToman;
  if (currentPriceUnit === "Rial") {
    let priceInRial = parseNumberFromFormatted(priceInput);
    if (priceInRial % 10 !== 0) {
      customAlert("⚠️ در حالت ریال، قیمت باید مضربی از ۱۰ باشد.");
      return;
    }
    priceInToman = priceInRial / 10;
  } else {
    priceInToman = parseNumberFromFormatted(priceInput);
  }

  if (isNaN(priceInToman) || priceInToman <= 0) {
    customAlert("لطفاً قیمت معتبر وارد کنید.");
    return;
  }
  if (isNaN(st) || st < 0) {
    customAlert("لطفاً موجودی معتبر وارد کنید.");
    return;
  }

  cafeMenu.push({ id: Date.now(), name: n, price: priceInToman, stock: st });
  document.getElementById("newCafeName").value = "";
  document.getElementById("newCafePrice").value = "";
  document.getElementById("newCafeStock").value = "";
  saveSettingsToStorage();
  renderCafeMenus();
  resetCafeModalToAddMode();
}

async function deleteCafeItem(idx) {
  if (await customConfirm("آیا از حذف این آیتم از منو مطمئن هستید؟")) {
    cafeMenu.splice(idx, 1);
    saveSettingsToStorage();
    renderCafeMenus();
  }
}
function neonFlash() {
  document.getElementById("mainContainer").style.boxShadow =
    "0 0 40px var(--primary)";
  setTimeout(
    () => (document.getElementById("mainContainer").style.boxShadow = ""),
    500,
  );
}
daySelect.onchange = render;
function editCafeItem(index) {
  const item = cafeMenu[index];
  document.getElementById("newCafeName").value = item.name;

  // نمایش قیمت بر اساس واحد جاری
  let displayPrice = item.price;
  if (currentPriceUnit === "Rial") displayPrice = item.price * 10;
  document.getElementById("newCafePrice").value =
    formatNumberWithCommas(displayPrice);
  document.getElementById("newCafeStock").value = item.stock;

  const addBtn = document.getElementById("addCafeItemBtn");
  addBtn.textContent = "به‌روزرسانی";
  addBtn.setAttribute("onclick", `updateCafeItem(${index})`);
  addBtn.classList.remove("btn-settings");
  addBtn.classList.add("btn-success");

  let cancelBtn = document.getElementById("cancelEditCafeBtn");
  if (!cancelBtn) {
    cancelBtn = document.createElement("button");
    cancelBtn.id = "cancelEditCafeBtn";
    cancelBtn.textContent = "لغو ویرایش";
    cancelBtn.className = "btn btn-danger";
    cancelBtn.onclick = resetCafeModalToAddMode;
    const parent = addBtn.parentNode;
    const actionsRow = document.createElement("div");
    actionsRow.className = "edit-actions-row";
    addBtn.parentNode.insertBefore(actionsRow, addBtn);
    actionsRow.appendChild(addBtn);
    actionsRow.appendChild(cancelBtn);
  } else {
    cancelBtn.style.display = "block";
    const actionsRow = document.querySelector(
      "#manageCafeModal .edit-actions-row",
    );
    if (!actionsRow || !actionsRow.contains(cancelBtn)) {
      const parent = addBtn.parentNode;
      const newRow = document.createElement("div");
      newRow.className = "edit-actions-row";
      parent.insertBefore(newRow, addBtn);
      newRow.appendChild(addBtn);
      newRow.appendChild(cancelBtn);
    }
  }

  setTimeout(() => {
    const modal = document.getElementById("manageCafeModal");
    const modalContent = modal.querySelector(".modal-content");
    if (modalContent) modalContent.scrollTo({ top: 0, behavior: "smooth" });
    document
      .getElementById("newCafeName")
      .scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById("newCafeName").focus();
  }, 100);
}
function resetCafeModalToAddMode() {
  document.getElementById("newCafeName").value = "";
  document.getElementById("newCafePrice").value = "";
  document.getElementById("newCafeStock").value = "";
  const addBtn = document.getElementById("addCafeItemBtn");
  addBtn.textContent = "افزودن به منو";
  addBtn.setAttribute("onclick", "addCafeItem()");
  addBtn.classList.remove("btn-success");
  addBtn.classList.add("btn-settings");
  const cancelBtn = document.getElementById("cancelEditCafeBtn");
  if (cancelBtn) cancelBtn.remove();
  const actionsRow = document.querySelector(
    "#manageCafeModal .edit-actions-row",
  );
  if (actionsRow && actionsRow.parentNode) {
    const parent = actionsRow.parentNode;
    parent.insertBefore(addBtn, actionsRow);
    actionsRow.remove();
  }
}
function updateCafeItem(index) {
  const name = document.getElementById("newCafeName").value;
  const priceInput = document.getElementById("newCafePrice").value;
  const stock = document.getElementById("newCafeStock").value;

  if (!name) {
    customAlert("لطفاً نام آیتم را وارد کنید.");
    return;
  }

  let priceInToman;
  if (currentPriceUnit === "Rial") {
    let priceInRial = parseNumberFromFormatted(priceInput);
    if (priceInRial % 10 !== 0) {
      customAlert("⚠️ در حالت ریال، قیمت باید مضربی از ۱۰ باشد.");
      return;
    }
    priceInToman = priceInRial / 10;
  } else {
    priceInToman = parseNumberFromFormatted(priceInput);
  }

  if (isNaN(priceInToman) || priceInToman <= 0) {
    customAlert("لطفاً قیمت معتبر وارد کنید.");
    return;
  }
  if (isNaN(parseInt(stock)) || parseInt(stock) < 0) {
    customAlert("لطفاً موجودی معتبر وارد کنید.");
    return;
  }

  cafeMenu[index].name = name;
  cafeMenu[index].price = priceInToman;
  cafeMenu[index].stock = parseInt(stock);
  saveSettingsToStorage();
  renderCafeMenus();
  resetCafeModalToAddMode();
}
function attachLiveFormattingToAllPriceInputs() {
  const priceInputIds = [
    "p4_1",
    "p4_2",
    "p4_3",
    "p4_4",
    "p5_1",
    "p5_2",
    "p5_3",
    "p5_4",
    "xbox_1",
    "xbox_2",
    "xbox_3",
    "xbox_4",
    "pc_1",
    "pc_2",
    "vip_ps4_1",
    "vip_ps4_2",
    "vip_ps4_3",
    "vip_ps4_4",
    "vip_ps5_1",
    "vip_ps5_2",
    "vip_ps5_3",
    "vip_ps5_4",
    "vip_xbox_1",
    "vip_xbox_2",
    "vip_xbox_3",
    "vip_xbox_4",
  ];
  priceInputIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) attachLiveFormatting(el);
  });
  const newPriceInput = document.getElementById("newCafePrice");
  if (newPriceInput) attachLiveFormatting(newPriceInput);
}
document.querySelectorAll(".modal-overlay").forEach((modal) => {
  modal.addEventListener("click", function (e) {
    if (e.target === modal) {
      modal.style.display = "none";
      if (modal.id === "cafeModal") {
        currentCafeSessionIndex = null;
        currentCafeQuantities = {};
        originalCafeItems = [];
      }
    }
  });
});
setInterval(() => {
  const timeInput = document.getElementById("timeStart");
  if (timeInput && document.activeElement !== timeInput) {
    const now = new Date();
    timeInput.value = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  }
}, 1000);

function showRulesModal() {
  const modal = document.getElementById("rulesModal");
  const contentDiv = document.getElementById("rulesContent");
  if (!modal || !contentDiv) {
    console.error("مودال یا محتوای قوانین یافت نشد");
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

  modal.style.display = "flex";
  modal.style.zIndex = "2100";
}
function closeRulesModal() {
  const modal = document.getElementById("rulesModal");
  if (modal) modal.style.display = "none";
}

// ================== توابع ویرایش رزرو ==================
let editingReservationIndex = -1;

function populateEditReservationTables() {
  const select = document.getElementById("editReserveTableSelect");
  if (!select) return;
  select.innerHTML = "";
  // استفاده از آرایه DEVICES به جای TOTAL_TABLES
  for (let i = 0; i < DEVICES.length; i++) {
    let dev = DEVICES[i];
    let tableName = "میز " + (i + 1);
    let label = `${dev.name} (${dev.console}${dev.vip || dev.royal || dev.legendary ? " - VIP 👑" : ""})`;
    select.appendChild(new Option(label, tableName));
  }
}

function openEditReservationModal(index) {
  editingReservationIndex = index;
  let day = daySelect.value;
  let session = gameNet[day][index];
  if (!session || session.status !== "reserved") {
    customAlert("این رکورد وضعیت رزرو ندارد.");
    return;
  }
  populateEditReservationTables();
  document.getElementById("editReserveTableSelect").value = session.table;
  document.getElementById("editReserveTime").value = session.timeStart;
  document.getElementById("editReserveName").value = session.customerName || "";
  document.getElementById("editReservePhone").value =
    session.customerPhone || "";
  document.getElementById("editReserveNoteInput").value = session.note || "";
  document.getElementById("editReservationModal").style.display = "flex";
}

function closeEditReservationModal() {
  document.getElementById("editReservationModal").style.display = "none";
  editingReservationIndex = -1;
}

// ================== هندلر Enter در مودال‌ها ==================
function handleEnterInModals(e) {
  if (e.key !== "Enter") return;

  const activeEl = document.activeElement;
  // در textarea اجازه دهید Enter خط جدید ایجاد کند
  if (activeEl && activeEl.tagName === "TEXTAREA") return;

  // پیدا کردن تمام مودال‌های باز
  const openModals = Array.from(
    document.querySelectorAll(".modal-overlay"),
  ).filter((modal) => modal.style.display === "flex");
  if (openModals.length === 0) return;

  // اولویت با مودالی است که focus داخل آن قرار دارد، در غیر این صورت اولین مودال باز
  let targetModal =
    openModals.find((modal) => modal.contains(activeEl)) || openModals[0];

  let confirmBtn = null;
  switch (targetModal.id) {
    case "reserveModal":
      confirmBtn = targetModal.querySelector(".btn-primary"); // دکمه "ثبت رزرو"
      break;
    case "cafeModal":
      confirmBtn = targetModal.querySelector(".btn-primary"); // دکمه "ثبت سفارش"
      break;
    case "editModal":
      confirmBtn = targetModal.querySelector(".btn-success"); // دکمه "ذخیره تغییرات"
      break;
    case "changeModeModal":
      confirmBtn = targetModal.querySelector(".btn-success"); // دکمه "تایید و ثبت در سابقه"
      break;
    case "changeTableModal":
      confirmBtn = targetModal.querySelector(".btn-success"); // دکمه "انتقال مشتری"
      break;
    case "editReservationModal":
      confirmBtn = targetModal.querySelector(".btn-success"); // دکمه "ذخیره تغییرات"
      break;
    case "manageCafeModal":
      confirmBtn = document.getElementById("addCafeItemBtn"); // دکمه "افزودن به منو" یا "به‌روزرسانی"
      break;
    case "customModal":
      confirmBtn = document.getElementById("customModalConfirmBtn"); // دکمه "تأیید"
      break;
    default:
      return;
  }

  if (confirmBtn && confirmBtn.style.display !== "none") {
    e.preventDefault(); // جلوگیری از هرگونه submit ناخواسته
    confirmBtn.click();
  }
}

// ================== مدیریت دستگاه‌ها (جایگزین تنظیمات قدیم میزها و قیمت‌ها) ==================
let DEVICES = [];
let editingDeviceIndex = -1;

// تابع تعیین نوع قیمت‌گذاری پیش‌فرض بر اساس نام کنسول
function getDefaultPricingType(consoleName) {
  const consoleLower = consoleName.toLowerCase();
  // کنسول‌های بازی
  if (
    [
      "ps4",
      "ps5",
      "ps5 pro",
      "xbox x",
      "xbox s",
      "xbox one",
      "pc",
      "ps3",
      "nintendo",
    ].includes(consoleLower)
  ) {
    return "hourly_handles";
  }
  // دستگاه‌های گروهی (بیلیارد، فوتبال دستی، ...)
  if (
    [
      "بیلیارد",
      "فوتبال دستی",
      "دارت",
      "تنیس روی میز",
      "پینگ پنگ",
      "بسکتبال الکترونیک",
      "کرکره",
      "هوکی روی میز",
    ].includes(consoleName)
  ) {
    return "hourly_per_person";
  }
  // سایر (پیش‌فرض ثابت)
  return "hourly_fixed";
}
// تابع تعیین حالت‌های پیش‌فرض برای هر نوع قیمت‌گذاری
function getDefaultModesForPricingType(pricingType) {
  if (pricingType === "hourly_handles") {
    return ["1 دسته", "2 دسته", "3 دسته", "4 دسته", "معمولی", "VIP"];
  } else if (pricingType === "hourly_per_person") {
    return ["یک نفر", "دو نفر", "سه نفر", "چهار نفر و بیشتر"];
  } else {
    // hourly_fixed
    return ["معمولی"];
  }
}

// بارگذاری دستگاه‌ها از localStorage
function loadDevices() {
  const saved = localStorage.getItem("GAMENET_DEVICES");
  if (saved) {
    DEVICES = JSON.parse(saved);
    DEVICES.forEach((dev) => {
      if (!dev.pricingType)
        dev.pricingType = getDefaultPricingType(dev.console);
      if (!dev.modes || dev.modes.length === 0) {
        dev.modes = getDefaultModesForPricingType(dev.pricingType);
      }
      if (!dev.prices) dev.prices = {};
    });
  } else {
    // دستگاه‌های نمونه
    DEVICES = [
      {
        id: 1,
        name: "میز VIP یک",
        console: "PS5",
        pricingType: "hourly_handles",
        modes: ["1 دسته", "2 دسته", "3 دسته"],
        prices: { "1 دسته": 70000, "2 دسته": 80000, "3 دسته": 100000 },
        description: "صندلی راحت",
        vip: true,
        royal: false,
        legendary: false,
      },
      {
        id: 2,
        name: "میز معمولی",
        console: "PS4",
        pricingType: "hourly_handles",
        modes: ["1 دسته", "2 دسته"],
        prices: { "1 دسته": 50000, "2 دسته": 60000 },
        description: "",
        vip: false,
        royal: false,
        legendary: false,
      },
      {
        id: 3,
        name: "بیلیارد",
        console: "بیلیارد",
        pricingType: "hourly_per_person",
        modes: ["یک نفر", "دو نفر", "سه نفر", "چهار نفر و بیشتر"],
        prices: {
          "یک نفر": 25000,
          "دو نفر": 35000,
          "سه نفر": 45000,
          "چهار نفر و بیشتر": 55000,
        },
        description: "",
        vip: false,
        royal: false,
        legendary: false,
      },
      {
        id: 4,
        name: "فوتبال دستی",
        console: "فوتبال دستی",
        pricingType: "hourly_fixed",
        modes: ["معمولی"],
        prices: { معمولی: 40000 },
        description: "",
        vip: false,
        royal: false,
        legendary: false,
      },
    ];
    saveDevices();
  }
  rebuildTablesAndPricing();
  updateModeSelectOptions();
}

function saveDevices() {
  localStorage.setItem("GAMENET_DEVICES", JSON.stringify(DEVICES));
  rebuildTablesAndPricing();
  updateModeSelectOptions();
  if (typeof render === "function") render();
  if (typeof generateTableSelect === "function") generateTableSelect();
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
    if (dev.pricingType !== "hourly_handles") continue;
    let consoleKey = dev.console;
    if (consoleKey === "PS5 Pro") consoleKey = "PS5";
    if (consoleKey === "PS3") consoleKey = "PS4";
    if (["Xbox X", "Xbox S", "Xbox One"].includes(consoleKey))
      consoleKey = "Xbox";
    const isVip = dev.vip || dev.royal || dev.legendary;
    let targetKey = isVip ? `VIP_${consoleKey}` : consoleKey;
    if (!newPricing[targetKey]) newPricing[targetKey] = {};
    for (let mode of dev.modes) {
      if (dev.prices[mode]) newPricing[targetKey][mode] = dev.prices[mode];
    }
  }
  const defaultModes = [
    "1 دسته",
    "2 دسته",
    "3 دسته",
    "4 دسته",
    "معمولی",
    "VIP",
  ];
  const defaultPrice = 50000;
  for (let key in newPricing) {
    for (let mode of defaultModes) {
      if (!newPricing[key][mode]) newPricing[key][mode] = defaultPrice;
    }
  }
  PRICING = newPricing;

  localStorage.setItem("TABLE_CONFIGS", JSON.stringify(TABLE_CONFIGS));
  localStorage.setItem("PRICING", JSON.stringify(PRICING));
  localStorage.setItem("TOTAL_TABLES", TOTAL_TABLES.toString());

  if (typeof generateTableSelect === "function") generateTableSelect();
  if (typeof render === "function") render();
}

// ========== توابع UI مدیریت دستگاه‌ها ==========
async function openDeviceManager() {
  const authorized = await requirePasswordIfNeeded("manageDevices");
  if (!authorized) return;

  renderDevicesGrid();
  document.getElementById("deviceManagerModal").style.display = "flex";
}
function closeDeviceManager() {
  document.getElementById("deviceManagerModal").style.display = "none";
}

function renderDevicesGrid() {
  const grid = document.getElementById("devicesGrid");
  if (!grid) return;
  grid.innerHTML = "";
  if (DEVICES.length === 0) {
    grid.innerHTML =
      '<div style="grid-column:1/-1; text-align:center; padding:40px;">هیچ دستگاهی تعریف نشده است. دکمه افزودن را بزنید.</div>';
    return;
  }
  DEVICES.forEach((dev, idx) => {
    // تعیین آیکون بر اساس نام کنسول (با کلاس‌های صحیح Font Awesome 6)
    let consoleIcon = "fas fa-gamepad"; // پیش‌فرض
    const consoleLower = dev.console.toLowerCase();
    if (
      consoleLower === "ps5" ||
      consoleLower === "ps4" ||
      consoleLower === "ps3" ||
      consoleLower === "ps5 pro"
    ) {
      consoleIcon = "fab fa-playstation";
    } else if (consoleLower.includes("xbox")) {
      consoleIcon = "fab fa-xbox";
    } else if (consoleLower === "pc") {
      consoleIcon = "fas fa-desktop";
    } else if (consoleLower === "nintendo") {
      consoleIcon = "fab fa-nintendo-switch";
    } else if (
      [
        "بیلیارد",
        "فوتبال دستی",
        "دارت",
        "تنیس روی میز",
        "پینگ پنگ",
        "بسکتبال الکترونیک",
        "کرکره",
        "هوکی روی میز",
      ].includes(dev.console)
    ) {
      consoleIcon = "fas fa-dice-d6"; // آیکون مناسب برای بازی‌ها
    } else {
      consoleIcon = "fas fa-question-circle"; // برای سایر
    }

    let badges = "";
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
      pricesHtml += `
                <div class="price-item">
                    <span class="price-mode">${escapeHtml(mode)}</span>
                    <span class="price-value">${formatMoneyWithIcon(dev.prices[mode])}</span>
                </div>
            `;
    }
    pricesHtml += "</div>";

    const card = document.createElement("div");
    card.className = "device-card";
    card.innerHTML = `
            <div class="device-card-header">
                <div class="device-name-row">
                    <div class="device-title">
                        <i class="${consoleIcon}" style="font-size: 1.2rem; width: 1.5rem;"></i>
                        <span>${escapeHtml(dev.name)}</span>
                    </div>
                    <div class="device-badges">${badges}</div>
                </div>
                <div class="device-console-chip">
                    <i class="fas fa-microchip"></i> ${escapeHtml(dev.console)}
                </div>
            </div>
            <div class="device-card-body">
                ${pricesHtml}
                <div class="device-desc" title="${escapeHtml(dev.description || "")}">${dev.description ? escapeHtml(dev.description) : "—"}</div>
                <div class="device-actions">
                    <button class="btn btn-primary" onclick="editDevice(${idx})">✏️ ویرایش</button>
                    <button class="btn btn-danger" onclick="deleteDevice(${idx})">🗑️ حذف</button>
                </div>
            </div>
        `;
    grid.appendChild(card);
  });
}
function openDeviceForm(deviceIndex = -1) {
  try {
    editingDeviceIndex = deviceIndex;
    const formModal = document.getElementById("deviceFormModal");
    if (!formModal) {
      console.error("مودال deviceFormModal یافت نشد");
      return;
    }

    const form = document.getElementById("deviceForm");
    if (form) form.reset();
    document.getElementById("priceFieldsContainer").innerHTML = "";
    document.getElementById("customConsoleDiv").style.display = "none";

    const radioVip = document.querySelector(
      'input[name="specialStatus"][value="vip"]',
    );
    const radioRoyal = document.querySelector(
      'input[name="specialStatus"][value="royal"]',
    );
    const radioLegendary = document.querySelector(
      'input[name="specialStatus"][value="legendary"]',
    );
    const radioNone = document.querySelector(
      'input[name="specialStatus"][value="none"]',
    );

    const pricingTypeSelect = document.getElementById("pricingTypeSelect");
    const consoleSelect = document.getElementById("deviceConsole");
    const customConsoleDiv = document.getElementById("customConsoleDiv");

    const onConsoleChange = () => {
      let selectedConsole = consoleSelect.value;
      if (selectedConsole === "سایر") {
        customConsoleDiv.style.display = "block";
        pricingTypeSelect.value = "hourly_fixed";
      } else {
        customConsoleDiv.style.display = "none";
        const autoType = getDefaultPricingType(selectedConsole);
        pricingTypeSelect.value = autoType;
      }
      updateModesAndPricesByType(true);
    };

    consoleSelect.onchange = onConsoleChange;
    if (pricingTypeSelect)
      pricingTypeSelect.onchange = () => updateModesAndPricesByType(true);

    if (deviceIndex >= 0 && DEVICES[deviceIndex]) {
      const dev = DEVICES[deviceIndex];
      document.getElementById("deviceFormTitle").innerText = "✏️ ویرایش دستگاه";
      document.getElementById("deviceName").value = dev.name;

      const consoleOptions = Array.from(consoleSelect.options).map(
        (o) => o.value,
      );
      if (consoleOptions.includes(dev.console)) {
        consoleSelect.value = dev.console;
        if (dev.console === "سایر") {
          customConsoleDiv.style.display = "block";
          document.getElementById("customConsoleName").value =
            dev.customConsoleName || "";
        }
      } else {
        consoleSelect.value = "سایر";
        customConsoleDiv.style.display = "block";
        document.getElementById("customConsoleName").value = dev.console;
      }

      document.getElementById("deviceDesc").value = dev.description || "";

      if (dev.vip) radioVip.checked = true;
      else if (dev.royal) radioRoyal.checked = true;
      else if (dev.legendary) radioLegendary.checked = true;
      else radioNone.checked = true;

      pricingTypeSelect.value =
        dev.pricingType || getDefaultPricingType(dev.console);
      updateModesAndPricesByType(false);
      // ابتدا چک‌باکس‌های مربوط به حالت‌های دستگاه را تیک بزن
      document.querySelectorAll(".mode-check").forEach((cb) => {
        if (dev.modes.includes(cb.value)) {
          cb.checked = true;
        } else {
          cb.checked = false;
        }
      });

      // حالا فیلدهای قیمت را بر اساس چک‌باکس‌های تیک خورده بساز
      updatePriceFieldsByModes();

      // سپس مقادیر قیمت را در فیلدهای تازه ساخته شده قرار بده
      for (let mode of dev.modes) {
        const input = document.getElementById(
          `price_${mode.replace(/ /g, "_")}`,
        );
        if (input && dev.prices[mode]) {
          input.value = formatNumberWithCommas(dev.prices[mode]);
        }
      }
    } else {
      document.getElementById("deviceFormTitle").innerText =
        "➕ افزودن دستگاه جدید";
      radioNone.checked = true;
      // اجرای تغییر کنسول برای تنظیم نوع پیش‌فرض
      onConsoleChange();
    }

    // مهم: نمایش مودال حتی اگر خطایی در قسمت‌های بالا رخ داده باشد
    formModal.style.display = "flex";
  } catch (err) {
    console.error("خطا در openDeviceForm:", err);
    customAlert("خطا در باز کردن فرم دستگاه. لطفاً صفحه را رفرش کنید.");
    // تلاش مجدد برای نمایش مودال (بدون محتوا)
    const modal = document.getElementById("deviceFormModal");
    if (modal) modal.style.display = "flex";
  }
}

function updateModesAndPricesByType(resetPrices = true) {
  const pricingType = document.getElementById("pricingTypeSelect").value;
  const modesContainer = document.getElementById("modesContainer");
  const priceFieldsContainer = document.getElementById("priceFieldsContainer");

  if (!modesContainer || !priceFieldsContainer) return;

  modesContainer.innerHTML = "";
  priceFieldsContainer.innerHTML = "";

  let checkboxesHtml = "";
  let defaultModes = getDefaultModesForPricingType(pricingType);

  if (pricingType === "hourly_handles") {
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
  } else if (pricingType === "hourly_fixed") {
    checkboxesHtml = `
      <label>نوع تعرفه</label>
      <div style="display: flex; gap: 15px; flex-wrap: wrap;">
        <label><input type="checkbox" class="mode-check" value="معمولی" ${defaultModes.includes("معمولی") ? "checked" : ""}> معمولی</label>
      </div>
    `;
  } else if (pricingType === "hourly_per_person") {
    checkboxesHtml = `
      <label>تعداد نفرات</label>
      <div style="display: flex; gap: 15px; flex-wrap: wrap;">
        <label><input type="checkbox" class="mode-check" value="یک نفر" ${defaultModes.includes("یک نفر") ? "checked" : ""}> یک نفر</label>
        <label><input type="checkbox" class="mode-check" value="دو نفر" ${defaultModes.includes("دو نفر") ? "checked" : ""}> دو نفر</label>
        <label><input type="checkbox" class="mode-check" value="سه نفر" ${defaultModes.includes("سه نفر") ? "checked" : ""}> سه نفر</label>
        <label><input type="checkbox" class="mode-check" value="چهار نفر و بیشتر" ${defaultModes.includes("چهار نفر و بیشتر") ? "checked" : ""}> چهار نفر و بیشتر</label>
      </div>
    `;
  }
  modesContainer.innerHTML = checkboxesHtml;

  // تابع ساخت فیلدهای قیمت
  const buildPriceFields = () => {
    priceFieldsContainer.innerHTML = "";
    const selectedModes = Array.from(
      document.querySelectorAll(".mode-check:checked"),
    ).map((cb) => cb.value);
    selectedModes.forEach((mode) => {
      const div = document.createElement("div");
      div.className = "price-input-group";
      const safeId = `price_${mode.replace(/ /g, "_")}`;
      div.innerHTML = `
        <label>قیمت ساعتی (${mode}):</label>
        <input type="text" id="${safeId}" class="price-input" 
               placeholder="مثلاً 50,000 ${currentPriceUnit}" 
               oninput="this.value = formatNumberWithCommas(this.value.replace(/,/g, ''))">
      `;
      priceFieldsContainer.appendChild(div);
    });
  };

  // اتصال رویداد تغییر چک‌باکس‌ها
  const attachCheckboxEvents = () => {
    const modeChecks = document.querySelectorAll(".mode-check");
    modeChecks.forEach((cb) => {
      cb.removeEventListener("change", buildPriceFields);
      cb.addEventListener("change", buildPriceFields);
    });
  };

  attachCheckboxEvents();
  if (resetPrices) buildPriceFields();
}

function closeDeviceForm() {
  document.getElementById("deviceFormModal").style.display = "none";
  editingDeviceIndex = -1;
}

function updatePriceFieldsByModes() {
  const container = document.getElementById("priceFieldsContainer");
  if (!container) return;
  const selectedModes = Array.from(
    document.querySelectorAll(".mode-check:checked"),
  ).map((cb) => cb.value);
  container.innerHTML = "";
  for (let mode of selectedModes) {
    const div = document.createElement("div");
    div.className = "input-group";
    div.style.marginBottom = "10px";
    div.innerHTML = `
            <label>💰 قیمت ساعتی برای ${mode}</label>
            <input type="text" id="price_${mode.replace(/ /g, "_")}" placeholder="مبلغ به ${currentPriceUnit === "Rial" ? "ریال" : "تومان"}" oninput="liveNumberFormat(this)">
        `;
    container.appendChild(div);
  }
}

// ذخیره دستگاه از فرم
function saveDeviceFromForm() {
  const name = document.getElementById("deviceName").value.trim();
  if (!name) {
    customAlert("نام دستگاه الزامی است");
    return;
  }

  let consoleVal = document.getElementById("deviceConsole").value;
  if (consoleVal === "سایر") {
    const customName = document
      .getElementById("customConsoleName")
      .value.trim();
    if (!customName) {
      customAlert("لطفاً نام دستگاه را وارد کنید");
      return;
    }
    consoleVal = customName;
  }

  const description = document.getElementById("deviceDesc").value;
  let vip = false,
    royal = false,
    legendary = false;
  const selectedSpecial = document.querySelector(
    'input[name="specialStatus"]:checked',
  );
  if (selectedSpecial) {
    switch (selectedSpecial.value) {
      case "vip":
        vip = true;
        break;
      case "royal":
        royal = true;
        break;
      case "legendary":
        legendary = true;
        break;
    }
  }

  const pricingType = document.getElementById("pricingTypeSelect").value;
  const selectedModes = Array.from(
    document.querySelectorAll(".mode-check:checked"),
  ).map((cb) => cb.value);
  if (selectedModes.length === 0) {
    customAlert("حداقل یک گزینه باید انتخاب شود");
    return;
  }

  const prices = {};
  for (let mode of selectedModes) {
    let inputId = `price_${mode.replace(/ /g, "_")}`;
    const input = document.getElementById(inputId);
    if (!input) {
      customAlert(`قیمت برای ${mode} یافت نشد`);
      return;
    }
    let priceVal = parseNumberFromFormatted(input.value);
    if (currentPriceUnit === "Rial") priceVal = Math.round(priceVal / 10);
    if (isNaN(priceVal) || priceVal <= 0) {
      customAlert(`قیمت برای ${mode} نامعتبر است`);
      return;
    }
    prices[mode] = priceVal;
  }

  const newDevice = {
    id: editingDeviceIndex >= 0 ? DEVICES[editingDeviceIndex].id : Date.now(),
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

  if (editingDeviceIndex >= 0) {
    DEVICES[editingDeviceIndex] = newDevice;
  } else {
    DEVICES.push(newDevice);
  }
  saveDevices();
  closeDeviceForm();
  renderDevicesGrid();
}

function deleteDevice(index) {
  const device = DEVICES[index];
  const tableName = "میز " + (index + 1);

  // بررسی همه روزهای هفته برای وجود جلسه فعال روی این میز
  let hasActiveSession = false;
  for (let day of DAYS) {
    const sessions = gameNet[day] || [];
    if (sessions.some((s) => s.table === tableName && s.status === "active")) {
      hasActiveSession = true;
      break;
    }
  }

  if (hasActiveSession) {
    customAlert(
      `❌ نمی‌توان دستگاه "${device.name}" را حذف کرد، زیرا هم‌اکنون یک جلسه فعال روی این میز وجود دارد.`,
    );
    return;
  }

  customConfirm(`آیا از حذف دستگاه "${device.name}" مطمئن هستید؟`).then(
    (ok) => {
      if (ok) {
        DEVICES.splice(index, 1);
        saveDevices();
        renderDevicesGrid();
        // در صورت لزوم، بازسازی جدول و انتخاب‌گر میزها
        generateTableSelect();
        render();
      }
    },
  );
}

function editDevice(index) {
  openDeviceForm(index);
}

// ================== سطل آشغال (جلسات حذف شده) ==================
let deletedSessions = []; // هر عنصر شامل { session, deletedAt, originalDay }

function loadDeletedSessions() {
  const saved = localStorage.getItem("DELETED_SESSIONS");
  if (saved) {
    deletedSessions = JSON.parse(saved);
  } else {
    deletedSessions = [];
  }
}

function saveDeletedSessions() {
  localStorage.setItem("DELETED_SESSIONS", JSON.stringify(deletedSessions));
}

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
  finalTotal,
) {
  let session = gameNet[day]?.[index];
  if (!session) return;
  let now = new Date();
  let nowStr = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
  let calc = calculateCost(session, nowStr);
  let message = `تخفیف ${discountAmount.toLocaleString()} ${unitLabel} (قبل از تخفیف: ${subtotalBeforeDiscount.toLocaleString()} ${unitLabel}، پس از تخفیف: ${finalTotal.toLocaleString()} ${unitLabel})`;
  addSessionLog(
    day,
    index,
    "تخفیف",
    message,
    calc.gameCost,
    session.cafeCost || 0,
  );
}

// مدیریت همزمان دو فیلد تخفیف (در مودال ویرایش)
function setupDiscountFieldsSync() {
  const percentInput = document.getElementById("editDiscountPercent");
  const fixedInput = document.getElementById("editDiscountFixed");
  if (!percentInput || !fixedInput) return;

  percentInput.oninput = () => {
    if (percentInput.value && parseFloat(percentInput.value) > 0) {
      fixedInput.value = "";
    }
  };
  fixedInput.oninput = () => {
    let fixedVal = parseNumberFromFormatted(fixedInput.value);
    if (fixedVal > 0) {
      percentInput.value = "";
    }
  };
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
document.getElementById("deviceForm")?.addEventListener("submit", (e) => {
  e.preventDefault();
  saveDeviceFromForm();
});

// افزودن شنونده رویداد در سطح سند
document.addEventListener("keydown", handleEnterInModals);

document.addEventListener("change", function (e) {
  if (e.target.classList && e.target.classList.contains("mode-check")) {
    updatePriceFieldsByModes();
  }
});

document.addEventListener("DOMContentLoaded", function () {
  // اتصال دکمه افزودن دستگاه جدید (فقط یک بار و در زمان مناسب)
  const addDeviceBtn = document.getElementById("addNewDeviceBtn");
  if (addDeviceBtn) {
    addDeviceBtn.addEventListener("click", () => openDeviceForm(-1));
  }

  const themeSelect = document.getElementById("themeSelect");
  if (themeSelect) {
    themeSelect.addEventListener("change", function (e) {
      changeTheme(e.target.value);
    });
  }
  // بررسی وجود توکن برای لاگین خودکار
  checkAuthOnLoad();

  // اتصال دکمه لاگین (بدون onclick در HTML)
  const loginBtn = document.querySelector(".btn-login");
  if (loginBtn) {
    loginBtn.removeAttribute("onclick");
    loginBtn.addEventListener("click", checkLogin);
  }
});
