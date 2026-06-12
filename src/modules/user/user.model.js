const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    username: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    role: { type: String, enum: ["admin", "superAdmin"], default: "admin" },
    gameNetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GameNet",
      required: function () {
        return this.role === "admin";
      },
    },
    isActive: { type: Boolean, default: true },
    lastLogin: Date,
    refreshToken: String,
    lastActivity: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

module.exports = mongoose.model("User", userSchema);
