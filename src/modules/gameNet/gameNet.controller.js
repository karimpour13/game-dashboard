const gameNetService = require('./gameNet.service');

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
      filters.isActive = req.query.isActive === 'true';
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

    if (req.user.role === 'admin') {
      const userGameNetId = req.user.gameNetId?._id || req.user.gameNetId;
      if (userGameNetId.toString() !== gameNet._id.toString()) {
        return next({
          status: 403,
          message: 'You can only edit your own gameNet settings',
        });
      }
    }

    const {
      name,
      priceUnit,
      useMinimumHour,
      useRoundDownPrice,
      useRoundUpPrice,
      systemPassword,
      securitySettings,
    } = req.body;

    const updates = {};
    if (name !== undefined) updates.name = name;

    const currentSettings = gameNet.settings || {};
    const newSettings = { ...currentSettings };

    if (priceUnit !== undefined) newSettings.priceUnit = priceUnit;
    if (useMinimumHour !== undefined)
      newSettings.useMinimumHour = useMinimumHour;

    // اعمال انحصار متقابل بین دو نوع گرد کردن
    let finalRoundUp = useRoundUpPrice;
    let finalRoundDown = useRoundDownPrice;
    if (finalRoundUp === true && finalRoundDown === true) {
      // اگر هر دو true باشند، اولویت با گرد کردن به بالا است و پایین را false می‌کنیم
      finalRoundDown = false;
    }
    if (finalRoundUp !== undefined) newSettings.useRoundUpPrice = finalRoundUp;
    if (finalRoundDown !== undefined)
      newSettings.useRoundDownPrice = finalRoundDown;

    if (securitySettings !== undefined)
      newSettings.securitySettings = securitySettings;

    // مدیریت رمز عبور
    if (systemPassword !== undefined) {
      if (systemPassword === '') {
        delete newSettings.systemPassword;
      } else {
        const bcrypt = require('bcrypt');
        newSettings.systemPassword = await bcrypt.hash(systemPassword, 10);
      }
    }

    updates.settings = newSettings;

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
      req.user.role === 'admin' &&
      req.user.gameNetId.toString() !== gameNet._id.toString()
    ) {
      return next({ status: 403, message: 'Forbidden' });
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
    res.json({ message: 'GameNet deleted' });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
