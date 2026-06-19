const reportService = require('./report.service');
const GameNet = require('../gameNet/gameNet.model');

exports.exportDailyReport = async (req, res, next) => {
  try {
    const { date } = req.query;
    if (!date) throw new Error('Date is required (e.g., date=1403/09/16)');

    let gameNetId = req.user.gameNetId;
    if (req.user.role === 'superAdmin') {
      if (!req.query.gameNetId)
        throw new Error('gameNetId required for superAdmin');
      gameNetId = req.query.gameNetId;
    }

    const gameNet = await GameNet.findById(gameNetId);
    if (!gameNet) throw new Error('گیم‌نت یافت نشد');
    const priceUnit = gameNet.settings?.priceUnit || 'Toman';

    const csv = await reportService.generateDailyReport(
      gameNetId,
      date,
      priceUnit
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    const englishDate = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_${englishDate}.csv"`
    );
    res.send(csv);
  } catch (err) {
    next({ status: 400, message: err.message });
  }
};
