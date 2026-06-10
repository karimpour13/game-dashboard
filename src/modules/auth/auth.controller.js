const authService = require("./auth.service");
const User = require("../user/user.model");

exports.login = async (req, res, next) => {
  try {
    const { username, password } = req.body;
    const { user, accessToken, refreshToken } = await authService.login(
      username,
      password,
    );
    res.json({
      user: {
        id: user._id,
        username: user.username,
        role: user.role,
        gameNetId: user.gameNetId?._id,
      },
      accessToken,
      refreshToken,
    });
  } catch (err) {
    next({ status: 401, message: err.message });
  }
};

exports.refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    const tokens = await authService.refreshTokens(refreshToken);
    res.json(tokens);
  } catch (err) {
    next({ status: 401, message: err.message });
  }
};

exports.logout = async (req, res, next) => {
  try {
    await authService.logout(req.user.id);
    res.json({ message: "Logged out" });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select("-password")
      .populate("gameNetId");
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.verifySystemPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    let gameNetId = req.user.gameNetId;
    if (req.user.role === "superAdmin") {
      if (!req.body.gameNetId)
        throw new Error("gameNetId required for superAdmin");
      gameNetId = req.body.gameNetId;
    }
    const gameNet = await GameNet.findById(gameNetId);
    if (!gameNet) throw new Error("GameNet not found");
    const hash = gameNet.settings?.systemPassword;
    if (!hash) return res.json({ valid: true });
    const match = await bcrypt.compare(password, hash);
    if (!match) throw new Error("Invalid password");
    res.json({ valid: true });
  } catch (err) {
    next({ status: 401, message: err.message });
  }
};
