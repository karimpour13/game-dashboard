const DeletedSession = require('./deletedSession.model');

/**
 * دریافت همه جلسات حذف شده برای یک گیم‌نت خاص
 * @param {string} gameNetId
 */
exports.getDeletedSessions = async (req, res, next) => {
  try {
    let gameNetId = req.user.gameNetId;
    if (req.user.role === 'superAdmin') {
      if (!req.query.gameNetId)
        throw new Error('gameNetId required for superAdmin');
      gameNetId = req.query.gameNetId;
    }

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const query = { gameNetId };
    const total = await DeletedSession.countDocuments(query);
    const sessions = await DeletedSession.find(query)
      .sort({ deletedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      data: sessions,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};

/**
 * حذف همیشگی یک جلسه از سطل آشغال
 * @param {string} id
 * @param {string} gameNetId
 */
exports.deleteForever = async (id, gameNetId) => {
  const result = await DeletedSession.deleteOne({ _id: id, gameNetId });
  if (result.deletedCount === 0) throw new Error('Deleted جلسه یافت نشد');
};

/**
 * (اختیاری) بازگرداندن جلسه به جدول اصلی
 * @param {string} id
 * @param {string} gameNetId
 */
exports.restoreSession = async (id, gameNetId) => {
  const deleted = await DeletedSession.findOne({ _id: id, gameNetId });
  if (!deleted) throw new Error('Deleted جلسه یافت نشد');

  const Session = require('../session/session.model');
  const sessionData = deleted.session;
  // حذف فیلدهای اضافی که نباید در جلسه جدید باشند
  delete sessionData._id;
  delete sessionData.createdAt;
  delete sessionData.updatedAt;
  sessionData.status = 'closed'; // یا هر وضعیت مناسب
  const restored = await Session.create(sessionData);

  await DeletedSession.deleteOne({ _id: id });
  return restored;
};
