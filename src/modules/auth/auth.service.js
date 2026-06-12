const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const User = require("../user/user.model");
const {
  jwtSecret,
  jwtRefreshSecret,
  jwtExpiresIn,
  jwtRefreshExpiresIn,
} = require("../../config");

const generateTokens = (user) => {
  const payload = { id: user._id, role: user.role, gameNetId: user.gameNetId };
  const accessToken = jwt.sign(payload, jwtSecret, { expiresIn: jwtExpiresIn });
  const refreshToken = jwt.sign(payload, jwtRefreshSecret, {
    expiresIn: jwtRefreshExpiresIn,
  });
  return { accessToken, refreshToken };
};

const login = async (username, password) => {
  const user = await User.findOne({ username }).populate("gameNetId");
  if (!user) throw new Error("Invalid credentials");
  if (!user.isActive) throw new Error("Account disabled");
  if (
    user.role === "admin" &&
    (!user.gameNetId ||
      !user.gameNetId.isActive ||
      new Date() > user.gameNetId.expiresAt)
  ) {
    throw new Error("GameNet expired or inactive");
  }
  const match = await bcrypt.compare(password, user.password);
  if (!match) throw new Error("Invalid credentials");

  user.lastLogin = new Date();
  await user.save();

  const { accessToken, refreshToken } = generateTokens(user);
  user.refreshToken = refreshToken;
  await user.save();

  return { user, accessToken, refreshToken };
};

const refreshTokens = async (refreshToken) => {
  const user = await User.findOne({ refreshToken });
  if (!user) throw new Error("Invalid refresh token");
  const daysSinceLastActivity =
    (Date.now() - user.lastActivity) / (1000 * 60 * 60 * 24);
  if (daysSinceLastActivity > 3) {
    // غیرفعال کردن توکن رفرش
    user.refreshToken = null;
    await user.save();
    throw new Error("Session expired due to inactivity");
  }
  try {
    jwt.verify(refreshToken, jwtRefreshSecret);
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);
    user.refreshToken = newRefreshToken;
    await user.save();
    return { accessToken, refreshToken: newRefreshToken };
  } catch (err) {
    throw new Error("Refresh token expired");
  }
};

const logout = async (userId) => {
  await User.findByIdAndUpdate(userId, { refreshToken: null });
};

module.exports = { login, refreshTokens, logout };
