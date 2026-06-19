const Device = require('./device.model');
const Session = require('../session/session.model');

exports.createDevice = async (data, gameNetId) => {
  return Device.create({ ...data, gameNetId });
};

exports.getDevices = async (gameNetId) => {
  return Device.find({ gameNetId }).sort('order');
};

exports.updateDevice = async (id, data, gameNetId) => {
  const device = await Device.findOne({ _id: id, gameNetId });
  if (!device) throw new Error('دستگاه یافت نشد');
  Object.assign(device, data);
  await device.save();
  return device;
};

exports.deleteDevice = async (id, gameNetId) => {
  // بررسی وجود جلسه فعال روی این دستگاه (بر اساس name یا table)
  const device = await Device.findOne({ _id: id, gameNetId });
  if (!device) throw new Error('دستگاه یافت نشد');
  const activeSession = await Session.findOne({
    gameNetId,
    table: device.name,
    status: 'active',
  });
  if (activeSession)
    throw new Error('نمی‌توانید دستگاهی را که جلسه فعال دارد حذف کنید');
  const result = await Device.deleteOne({ _id: id, gameNetId });
  if (result.deletedCount === 0) throw new Error('دستگاه یافت نشد');
};

exports.getDeviceById = async (id, gameNetId) => {
  const device = await Device.findOne({ _id: id, gameNetId });
  if (!device) throw new Error('دستگاه یافت نشد');
  return device;
};
