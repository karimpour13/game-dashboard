const CafeItem = require('./cafe.model');

exports.createItem = async (data, gameNetId) => {
  return CafeItem.create({ ...data, gameNetId });
};

exports.getItems = async (gameNetId) => {
  return CafeItem.find({ gameNetId }).sort('name');
};

exports.updateItem = async (id, data, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error('آیتم یافت نشد');
  Object.assign(item, data);
  await item.save();
  return item;
};

exports.deleteItem = async (id, gameNetId) => {
  const result = await CafeItem.deleteOne({ _id: id, gameNetId });
  if (result.deletedCount === 0) throw new Error('آیتم یافت نشد');
};

// برای کاهش موجودی (هنگام ثبت سفارش)
exports.decreaseStock = async (id, quantity, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error('آیتم یافت نشد');
  if (item.stock < quantity) throw new Error('موجودی انبار کافی نیست');
  item.stock -= quantity;
  await item.save();
  return item;
};

// برای افزایش موجودی (هنگام لغو سفارش یا بازگشت)
exports.increaseStock = async (id, quantity, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error('آیتم یافت نشد');
  item.stock += quantity;
  await item.save();
  return item;
};
