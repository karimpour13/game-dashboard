const Session = require("./session.model");
const CafeItem = require("../cafe/cafe.model");
const Device = require("../device/device.model");
const { calculateCost } = require("../../services/pricingService");
const { decreaseStock, increaseStock } = require("../cafe/cafe.service");

// helper: دریافت تنظیمات گیم‌نت
async function getGameNetSettings(gameNetId) {
  const GameNet = require("../gameNet/gameNet.model");
  const gameNet = await GameNet.findById(gameNetId);
  if (!gameNet) throw new Error("GameNet not found");
  return gameNet.settings;
}

// شروع جلسه فعال (بدون رزرو)
async function startSession(data, gameNetId) {
  const session = await Session.create({
    ...data,
    gameNetId,
    status: "active",
    startTimeMs: Date.now(),
  });
  // لاگ شروع
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "شروع بازی",
    message: `شروع بازی روی ${data.table} با حالت ${data.mode}`,
    gameCost: 0,
    cafeCost: 0,
  });
  await session.save();
  return session;
}

// رزرو میز
async function reserveSession(data, gameNetId) {
  const session = await Session.create({
    ...data,
    gameNetId,
    status: "reserved",
  });
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "رزرو",
    message: `رزرو میز ${data.table} برای ${data.customerName} ساعت ${data.timeStart}`,
    gameCost: 0,
    cafeCost: 0,
  });
  await session.save();
  return session;
}

// شروع از رزرو (تبدیل رزرو به فعال)
async function startReservedSession(sessionId, gameNetId) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== "reserved")
    throw new Error("Invalid reservation");
  session.status = "active";
  session.startTimeMs = Date.now();
  session.timeStart = new Date().toLocaleTimeString("fa-IR", {
    hour: "2-digit",
    minute: "2-digit",
  });
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "شروع بازی",
    message: `شروع جلسه از حالت رزرو`,
    gameCost: 0,
    cafeCost: session.cafeCost,
  });
  await session.save();
  return session;
}

// بستن جلسه فعال
async function closeSession(sessionId, gameNetId, endTimeStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== "active")
    throw new Error("Session not active");
  const settings = await getGameNetSettings(gameNetId);
  const {
    gameCost,
    totalMinutes,
    effectiveMinutes,
    weightedAvgRate,
    hasChanges,
  } = await calculateCost(session, endTimeStr, settings);
  session.timeEnd = endTimeStr;
  const safeGameCost = isNaN(gameCost) ? 0 : gameCost;
  session.gameCost = safeGameCost;
  let subtotal = gameCost + session.cafeCost - session.paidAmount;
  let discountAmount = 0;
  if (session.discountFixed > 0) discountAmount = session.discountFixed;
  else if (session.discountPercent > 0)
    discountAmount = Math.round((subtotal * session.discountPercent) / 100);
  let finalTotal = Math.max(0, subtotal - discountAmount);
  session.totalAmount = finalTotal;
  session.status = "closed";
  // لاگ بستن با جزئیات بازه‌ها (برای سادگی می‌توان پیام HTML ذخیره کرد)
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "بستن جلسه",
    message: `جلسه بسته شد. زمان کل: ${totalMinutes} دقیقه، هزینه بازی: ${gameCost}، هزینه کافه: ${session.cafeCost}، تخفیف: ${discountAmount}، قابل پرداخت: ${finalTotal}`,
    gameCost,
    cafeCost: session.cafeCost,
  });
  await session.save();
  // کاهش موجودی کافه (در تراکنش باید انجام شود، فعلاً ساده)
  for (let item of session.cafeItems) {
    await decreaseStock(item.id, item.qty, gameNetId);
  }
  return session;
}

// تغییر دسته (در جلسه فعال)
async function changeMode(sessionId, gameNetId, newMode, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== "active")
    throw new Error("Session not active");
  const lastStart =
    session.history.length > 0
      ? session.history[session.history.length - 1].end
      : session.timeStart;
  // ثبت بازه قبلی
  session.history.push({
    start: lastStart,
    end: nowStr,
    mode: session.mode,
    consoleType: session.consoleType,
    table: session.table,
    action: `تغییر دسته از ${session.mode} به ${newMode}`,
  });
  // تغییر mode فعلی
  const oldMode = session.mode;
  session.mode = newMode;
  // لاگ
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "تغییر دسته",
    message: `تغییر دسته از ${oldMode} به ${newMode} در ساعت ${nowStr}`,
    gameCost: 0,
    cafeCost: session.cafeCost,
  });
  await session.save();
  return session;
}

// انتقال میز
async function changeTable(sessionId, gameNetId, newTable, newMode, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== "active")
    throw new Error("Session not active");
  const lastStart =
    session.history.length > 0
      ? session.history[session.history.length - 1].end
      : session.timeStart;
  session.history.push({
    start: lastStart,
    end: nowStr,
    mode: session.mode,
    consoleType: session.consoleType,
    table: session.table,
    action: `انتقال میز از ${session.table} به ${newTable}`,
  });
  const oldTable = session.table;
  session.table = newTable;
  if (newMode && newMode !== session.mode) {
    session.mode = newMode;
  }
  // به‌روزرسانی consoleType از دستگاه جدید
  const device = await Device.findOne({ gameNetId, name: newTable });
  if (device) session.consoleType = device.console;
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "انتقال میز",
    message: `انتقال میز از ${oldTable} به ${newTable}${newMode ? ` و تغییر دسته به ${newMode}` : ""} در ساعت ${nowStr}`,
    gameCost: 0,
    cafeCost: session.cafeCost,
  });
  await session.save();
  return session;
}

// افزودن سفارش کافه به جلسه فعال یا بسته شده (با لاگ و به‌روزرسانی موجودی)
async function addCafeOrder(sessionId, gameNetId, items) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error("Session not found");
  // items: آرایه‌ای از { id, qty }
  let changes = [];
  let newCafeCost = session.cafeCost;
  for (let item of items) {
    const cafeItem = await CafeItem.findOne({ _id: item.id, gameNetId });
    if (!cafeItem) throw new Error(`Cafe item ${item.id} not found`);
    const existing = session.cafeItems.find((i) => i.id.toString() === item.id);
    const oldQty = existing ? existing.qty : 0;
    const delta = item.qty - oldQty;
    if (delta !== 0) {
      if (delta > 0 && delta > cafeItem.stock)
        throw new Error(`موجودی ${cafeItem.name} کافی نیست`);
      if (delta > 0) await decreaseStock(item.id, delta, gameNetId);
      else if (delta < 0) await increaseStock(item.id, -delta, gameNetId);
      if (existing) existing.qty = item.qty;
      else
        session.cafeItems.push({
          id: cafeItem._id,
          name: cafeItem.name,
          price: cafeItem.price,
          qty: item.qty,
        });
      newCafeCost += delta * cafeItem.price;
      changes.push(`${cafeItem.name}: ${oldQty} → ${item.qty}`);
    }
  }
  session.cafeCost = newCafeCost;
  // لاگ
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "تغییر سفارش کافه",
    message: `سفارش کافه: ${changes.join(", ")}`,
    gameCost: 0,
    cafeCost: newCafeCost,
  });
  await session.save();
  return session;
}

// افزودن پیش‌پرداخت
async function addPayment(sessionId, gameNetId, amount) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error("Session not found");
  session.paidAmount += amount;
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "پرداخت",
    message: `پرداخت مبلغ ${amount} تومان`,
    gameCost: 0,
    cafeCost: session.cafeCost,
  });
  await session.save();
  return session;
}

// ویرایش جلسه (فقط زمان شروع/پایان، دسته، تخفیف، یادداشت) – با محاسبه مجدد هزینه
async function editSession(sessionId, gameNetId, updates, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error("Session not found");
  const oldSession = JSON.parse(JSON.stringify(session));
  // اعمال تغییرات
  if (updates.timeStart) session.timeStart = updates.timeStart;
  if (updates.timeEnd && session.status === "closed")
    session.timeEnd = updates.timeEnd;
  if (updates.mode) session.mode = updates.mode;
  if (updates.discountPercent !== undefined)
    session.discountPercent = updates.discountPercent;
  if (updates.discountFixed !== undefined)
    session.discountFixed = updates.discountFixed;
  if (updates.note !== undefined) session.note = updates.note;

  // اگر جلسه بسته است، هزینه را دوباره محاسبه کن
  if (session.status === "closed") {
    const settings = await getGameNetSettings(gameNetId);
    const { gameCost } = await calculateCost(
      session,
      session.timeEnd,
      settings,
    );
    session.gameCost = gameCost;
    let subtotal = gameCost + session.cafeCost - session.paidAmount;
    let discountAmount =
      session.discountFixed > 0
        ? session.discountFixed
        : session.discountPercent > 0
          ? Math.round((subtotal * session.discountPercent) / 100)
          : 0;
    session.totalAmount = Math.max(0, subtotal - discountAmount);
  }
  // لاگ ویرایش
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "ویرایش رکورد",
    message: `ویرایش اطلاعات: ${Object.keys(updates).join(", ")}`,
    gameCost: session.gameCost || 0,
    cafeCost: session.cafeCost,
  });
  await session.save();
  return session;
}

// حذف جلسه (انتقال به سطل آشغال)
async function deleteSession(sessionId, gameNetId, originalDay) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error("Session not found");
  // بازگرداندن موجودی کافه
  for (let item of session.cafeItems) {
    await increaseStock(item.id, item.qty, gameNetId);
  }
  const DeletedSession = require("../deletedSession/deletedSession.model");
  await DeletedSession.create({
    gameNetId,
    session: session.toObject(),
    deletedAt: new Date(),
    originalDay,
  });
  await session.deleteOne();
  return true;
}

// دریافت جلسات یک روز خاص (با فیلتر status)
async function getSessionsByDay(gameNetId, day, date) {
  // day نام روز هفته، date تاریخ شمسی
  const filter = { gameNetId, date };
  if (day) filter.reservedDay = day; // برای رزروها که بر اساس روز هفته فیلتر شوند
  // بهتر است از date استفاده کنیم چون unique است
  return Session.find({ gameNetId, date }).sort({ createdAt: -1 });
}

const reactivateSession = async (sessionId, gameNetId) => {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error("Session not found");
  if (session.status !== "closed")
    throw new Error("Only closed sessions can be reactivated");

  const activeExists = await Session.findOne({
    gameNetId,
    table: session.table,
    status: "active",
  });

  if (activeExists) {
    throw new Error(`میز هم‌اکنون فعال است. ابتدا جلسه فعال را ببندید.`);
  }

  const now = new Date();
  const newTimeStart = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

  session.status = "active";
  session.timeStart = newTimeStart;
  session.timeEnd = null;
  session.startTimeMs = Date.now();
  session.logs.push({
    timestamp: new Date().toLocaleTimeString("fa-IR"),
    eventType: "ادامه جلسه",
    message: `جلسه بسته شده در ${session.timeEnd} دوباره فعال شد.`,
    gameCost: 0,
    cafeCost: session.cafeCost || 0,
  });
  await session.save();
  return session;
};
module.exports = {
  startSession,
  reserveSession,
  startReservedSession,
  closeSession,
  changeMode,
  changeTable,
  addCafeOrder,
  addPayment,
  editSession,
  deleteSession,
  getSessionsByDay,
  reactivateSession,
};
