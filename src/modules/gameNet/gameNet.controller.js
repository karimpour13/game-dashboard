const gameNetService = require("./gameNet.service");

exports.createGameNet = async (req, res, next) => {
  try {
    const gameNet = await gameNetService.createGameNet(req.body);
    res.status(201).json(gameNet);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.getGameNets = async (req, res, next) => {
  try {
    const filters = {};
    if (req.query.isActive !== undefined)
      filters.isActive = req.query.isActive === "true";
    const gameNets = await gameNetService.getGameNets(filters);
    res.json(gameNets);
  } catch (err) {
    next(err);
  }
};

exports.getGameNet = async (req, res, next) => {
  try {
    const gameNet = await gameNetService.getGameNetById(req.params.id);
    res.json(gameNet);
  } catch (err) {
    next({ status: 404, message: err.message });
  }
};

exports.updateGameNet = async (req, res, next) => {
  try {
    const gameNet = await gameNetService.updateGameNet(req.params.id, req.body);
    res.json(gameNet);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.updateSettings = async (req, res, next) => {
  try {
    const gameNet = await gameNetService.getGameNetById(req.params.id);
    // بررسی دسترسی: سوپرادمین همیشه مجاز، ادمین فقط اگر گیم‌نت متعلق به خودش باشد
    // if (
    //   req.user.role === "admin" &&
    //   req.user.gameNetId.toString() !== gameNet._id.toString()
    // ) {
    //   return next({ status: 403, message: "Forbidden" });
    // }

    const { name, ...settingsUpdates } = req.body;
    const updates = {};

    if (name) updates.name = name;
    if (Object.keys(settingsUpdates).length > 0) {
      updates.settings = { ...gameNet.settings, ...settingsUpdates };
    }

    // اگر رمز عبور سیستم جدید ارائه شده، آن را هش کن
    if (req.body.systemPassword !== undefined) {
      if (req.body.systemPassword === "") {
        updates.settings.systemPassword = undefined; // حذف رمز
      } else {
        const bcrypt = require("bcrypt");
        updates.settings.systemPassword = await bcrypt.hash(
          req.body.systemPassword,
          10,
        );
      }
    }

    const updated = await gameNetService.updateGameNet(req.params.id, updates);
    res.json(updated);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
exports.updateTheme = async (req, res, next) => {
  try {
    const { theme } = req.body;
    const gameNet = await gameNetService.getGameNetById(req.params.id);
    if (
      req.user.role === "admin" &&
      req.user.gameNetId.toString() !== gameNet._id.toString()
    ) {
      return next({ status: 403, message: "Forbidden" });
    }
    const updated = await gameNetService.updateTheme(req.params.id, theme);
    res.json(updated);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteGameNet = async (req, res, next) => {
  try {
    await gameNetService.deleteGameNet(req.params.id);
    res.json({ message: "GameNet deleted" });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
