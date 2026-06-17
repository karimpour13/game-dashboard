const authService = require('./auth.service');
const User = require('../user/user.model');
const bcrypt = require('bcrypt');
const GameNet = require('../gameNet/gameNet.model');
const { sendResetEmail } = require('../../services/emailService');

exports.login = async (req, res, next) => {
  try {
    const { username, password, rememberMe } = req.body;
    const { user, accessToken, refreshToken } = await authService.login(
      username,
      password,
      rememberMe
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
    res.json({ message: 'Logged out' });
  } catch (err) {
    next(err);
  }
};

exports.getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id)
      .select('-password')
      .populate('gameNetId');
    res.json({ user });
  } catch (err) {
    next(err);
  }
};

exports.verifySystemPassword = async (req, res, next) => {
  try {
    const { password } = req.body;
    let gameNetId = req.user.gameNetId;
    if (req.user.role === 'superAdmin') {
      if (!req.body.gameNetId)
        throw new Error('gameNetId required for superAdmin');
      gameNetId = req.body.gameNetId;
    }
    const gameNet = await GameNet.findById(gameNetId);
    if (!gameNet) throw new Error('GameNet not found');
    const hash = gameNet.settings?.systemPassword;
    if (!hash) return res.json({ valid: true });
    const match = await bcrypt.compare(password, hash);
    if (!match) throw new Error('Invalid password');
    res.json({ valid: true });
  } catch (err) {
    next({ status: 401, message: err.message });
  }
};

exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) {
      // برای امنیت، حتی اگر کاربر وجود نداشت، پیام موفقیت برگردانید
      return res.json({
        message:
          'اگر ایمیلی با این آدرس وجود داشته باشد، لینک بازیابی ارسال خواهد شد.',
      });
    }

    const token = crypto.randomBytes(32).toString('hex');
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 ساعت
    await user.save();

    const resetLink = `${process.env.FRONTEND_URL || 'http://localhost:3010'}/reset-password.html?token=${token}`;
    await sendResetEmail(user.email, resetLink);

    res.json({ message: 'لینک بازیابی به ایمیل شما ارسال شد.' });
  } catch (err) {
    next(err);
  }
};

exports.resetPassword = async (req, res, next) => {
  try {
    const { token, newPassword } = req.body;
    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() },
    });
    if (!user) throw new Error('توکن نامعتبر یا منقضی شده است.');

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    user.refreshToken = null; // خروج از همه دستگاه‌ها
    await user.save();

    res.json({
      message: 'رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.',
    });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
