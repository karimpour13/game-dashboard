// قیمت ساعتی را بر اساس کنسول، حالت، و تنظیمات دستگاه (از Device) دریافت می‌کند
// فرض می‌کنیم یک تابع getPricingRate داریم که از دیتابیس می‌خواند
const Device = require('../modules/device/device.model');

// محاسبه هزینه یک بازه (start تا end)
async function getPeriodCost(
  startStr,
  endStr,
  mode,
  consoleType,
  tableName,
  gameNetId,
  getRateFunc
) {
  const startMin =
    parseInt(startStr.split(':')[0]) * 60 + parseInt(startStr.split(':')[1]);
  let endMin =
    parseInt(endStr.split(':')[0]) * 60 + parseInt(endStr.split(':')[1]);
  if (endMin < startMin) endMin += 24 * 60;
  const minutes = endMin - startMin;
  if (minutes <= 0) return { minutes, rate: 0, cost: 0 };
  const rate = await getRateFunc(consoleType, mode, tableName, gameNetId); // ← await اضافه شد
  const rateNum = typeof rate === 'number' && !isNaN(rate) ? rate : 0;
  const cost = Math.floor((minutes / 60) * rateNum);
  return { minutes, rate: rateNum, cost };
}
async function getPricingRate(consoleType, mode, tableName, gameNetId) {
  const cleanTableName = tableName.trim();

  // جستجوی دستگاه با نام یکسان (حساس به حروف بزرگ/کوچک نیست)
  const device = await Device.findOne({
    gameNetId,
    name: { $regex: new RegExp(`^${cleanTableName}$`, 'i') },
  });
  if (!device) {
    console.warn(
      `Device not found for table: "${cleanTableName}" (original: "${tableName}")`
    );
    return 0;
  }
  if (device.prices && device.prices[mode] !== undefined) {
    return device.prices[mode];
  }
  return 0;
}

// محاسبه هزینه کل جلسه (با در نظر گرفتن history و حالت فعلی)
// useMinimumHour و useRoundDownPrice از تنظیمات گیم‌نت گرفته می‌شود
async function calculateCost(session, endTimeStr, gameNetSettings) {
  const { useMinimumHour, useRoundDownPrice, useRoundUpPrice, priceUnit } =
    gameNetSettings;
  const periods = [];
  if (session.history && session.history.length > 0) {
    for (let h of session.history) periods.push(h);
    periods.push({
      start: session.history[session.history.length - 1].end,
      end: endTimeStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    periods.push({
      start: session.timeStart,
      end: endTimeStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  }

  let totalMinutes = 0;
  let totalWeightedRate = 0;
  for (let p of periods) {
    const { minutes, rate } = await getPeriodCost(
      p.start,
      p.end,
      p.mode,
      p.consoleType,
      p.table,
      session.gameNetId,
      getPricingRate
    );
    totalMinutes += minutes;
    totalWeightedRate += minutes * rate;
  }
  if (totalMinutes === 0) {
    return {
      gameCost: 0,
      totalMinutes: 0,
      effectiveMinutes: 0,
      weightedAvgRate: 0,
      hasChanges: session.history && session.history.length > 0,
    };
  }

  const hasChanges = session.history && session.history.length > 0;
  let effectiveMinutes = totalMinutes;
  if (useMinimumHour && !hasChanges && totalMinutes < 60) {
    effectiveMinutes = 60;
  }

  let gameCost = Math.round(
    (effectiveMinutes / 60) * (totalWeightedRate / totalMinutes)
  );
  if (isNaN(gameCost)) gameCost = 0;

  // گرد کردن بر اساس تنظیمات
  const roundBase = 5000;

  if (useRoundUpPrice) {
    gameCost = Math.ceil(gameCost / roundBase) * roundBase;
  } else if (useRoundDownPrice) {
    gameCost = Math.floor(gameCost / roundBase) * roundBase;
  } else {
    // حالت پیش‌فرض: بدون گرد کردن یا گرد به پایین هزار تومانی (اختیاری)
    const defaultBase = 1000;
    gameCost = Math.floor(gameCost / defaultBase) * defaultBase;
  }
  if (isNaN(gameCost)) gameCost = 0;

  return {
    gameCost,
    totalMinutes,
    effectiveMinutes,
    weightedAvgRate: totalWeightedRate / totalMinutes,
    hasChanges,
  };
}
async function calculateCostWithDetails(session, endTimeStr, gameNetSettings) {
  const { useMinimumHour, useRoundDownPrice, useRoundUpPrice, priceUnit } =
    gameNetSettings;
  const periods = [];
  if (session.history && session.history.length > 0) {
    for (let h of session.history) periods.push(h);
    periods.push({
      start: session.history[session.history.length - 1].end,
      end: endTimeStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  } else {
    periods.push({
      start: session.timeStart,
      end: endTimeStr,
      mode: session.mode,
      consoleType: session.consoleType,
      table: session.table,
    });
  }

  let totalMinutes = 0,
    totalWeightedRate = 0;
  const periodsDetails = [];
  for (let p of periods) {
    const { minutes, rate, cost } = await getPeriodCost(
      p.start,
      p.end,
      p.mode,
      p.consoleType,
      p.table,
      session.gameNetId,
      getPricingRate
    );
    if (minutes > 0) {
      totalMinutes += minutes;
      totalWeightedRate += minutes * rate;
      periodsDetails.push({
        minutes,
        table: p.table,
        consoleType: p.consoleType,
        mode: p.mode,
        rate,
        cost,
      });
    }
  }

  if (totalMinutes === 0) {
    return {
      gameCost: 0,
      totalMinutes: 0,
      effectiveMinutes: 0,
      weightedAvgRate: 0,
      hasChanges: false,
      periodsDetails: [],
    };
  }

  const hasChanges = session.history && session.history.length > 0;
  let effectiveMinutes = totalMinutes;
  if (useMinimumHour && !hasChanges && totalMinutes < 60) {
    effectiveMinutes = 60;
  }

  let gameCost = Math.round(
    (effectiveMinutes / 60) * (totalWeightedRate / totalMinutes)
  );
  if (isNaN(gameCost)) gameCost = 0;

  // گرد کردن (همان منطق قبلی)
  if (useRoundUpPrice) {
    // const roundBase = priceUnit === 'Rial' ? 50000 : 5000;
    const roundBase = 5000;
    gameCost = Math.ceil(gameCost / roundBase) * roundBase;
  } else if (useRoundDownPrice) {
    // const roundBase = priceUnit === 'Rial' ? 50000 : 5000;
    const roundBase = 5000;
    gameCost = Math.floor(gameCost / roundBase) * roundBase;
  } else {
    const roundBase = 1000;
    // const roundBase = priceUnit === 'Rial' ? 10000 : 1000;
    gameCost = Math.floor(gameCost / roundBase) * roundBase;
  }

  return {
    gameCost,
    totalMinutes,
    effectiveMinutes,
    weightedAvgRate: totalWeightedRate / totalMinutes,
    hasChanges,
    periodsDetails,
  };
}

module.exports = {
  getPricingRate,
  calculateCost,
  getPeriodCost,
  calculateCostWithDetails,
};
