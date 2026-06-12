const mongoose = require('mongoose');

const historySchema = new mongoose.Schema(
  {
    start: String,
    end: String,
    mode: String,
    consoleType: String,
    table: String,
    action: String,
  },
  { _id: false }
);

const cafeItemSchema = new mongoose.Schema(
  {
    id: { type: mongoose.Schema.Types.ObjectId, ref: 'CafeItem' },
    name: String,
    price: Number,
    qty: Number,
  },
  { _id: false }
);

const logSchema = new mongoose.Schema(
  {
    timestamp: String,
    eventType: String,
    message: String,
    gameCost: Number,
    cafeCost: Number,
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    gameNetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'GameNet',
      required: true,
    },
    table: String,
    status: {
      type: String,
      enum: ['active', 'reserved', 'closed'],
      default: 'active',
    },
    timeStart: String,
    timeEnd: String,
    mode: String,
    consoleType: String,
    customerName: String,
    customerPhone: String,
    reservedDay: String, // روز هفته رزرو
    reserveTimestamp: { type: Number, default: null },
    date: String, // تاریخ شمسی
    history: [historySchema],
    cafeItems: [cafeItemSchema],
    cafeCost: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    discountFixed: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    extraPercent: { type: Number, default: 0 },
    extraFixed: { type: Number, default: 0 },
    note: String,
    logs: [logSchema],
    countdownEnd: Date,
    startTimeMs: Number, // برای تایمر زنده در فرانت (اختیاری)
  },
  { timestamps: true }
);

module.exports = mongoose.model('Session', sessionSchema);
