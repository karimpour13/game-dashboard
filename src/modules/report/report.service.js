const Session = require("../session/session.model");

function formatMoney(amount, priceUnit = "Toman") {
  if (priceUnit === "Rial") return (amount * 10).toLocaleString();
  return amount.toLocaleString();
}

async function generateDailyReport(gameNetId, date, priceUnit) {
  const sessions = await Session.find({ gameNetId, date }).lean();

  // آمار کارکرد میزها (ساعت)
  const tableUsage = {};
  for (const s of sessions) {
    if (s.status === "closed" && s.timeStart && s.timeEnd) {
      const start = s.timeStart.split(":").map(Number);
      let end = s.timeEnd.split(":").map(Number);
      let startMin = start[0] * 60 + start[1];
      let endMin = end[0] * 60 + end[1];
      if (endMin < startMin) endMin += 24 * 60;
      let hours = (endMin - startMin) / 60;
      tableUsage[s.table] = (tableUsage[s.table] || 0) + hours;
    }
  }

  const rows = [];
  // هدر
  rows.push([
    "نام میز",
    "کنسول",
    "حالت بازی",
    "ساعت ورود/رزرو",
    "ساعت خروج",
    "یادداشت",
    `هزینه بازی (${priceUnit === "Rial" ? "ریال" : "تومان"})`,
    "جزئیات سفارش/مشتری",
    `هزینه کافه (${priceUnit === "Rial" ? "ریال" : "تومان"})`,
    `پیش‌پرداخت (${priceUnit === "Rial" ? "ریال" : "تومان"})`,
    `مبلغ نهایی (${priceUnit === "Rial" ? "ریال" : "تومان"})`,
    "وضعیت",
  ]);

  let totalIncome = 0,
    closedCount = 0;

  for (const s of sessions) {
    const statusFa =
      s.status === "active"
        ? "در حال بازی"
        : s.status === "reserved"
          ? "رزرو شده"
          : "بسته شده";
    const timeEndStr =
      s.status === "active" || s.status === "reserved" ? "-" : s.timeEnd || "-";
    let finalAmount =
      s.status === "closed" && s.totalAmount ? s.totalAmount : 0;
    let cafeDetails = "-";
    if (s.status === "reserved") {
      cafeDetails = `مشتری: ${s.customerName || ""} ${s.customerPhone ? `- ${s.customerPhone}` : ""}`;
    } else if (s.cafeItems?.length) {
      cafeDetails = s.cafeItems.map((c) => `${c.name} (${c.qty})`).join(" | ");
    }
    const safeNote = s.note ? s.note.replace(/,/g, " ") : "-";
    const gameCostVal = s.gameCost || 0;
    const cafeCostVal = s.cafeCost || 0;
    const paidVal = s.paidAmount || 0;
    const finalVal = finalAmount;

    if (s.status === "closed") {
      totalIncome += finalVal;
      closedCount++;
    }

    rows.push([
      s.table,
      s.consoleType,
      s.mode,
      s.timeStart,
      timeEndStr,
      safeNote,
      formatMoney(gameCostVal, priceUnit),
      cafeDetails,
      formatMoney(cafeCostVal, priceUnit),
      formatMoney(paidVal, priceUnit),
      formatMoney(finalVal, priceUnit),
      statusFa,
    ]);
  }

  rows.push([]);
  rows.push([`تعداد رکوردهای بسته:,${closedCount}`]);
  rows.push([
    `مجموع درآمد روز (${priceUnit === "Rial" ? "ریال" : "تومان"}):,${formatMoney(totalIncome, priceUnit)}`,
  ]);
  rows.push([]);
  rows.push(["آمار کارکرد میزها (ساعت)"]);
  rows.push(["نام میز", "مجموع ساعت استفاده"]);
  for (const [table, hours] of Object.entries(tableUsage)) {
    rows.push([table, hours.toFixed(2)]);
  }

  const csvContent = rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");
  return "\uFEFF" + csvContent;
}

module.exports = { generateDailyReport };
