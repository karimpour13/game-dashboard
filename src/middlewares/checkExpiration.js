const User = require('../modules/user/user.model');
const GameNet = require('../modules/gameNet/gameNet.model');

module.exports = async (req, res, next) => {
  try {
    // اگر کاربر احراز هویت نشده، ادامه بده (چون middleware بعد از auth اجرا می‌شود)
    if (!req.user || !req.user.id) return next();

    // دریافت اطلاعات کامل کاربر
    const user = await User.findById(req.user.id).populate('gameNetId');
    if (!user) return next({ status: 401, message: 'User not found' });

    // ========== چک انقضای کاربر ==========
    if (user.expiresAt && new Date() > new Date(user.expiresAt)) {
      return next({
        status: 403,
        message:
          'حساب کاربری شما منقضی شده است. لطفاً با پشتیبانی تماس بگیرید.',
      });
    }

    // ========== چک انقضای گیم‌نت (برای ادمین) ==========
    if (user.role === 'admin' && user.gameNetId) {
      if (!user.gameNetId.isActive) {
        return next({ status: 403, message: 'گیم‌نت غیرفعال است' });
      }
      if (new Date() > new Date(user.gameNetId.expiresAt)) {
        return next({
          status: 403,
          message: 'اشتراک گیم‌نت شما منقضی شده است.',
        });
      }
    }

    next();
  } catch (err) {
    next(err);
  }
};
