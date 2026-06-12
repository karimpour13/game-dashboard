const deletedSessionService = require("./deletedSession.service");
const DeletedSession = require("./deletedSession.model");

exports.getDeletedSessions = async (req, res, next) => {
  try {
    let gameNetId = req.user.gameNetId;
    if (req.user.role === "superAdmin") {
      if (!req.query.gameNetId)
        throw new Error("gameNetId required for superAdmin");
      gameNetId = req.query.gameNetId;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { gameNetId };
    const total = await DeletedSession.countDocuments(query);
    const sessions = await DeletedSession.find(query)
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      data: sessions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next(err); // حالا next تعریف شده است
  }
};

exports.deleteForever = async (req, res, next) => {
  try {
    let gameNetId = req.user.gameNetId;
    if (req.user.role === "superAdmin") {
      if (!req.query.gameNetId)
        throw new Error("gameNetId required for superAdmin");
      gameNetId = req.query.gameNetId;
    }
    await deletedSessionService.deleteForever(req.params.id, gameNetId);
    res.json({ message: "Deleted permanently" });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

// در صورت نیاز به بازیابی
exports.restoreSession = async (req, res, next) => {
  try {
    let gameNetId = req.user.gameNetId;
    if (req.user.role === "superAdmin") {
      if (!req.query.gameNetId)
        throw new Error("gameNetId required for superAdmin");
      gameNetId = req.query.gameNetId;
    }
    const restored = await deletedSessionService.restoreSession(
      req.params.id,
      gameNetId,
    );
    res.json(restored);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
