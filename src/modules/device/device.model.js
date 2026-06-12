const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    gameNetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GameNet",
      required: true,
    },
    name: { type: String, required: true },
    console: { type: String, required: true },
    pricingType: {
      type: String,
      enum: ["hourly_handles", "hourly_fixed", "hourly_per_person"],
      default: "hourly_handles",
    },
    modes: [String],
    prices: { type: mongoose.Schema.Types.Mixed, default: {} },
    description: String,
    vip: { type: Boolean, default: false },
    royal: { type: Boolean, default: false },
    legendary: { type: Boolean, default: false },
    order: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Device", deviceSchema);
