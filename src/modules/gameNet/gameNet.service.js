const GameNet = require('./gameNet.model');

exports.createGameNet = async (data) => {
  // ========== اعتبارسنجی قبل از مونگو ==========
  const existing = await GameNet.findOne({ name: data.name });
  if (existing) {
    throw new Error(`گیم‌نت با نام "${data.name}" قبلاً ثبت شده است.`);
  }
  return GameNet.create(data);
};

exports.getGameNets = async (filters = {}) => {
  return GameNet.find(filters).sort({ createdAt: -1 });
};

exports.getGameNetById = async (id) => {
  const gameNet = await GameNet.findById(id);
  if (!gameNet) throw new Error('گیم‌نت یافت نشد');
  return gameNet;
};

exports.updateGameNet = async (id, updates) => {
  // ========== اعتبارسنجی قبل از مونگو برای ویرایش ==========
  if (updates.name) {
    const existing = await GameNet.findOne({
      name: updates.name,
      _id: { $ne: id },
    });
    if (existing) {
      throw new Error(`گیم‌نت با نام "${updates.name}" قبلاً ثبت شده است.`);
    }
  }
  const gameNet = await GameNet.findByIdAndUpdate(id, updates, {
    new: true,
    runValidators: true,
  });
  if (!gameNet) throw new Error('گیم‌نت یافت نشد');
  return gameNet;
};

exports.updateSettings = async (id, settings) => {
  const gameNet = await GameNet.findById(id);
  if (!gameNet) throw new Error('گیم‌نت یافت نشد');
  gameNet.settings = { ...gameNet.settings, ...settings };
  await gameNet.save();
  return gameNet;
};

exports.updateTheme = async (id, theme) => {
  const gameNet = await GameNet.findByIdAndUpdate(id, { theme }, { new: true });
  if (!gameNet) throw new Error('گیم‌نت یافت نشد');
  return gameNet;
};

exports.deleteGameNet = async (id) => {
  const result = await GameNet.deleteOne({ _id: id });
  if (result.deletedCount === 0) throw new Error('گیم‌نت یافت نشد');
};
