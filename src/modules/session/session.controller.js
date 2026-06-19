const sessionService = require('./session.service');

exports.getSessions = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.query.gameNetId : req.user.gameNetId;
    const { day, date } = req.query;
    const sessions = await sessionService.getSessionsByDay(
      gameNetId,
      day,
      date
    );
    res.json(sessions);
  } catch (err) {
    next(err);
  }
};

exports.startSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const session = await sessionService.startSession(
      req.body,
      gameNetId,
      req.user.id
    );
    res.status(201).json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.reserveSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const session = await sessionService.reserveSession(
      req.body,
      gameNetId,
      req.user.id
    );
    res.status(201).json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.startReserved = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const session = await sessionService.startReservedSession(
      req.params.id,
      gameNetId
    );
    res.json(session);
  } catch (err) {
    next({ status: err.status || 400, message: err.message });
  }
};

exports.closeSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { endTime } = req.body;
    const session = await sessionService.closeSession(
      req.params.id,
      gameNetId,
      endTime
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.changeMode = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { newMode, nowStr } = req.body;
    const session = await sessionService.changeMode(
      req.params.id,
      gameNetId,
      newMode,
      nowStr
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.changeTable = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { newTable, newMode, nowStr } = req.body;
    const session = await sessionService.changeTable(
      req.params.id,
      gameNetId,
      newTable,
      newMode,
      nowStr
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.addCafeOrder = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { items } = req.body;
    const session = await sessionService.addCafeOrder(
      req.params.id,
      gameNetId,
      items
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.addPayment = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { amount } = req.body;
    const session = await sessionService.addPayment(
      req.params.id,
      gameNetId,
      amount
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.editSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const { updates, nowStr } = req.body;
    const session = await sessionService.editSession(
      req.params.id,
      gameNetId,
      updates,
      nowStr
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.query.gameNetId : req.user.gameNetId;
    const { originalDay } = req.query;
    await sessionService.deleteSession(req.params.id, gameNetId, originalDay);
    res.json({ message: 'Session moved to trash' });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.reactivateSession = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === 'superAdmin' ? req.body.gameNetId : req.user.gameNetId;
    const session = await sessionService.reactivateSession(
      req.params.id,
      gameNetId
    );
    res.json(session);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
