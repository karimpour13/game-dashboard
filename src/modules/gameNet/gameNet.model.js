const mongoose = require("mongoose");

const gameNetSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    address: String,
    phone: String,
    settings: {
      priceUnit: { type: String, enum: ["Toman", "Rial"], default: "Toman" },
      useMinimumHour: { type: Boolean, default: true },
      useRoundDownPrice: { type: Boolean, default: false },
      systemPassword: String, // hashed
      securitySettings: { type: mongoose.Schema.Types.Mixed, default: {} },
    },
    theme: { type: String, default: "dark" },
    expiresAt: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("GameNet", gameNetSchema);
