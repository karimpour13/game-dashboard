const deviceService = require("./device.service");

exports.getDevices = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.query.gameNetId : req.user.gameNetId;
    const devices = await deviceService.getDevices(gameNetId);
    res.json(devices);
  } catch (err) {
    next(err);
  }
};

exports.createDevice = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.body.gameNetId : req.user.gameNetId;
    const device = await deviceService.createDevice(req.body, gameNetId);
    res.status(201).json(device);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.updateDevice = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.body.gameNetId : req.user.gameNetId;
    const device = await deviceService.updateDevice(
      req.params.id,
      req.body,
      gameNetId,
    );
    res.json(device);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteDevice = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.query.gameNetId : req.user.gameNetId;
    await deviceService.deleteDevice(req.params.id, gameNetId);
    res.json({ message: "Device deleted" });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.getDevice = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.query.gameNetId : req.user.gameNetId;
    const device = await deviceService.getDeviceById(req.params.id, gameNetId);
    res.json(device);
  } catch (err) {
    next({ status: 404, message: err.message });
  }
};
