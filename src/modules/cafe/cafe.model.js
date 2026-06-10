const mongoose = require("mongoose");

const cafeItemSchema = new mongoose.Schema(
  {
    gameNetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GameNet",
      required: true,
    },
    name: { type: String, required: true },
    price: { type: Number, required: true }, // قیمت به تومان
    stock: { type: Number, default: 0 },
  },
  { timestamps: true },
);

module.exports = mongoose.model("CafeItem", cafeItemSchema);
