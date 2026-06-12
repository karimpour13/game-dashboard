const cafeService = require("./cafe.service");

exports.getItems = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.query.gameNetId : req.user.gameNetId;
    const items = await cafeService.getItems(gameNetId);
    res.json(items);
  } catch (err) {
    next(err);
  }
};

exports.createItem = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.body.gameNetId : req.user.gameNetId;
    const item = await cafeService.createItem(req.body, gameNetId);
    res.status(201).json(item);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.updateItem = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.body.gameNetId : req.user.gameNetId;
    const item = await cafeService.updateItem(
      req.params.id,
      req.body,
      gameNetId,
    );
    res.json(item);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteItem = async (req, res, next) => {
  try {
    const gameNetId =
      req.user.role === "superAdmin" ? req.query.gameNetId : req.user.gameNetId;
    await cafeService.deleteItem(req.params.id, gameNetId);
    res.json({ message: "Item deleted" });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
