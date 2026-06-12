const mongoose = require("mongoose");

const deletedSessionSchema = new mongoose.Schema(
  {
    gameNetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GameNet",
      required: true,
    },
    session: { type: mongoose.Schema.Types.Mixed, required: true },
    deletedAt: Date,
    originalDay: String,
  },
  { timestamps: true },
);

module.exports = mongoose.model("DeletedSession", deletedSessionSchema);
