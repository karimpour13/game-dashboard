const userService = require("./user.service");

exports.createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.role);
    res.status(201).json({ message: "User created", user });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.getUsers = async (req, res, next) => {
  try {
    const filters = {};
    if (req.query.gameNetId) filters.gameNetId = req.query.gameNetId;
    const users = await userService.getUsers(
      filters,
      req.user.role,
      req.user.gameNetId,
    );
    res.json(users);
  } catch (err) {
    next(err);
  }
};

exports.updateUser = async (req, res, next) => {
  try {
    const user = await userService.updateUser(
      req.params.id,
      req.body,
      req.user.role,
    );
    res.json({ message: "User updated", user });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user.role);
    res.json({ message: "User deleted" });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
