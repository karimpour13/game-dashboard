const GameNet = require('../gameNet/gameNet.model');
const userService = require('./user.service');
const gameNetService = require('../gameNet/gameNet.service');
const User = require('./user.model');
const bcrypt = require('bcrypt');

exports.createUser = async (req, res, next) => {
  try {
    const user = await userService.createUser(req.body, req.user.role);
    res.status(201).json({ message: 'User created', user });
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
      req.user.gameNetId
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
      req.user.role
    );
    res.json({ message: 'User updated', user });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

exports.deleteUser = async (req, res, next) => {
  try {
    await userService.deleteUser(req.params.id, req.user.role);
    res.json({ message: 'User deleted' });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
exports.createUserWithGameNet = async (req, res, next) => {
  try {
    const { userData, gameNetData } = req.body;

    // ========== اعتبارسنجی نام گیم‌نت قبل از مونگو ==========
    const existingGameNet = await GameNet.findOne({ name: gameNetData.name });
    if (existingGameNet) {
      return next({
        status: 400,
        message: `گیم‌نت با نام "${gameNetData.name}" قبلاً ثبت شده است.`,
      });
    }

    // ========== اعتبارسنجی نام کاربری و ایمیل قبل از مونگو ==========
    const existingUsername = await User.findOne({
      username: userData.username,
    });
    if (existingUsername) {
      return next({
        status: 400,
        message: `نام کاربری "${userData.username}" قبلاً ثبت شده است.`,
      });
    }

    const existingEmail = await User.findOne({ email: userData.email });
    if (existingEmail) {
      return next({
        status: 400,
        message: `ایمیل "${userData.email}" قبلاً ثبت شده است.`,
      });
    }

    // ۱. ایجاد گیم‌نت جدید
    const newGameNet = await gameNetService.createGameNet(gameNetData);

    // ۲. ایجاد کاربر جدید
    const hashedPassword = await bcrypt.hash(userData.password, 10);
    const newUser = await User.create({
      ...userData,
      password: hashedPassword,
      gameNetId: newGameNet._id,
    });

    res.status(201).json({
      message: 'کاربر و گیم‌نت با موفقیت ایجاد شدند',
      user: {
        id: newUser._id,
        firstName: newUser.firstName,
        lastName: newUser.lastName,
        username: newUser.username,
        email: newUser.email,
        role: newUser.role,
        isActive: newUser.isActive,
        expiresAt: newUser.expiresAt,
      },
      gameNet: {
        id: newGameNet._id,
        name: newGameNet.name,
        address: newGameNet.address,
        phone: newGameNet.phone,
        expiresAt: newGameNet.expiresAt,
        isActive: newGameNet.isActive,
      },
    });
  } catch (err) {
    // ========== مدیریت خطاهای مونگو و سایر خطاها ==========
    if (err.code === 11000) {
      // در صورت بروز خطای تکراری (اگر چک‌های بالا کار نکردند)
      const field = Object.keys(err.keyPattern)[0];
      const value = err.keyValue[field];
      const fieldName =
        field === 'username'
          ? 'نام کاربری'
          : field === 'email'
            ? 'ایمیل'
            : 'فیلد';
      return next({
        status: 400,
        message: `${fieldName} "${value}" قبلاً ثبت شده است.`,
      });
    }
    next({ status: 400, message: err.message });
  }
};
