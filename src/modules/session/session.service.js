const Session = require('./session.model');
const CafeItem = require('../cafe/cafe.model');
const Device = require('../device/device.model');
const {
  calculateCost,
  getPricingRate,
  getPeriodCost,
  calculateCostWithDetails,
} = require('../../services/pricingService');
const { decreaseStock, increaseStock } = require('../cafe/cafe.service');
const { getReserveTimestamp } = require('../../utils/helpers');
const User = require('../user/user.model');
// helper: دریافت تنظیمات گیم‌نت
async function getGameNetSettings(gameNetId) {
  const GameNet = require('../gameNet/gameNet.model');
  const gameNet = await GameNet.findById(gameNetId);
  if (!gameNet) throw new Error('GameNet not found');
  return gameNet.settings;
}

// شروع جلسه فعال (بدون رزرو)
async function startSession(data, gameNetId, reqUserId) {
  const user = await User.findById(reqUserId).populate('gameNetId');
  if (!user) throw new Error('User not found');

  // چک انقضای کاربر
  if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
    throw new Error('حساب کاربری شما منقضی شده است.');
  }

  // چک انقضای گیم‌نت
  if (user.role === 'admin' && user.gameNetId) {
    if (!user.gameNetId.isActive) {
      throw new Error('گیم‌نت غیرفعال است');
    }
    if (new Date() > new Date(user.gameNetId.expiresAt)) {
      throw new Error('اشتراک گیم‌نت شما منقضی شده است.');
    }
  }
  const session = await Session.create({
    ...data,
    gameNetId,
    status: 'active',
    startTimeMs: Date.now(),
  });
  // لاگ شروع
  const rate = await getPricingRate(
    data.consoleType,
    data.mode,
    data.table,
    gameNetId
  );
  session.logs.push({
    type: 'session_start',
    timestamp: Date.now(),
    data: {
      table: data.table,
      mode: data.mode,
      consoleType: data.consoleType,
      timeStart: data.timeStart,
      pricingRate: rate,
      gameCost: 0,
      cafeCost: 0,
    },
  });
  await session.save();
  return session;
}

// رزرو میز
async function reserveSession(data, gameNetId, reqUserId) {
  const user = await User.findById(reqUserId).populate('gameNetId');
  if (!user) throw new Error('User not found');

  // چک انقضای کاربر
  if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
    throw new Error('حساب کاربری شما منقضی شده است.');
  }

  // چک انقضای گیم‌نت
  if (user.role === 'admin' && user.gameNetId) {
    if (!user.gameNetId.isActive) {
      throw new Error('گیم‌نت غیرفعال است');
    }
    if (new Date() > new Date(user.gameNetId.expiresAt)) {
      throw new Error('اشتراک گیم‌نت شما منقضی شده است.');
    }
  }
  // ========== چک کردن فعال بودن میز ==========
  const activeSession = await Session.findOne({
    gameNetId,
    table: data.table,
    status: 'active',
  });

  if (activeSession && !data.ignoreWarning) {
    const error = new Error(
      'این میز در حال حاضر فعال است. آیا مطمئن هستید که می‌خواهید آن را رزرو کنید؟'
    );
    error.status = 409;
    error.code = 'ACTIVE_TABLE_WARNING';
    throw error;
  }
  const reserveDateTime = getReserveTimestamp(data.date, data.timeStart);
  const session = await Session.create({
    ...data,
    gameNetId,
    status: 'reserved',
    reserveTimestamp: reserveDateTime,
  });

  session.logs.push({
    type: 'reservation',
    timestamp: Date.now(),
    data: {
      table: data.table,
      timeStart: data.timeStart,
      customerName: data.customerName,
      customerPhone: data.customerPhone,
      reservedDay: data.reservedDay,
    },
  });
  await session.save();
  return session;
}

// شروع از رزرو (تبدیل رزرو به فعال)
async function startReservedSession(sessionId, gameNetId) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== 'reserved')
    throw new Error('رزرو معتبر نیست.');

  // ========== چک کردن فعال بودن میز ==========
  const activeSession = await Session.findOne({
    gameNetId,
    table: session.table,
    status: 'active',
    _id: { $ne: sessionId }, // غیر از خود جلسه (برای اطمینان)
  });

  if (activeSession) {
    const error = new Error(
      `میز "${session.table}" در حال حاضر فعال است. لطفاً ابتدا جلسه فعال را ببندید.`
    );
    error.status = 409;
    throw error;
  }

  // ذخیره مقادیر مورد نیاز برای لاگ (قبل از تغییر)
  const table = session.table;
  const mode = session.mode;
  const consoleType = session.consoleType;

  // تبدیل وضعیت به active
  session.status = 'active';
  session.startTimeMs = Date.now();
  const now = new Date();
  const actualStart = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  session.timeStart = actualStart;

  // محاسبه نرخ ساعتی
  const rate = await getPricingRate(consoleType, mode, table, gameNetId);

  // ثبت لاگ (فقط ۵ فیلد)
  session.logs.push({
    type: 'reservation_start',
    timestamp: Date.now(),
    data: {
      table,
      mode,
      consoleType,
      actualStart,
      pricingRate: rate,
    },
  });

  await session.save();
  return session;
}

// بستن جلسه فعال
async function closeSession(sessionId, gameNetId, endTimeStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== 'active')
    throw new Error('Session not active');

  const settings = await getGameNetSettings(gameNetId);
  const {
    gameCost,
    totalMinutes,
    effectiveMinutes,
    weightedAvgRate,
    hasChanges,
    periodsDetails,
  } = await calculateCostWithDetails(session, endTimeStr, settings);

  session.timeEnd = endTimeStr;
  session.gameCost = gameCost;

  let extraAmount = 0;
  if (session.extraFixed > 0) extraAmount = session.extraFixed;
  else if (session.extraPercent > 0)
    extraAmount = Math.round(
      ((gameCost + session.cafeCost) * session.extraPercent) / 100
    );

  let afterExtra =
    gameCost + session.cafeCost - session.paidAmount + extraAmount;
  let discountAmount = 0;
  if (session.discountFixed > 0) discountAmount = session.discountFixed;
  else if (session.discountPercent > 0)
    discountAmount = Math.round((afterExtra * session.discountPercent) / 100);
  let finalTotal = Math.max(0, afterExtra - discountAmount);

  session.totalAmount = finalTotal;
  session.status = 'closed';

  session.logs.push({
    type: 'session_close',
    timestamp: Date.now(),
    data: {
      endTime: endTimeStr,
      totalMinutes,
      effectiveMinutes,
      weightedAvgRate,
      hasChanges,
      periodsDetails,
      gameCost,
      cafeCost: session.cafeCost,
      paidAmount: session.paidAmount,
      extraAmount,
      discountAmount,
      extraPercent: session.extraPercent,
      extraFixed: session.extraFixed,
      finalTotal,
      cafeItems: session.cafeItems,
      useMinimumHour: settings.useMinimumHour,
    },
  });

  for (let item of session.cafeItems) {
    await decreaseStock(item.id, item.qty, gameNetId);
  }

  await session.save();
  return session;
}

// تغییر دسته (در جلسه فعال)

async function changeMode(sessionId, gameNetId, newMode, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== 'active')
    throw new Error('Session not active');

  // محاسبه آخرین بازه (از زمان شروع یا آخرین تغییر تا لحظه حال)
  const lastStart =
    session.history.length > 0
      ? session.history[session.history.length - 1].end
      : session.timeStart;
  const {
    minutes,
    rate: oldRate,
    cost,
  } = await getPeriodCost(
    lastStart,
    nowStr,
    session.mode,
    session.consoleType,
    session.table,
    gameNetId,
    getPricingRate
  );

  const oldMode = session.mode;

  // ثبت تاریخچه
  session.history.push({
    start: lastStart,
    end: nowStr,
    mode: oldMode,
    consoleType: session.consoleType,
    table: session.table,
    action: `تغییر دسته از ${oldMode} به ${newMode}`,
  });

  // به‌روزرسانی جلسه
  session.mode = newMode;
  session.gameCost = (session.gameCost || 0) + cost;

  const newRate = await getPricingRate(
    session.consoleType,
    newMode,
    session.table,
    gameNetId
  );

  // ذخیره لاگ با اطلاعات کامل
  session.logs.push({
    type: 'mode_change',
    timestamp: Date.now(),
    data: {
      oldMode,
      newMode,
      changeTime: nowStr,
      table: session.table,
      consoleType: session.consoleType,
      oldRate,
      newRate,
      minutesSpent: minutes, // مدت زمان بازه قبلی
      costOfPeriod: cost, // هزینه بازه قبلی
      gameCost: session.gameCost,
      cafeCost: session.cafeCost,
    },
  });

  await session.save();
  return session;
}

// انتقال میز

async function changeTable(sessionId, gameNetId, newTable, newMode, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session || session.status !== 'active')
    throw new Error('Session not active');

  // محاسبه آخرین بازه (از زمان شروع یا آخرین تغییر تا لحظه حال)
  const lastStart =
    session.history.length > 0
      ? session.history[session.history.length - 1].end
      : session.timeStart;

  const {
    minutes,
    rate: oldRate,
    cost,
  } = await getPeriodCost(
    lastStart,
    nowStr,
    session.mode,
    session.consoleType,
    session.table,
    gameNetId,
    getPricingRate
  );

  const oldTable = session.table;
  const oldMode = session.mode;
  const oldConsole = session.consoleType;

  // ثبت تاریخچه
  session.history.push({
    start: lastStart,
    end: nowStr,
    mode: oldMode,
    consoleType: oldConsole,
    table: oldTable,
    action: `انتقال میز از ${oldTable} به ${newTable}`,
  });

  // اعمال تغییرات
  session.table = newTable;
  if (newMode && newMode !== oldMode) {
    session.mode = newMode;
  }
  // به‌روزرسانی consoleType از دستگاه جدید
  const device = await Device.findOne({ gameNetId, name: newTable });
  if (device) session.consoleType = device.console;

  // به‌روزرسانی هزینه بازی
  session.gameCost = (session.gameCost || 0) + cost;

  // محاسبه نرخ ساعتی میز جدید برای حالت جدید (یا همان حالت قدیم)
  const newRate = await getPricingRate(
    session.consoleType,
    session.mode,
    newTable,
    gameNetId
  );

  // ذخیره لاگ با اطلاعات کامل
  session.logs.push({
    type: 'table_change',
    timestamp: Date.now(),
    data: {
      oldTable,
      newTable,
      oldMode,
      newMode: session.mode,
      changeTime: nowStr,
      consoleType: session.consoleType,
      oldRate,
      newRate,
      minutesSpent: minutes,
      costOfPeriod: cost,
      gameCost: session.gameCost,
      cafeCost: session.cafeCost,
    },
  });

  await session.save();
  return session;
}
// افزودن سفارش کافه به جلسه فعال یا بسته شده (با لاگ و به‌روزرسانی موجودی)
async function addCafeOrder(sessionId, gameNetId, items) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error('Session not found');

  let changes = []; // آرایه تغییرات
  let newCafeCost = session.cafeCost;

  for (let item of items) {
    const cafeItem = await CafeItem.findOne({ _id: item.id, gameNetId });
    if (!cafeItem) throw new Error(`Cafe item ${item.id} not found`);

    const existing = session.cafeItems.find((i) => i.id.toString() === item.id);
    const oldQty = existing ? existing.qty : 0;
    const delta = item.qty - oldQty;

    if (delta !== 0) {
      // بررسی موجودی
      if (delta > 0 && delta > cafeItem.stock)
        throw new Error(`موجودی ${cafeItem.name} کافی نیست`);

      // به‌روزرسانی موجودی (با فرض وجود decreaseStock و increaseStock)
      if (delta > 0) await decreaseStock(item.id, delta, gameNetId);
      else if (delta < 0) await increaseStock(item.id, -delta, gameNetId);

      // به‌روزرسانی cafeItems در session
      if (existing) existing.qty = item.qty;
      else
        session.cafeItems.push({
          id: cafeItem._id,
          name: cafeItem.name,
          price: cafeItem.price,
          qty: item.qty,
        });

      newCafeCost += delta * cafeItem.price;

      changes.push({
        name: cafeItem.name,
        oldQty: oldQty,
        newQty: item.qty,
        delta: delta,
        price: cafeItem.price,
        totalChange: delta * cafeItem.price,
      });
    }
  }

  session.cafeCost = newCafeCost;

  // ثبت لاگ ساختاریافته
  session.logs.push({
    type: 'cafe_order',
    timestamp: Date.now(),
    data: {
      changes: changes,
      newCafeCost: newCafeCost,
      gameCost: session.gameCost,
      cafeCost: newCafeCost,
    },
  });

  await session.save();
  return session;
}

// افزودن پیش‌پرداخت
async function addPayment(sessionId, gameNetId, amount) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error('Session not found');
  session.paidAmount += amount;
  session.logs.push({
    type: 'payment',
    timestamp: Date.now(),
    data: {
      amount,
      totalPaidSoFar: session.paidAmount,
      gameCost: session.gameCost,
    },
  });
  await session.save();
  return session;
}

// ویرایش جلسه (فقط زمان شروع/پایان، دسته، تخفیف، یادداشت) – با محاسبه مجدد هزینه
async function editSession(sessionId, gameNetId, updates, nowStr) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error('Session not found');

  // ذخیره مقادیر قدیمی فقط برای فیلدهایی که قرار است تغییر کنند
  const oldValues = {};
  const newValues = {};

  if (
    updates.timeStart !== undefined &&
    updates.timeStart !== session.timeStart
  ) {
    oldValues.timeStart = session.timeStart;
    newValues.timeStart = updates.timeStart;
    session.timeStart = updates.timeStart;
  }
  if (
    updates.timeEnd !== undefined &&
    updates.timeEnd !== session.timeEnd &&
    session.status === 'closed'
  ) {
    oldValues.timeEnd = session.timeEnd;
    newValues.timeEnd = updates.timeEnd;
    session.timeEnd = updates.timeEnd;
  }
  if (updates.mode !== undefined && updates.mode !== session.mode) {
    oldValues.mode = session.mode;
    newValues.mode = updates.mode;
    session.mode = updates.mode;
  }
  if (
    updates.discountPercent !== undefined &&
    updates.discountPercent !== session.discountPercent
  ) {
    oldValues.discountPercent = session.discountPercent;
    newValues.discountPercent = updates.discountPercent;
    session.discountPercent = updates.discountPercent;
  }
  if (
    updates.discountFixed !== undefined &&
    updates.discountFixed !== session.discountFixed
  ) {
    oldValues.discountFixed = session.discountFixed;
    newValues.discountFixed = updates.discountFixed;
    session.discountFixed = updates.discountFixed;
  }
  if (
    updates.extraPercent !== undefined &&
    updates.extraPercent !== session.extraPercent
  ) {
    oldValues.extraPercent = session.extraPercent;
    newValues.extraPercent = updates.extraPercent;
    session.extraPercent = updates.extraPercent;
  }
  if (
    updates.extraFixed !== undefined &&
    updates.extraFixed !== session.extraFixed
  ) {
    oldValues.extraFixed = session.extraFixed;
    newValues.extraFixed = updates.extraFixed;
    session.extraFixed = updates.extraFixed;
  }
  if (updates.note !== undefined && updates.note !== session.note) {
    oldValues.note = session.note || '';
    newValues.note = updates.note;
    session.note = updates.note;
  }

  // اگر جلسه بسته است و زمان پایان تغییر کرده، هزینه را دوباره محاسبه کن (اختیاری)
  if (session.status === 'closed' && (updates.timeEnd || updates.mode)) {
    const settings = await getGameNetSettings(gameNetId);
    const { gameCost } = await calculateCost(
      session,
      session.timeEnd,
      settings
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

  await session.save();

  // تنها در صورتی لاگ ثبت کن که تغییری رخ داده باشد
  if (Object.keys(oldValues).length > 0) {
    session.logs.push({
      type: 'edit',
      timestamp: Date.now(),
      data: {
        oldValues,
        newValues,
        editTime: nowStr,
        gameCost: session.gameCost,
        cafeCost: session.cafeCost,
      },
    });
    await session.save();
  }

  return session;
}

// حذف جلسه (انتقال به سطل آشغال)
async function deleteSession(sessionId, gameNetId, originalDay) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error('Session not found');
  // بازگرداندن موجودی کافه
  for (let item of session.cafeItems) {
    await increaseStock(item.id, item.qty, gameNetId);
  }
  const DeletedSession = require('../deletedSession/deletedSession.model');
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

async function reactivateSession(sessionId, gameNetId) {
  const session = await Session.findOne({ _id: sessionId, gameNetId });
  if (!session) throw new Error('Session not found');
  if (session.status !== 'closed')
    throw new Error('Only closed sessions can be reactivated');

  // محاسبه مدت زمان بسته بودن جلسه (برای لاگ)
  let downTimeMinutes = 0;
  if (session.timeEnd) {
    const now = new Date();
    const [endHour, endMin] = session.timeEnd.split(':').map(Number);
    const endDate = new Date();
    endDate.setHours(endHour, endMin, 0, 0);
    if (endDate > now) endDate.setDate(endDate.getDate() - 1);
    downTimeMinutes = Math.round((now - endDate) / (1000 * 60));
    if (downTimeMinutes < 0) downTimeMinutes = 0;
  }

  const previousGameCost = session.gameCost || 0;
  const previousCafeCost = session.cafeCost || 0;

  // ========== اضافه کردن بازه قبلی به تاریخچه ==========
  if (session.timeStart && session.timeEnd) {
    session.history.push({
      start: session.timeStart,
      end: session.timeEnd,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
      action: `بازی از ${session.timeStart} تا ${session.timeEnd}`,
    });
  }
  // =================================================

  // تنظیم مجدد جلسه برای ادامه
  session.status = 'active';
  const now = new Date();
  const newTimeStart = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
  session.timeStart = newTimeStart;
  session.timeEnd = null;
  session.startTimeMs = Date.now();

  // محاسبه نرخ ساعتی برای لاگ
  const rate = await getPricingRate(
    session.consoleType,
    session.mode,
    session.table,
    gameNetId
  );

  session.logs.push({
    type: 'reactivate',
    timestamp: Date.now(),
    data: {
      downTimeMinutes,
      previousGameCost,
      previousCafeCost,
      newStartTime: newTimeStart,
      table: session.table,
      mode: session.mode,
      consoleType: session.consoleType,
      pricingRate: rate,
    },
  });

  await session.save();
  return session;
}

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
