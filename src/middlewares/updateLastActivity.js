const User = require("../modules/user/user.model");

module.exports = async (req, res, next) => {
  if (req.user && req.user.id) {
    await User.findByIdAndUpdate(req.user.id, { lastActivity: new Date() });
  }
  next();
};
