const CafeItem = require("./cafe.model");

exports.createItem = async (data, gameNetId) => {
  return CafeItem.create({ ...data, gameNetId });
};

exports.getItems = async (gameNetId) => {
  return CafeItem.find({ gameNetId }).sort("name");
};

exports.updateItem = async (id, data, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error("Item not found");
  Object.assign(item, data);
  await item.save();
  return item;
};

exports.deleteItem = async (id, gameNetId) => {
  const result = await CafeItem.deleteOne({ _id: id, gameNetId });
  if (result.deletedCount === 0) throw new Error("Item not found");
};

// برای کاهش موجودی (هنگام ثبت سفارش)
exports.decreaseStock = async (id, quantity, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error("Item not found");
  if (item.stock < quantity) throw new Error("Insufficient stock");
  item.stock -= quantity;
  await item.save();
  return item;
};

// برای افزایش موجودی (هنگام لغو سفارش یا بازگشت)
exports.increaseStock = async (id, quantity, gameNetId) => {
  const item = await CafeItem.findOne({ _id: id, gameNetId });
  if (!item) throw new Error("Item not found");
  item.stock += quantity;
  await item.save();
  return item;
};
