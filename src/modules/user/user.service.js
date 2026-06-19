const bcrypt = require('bcrypt');
const User = require('./user.model');
const GameNet = require('../gameNet/gameNet.model');

const createUser = async (data, currentUserRole) => {
  if (data.role === 'superAdmin' && currentUserRole !== 'superAdmin')
    throw new Error('Only super admin can create super admin');

  // ========== اعتبارسنجی قبل از مونگو ==========
  // بررسی تکراری بودن نام کاربری
  const existingUsername = await User.findOne({ username: data.username });
  if (existingUsername) {
    throw new Error(`نام کاربری "${data.username}" قبلاً ثبت شده است.`);
  }

  // بررسی تکراری بودن ایمیل
  const existingEmail = await User.findOne({ email: data.email });
  if (existingEmail) {
    throw new Error(`ایمیل "${data.email}" قبلاً ثبت شده است.`);
  }

  if (data.role === 'admin') {
    const gameNet = await GameNet.findById(data.gameNetId);
    if (!gameNet) throw new Error('گیم‌نت مورد نظر یافت نشد');
  }
  if (data.expiresAt && new Date(data.expiresAt) < new Date()) {
    throw new Error('تاریخ انقضا نمی‌تواند در گذشته باشد');
  }
  const hashedPassword = await bcrypt.hash(data.password, 10);
  const user = await User.create({ ...data, password: hashedPassword });
  return user;
};

const getUsers = async (
  filters = {},
  currentUserRole,
  currentUserGameNetId
) => {
  if (currentUserRole === 'superAdmin') {
    return User.find(filters).populate('gameNetId');
  } else {
    return User.find({
      gameNetId: currentUserGameNetId,
      role: 'admin',
    }).populate('gameNetId');
  }
};

const updateUser = async (id, updates, currentUserRole) => {
  const user = await User.findById(id);
  if (!user) throw new Error('کاربر یافت نشد');

  if (currentUserRole !== 'superAdmin' && user.role === 'superAdmin')
    throw new Error('نمی‌توانید سوپرادمین را ویرایش کنید');

  // ========== اعتبارسنجی قبل از مونگو برای ویرایش ==========
  if (updates.username) {
    const existing = await User.findOne({
      username: updates.username,
      _id: { $ne: id },
    });
    if (existing) {
      throw new Error(`نام کاربری "${updates.username}" قبلاً ثبت شده است.`);
    }
  }

  if (updates.email) {
    const existing = await User.findOne({
      email: updates.email,
      _id: { $ne: id },
    });
    if (existing) {
      throw new Error(`ایمیل "${updates.email}" قبلاً ثبت شده است.`);
    }
  }

  if (updates.password)
    updates.password = await bcrypt.hash(updates.password, 10);
  Object.assign(user, updates);
  await user.save();
  return user;
};

const deleteUser = async (id, currentUserRole) => {
  const user = await User.findById(id);
  if (!user) throw new Error('کاربر یافت نشد');
  if (currentUserRole !== 'superAdmin' && user.role === 'superAdmin')
    throw new Error('نمی‌توانید سوپرادمین را حذف کنید');
  await user.deleteOne();
};

module.exports = { createUser, getUsers, updateUser, deleteUser };
