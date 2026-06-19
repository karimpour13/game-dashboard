const path = require('path');

const errorHandler = (err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;

  // فقط درخواست‌های API (که با /api شروع می‌شوند) باید پاسخ JSON دریافت کنند
  if (req.path.startsWith('/api')) {
    return res.status(status).json({
      message: err.message || 'خطای داخلی سرور',
      ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
    });
  }

  // برای سایر درخواست‌ها (صفحات وب) صفحه خطای HTML سفارشی را نمایش بده
  const errorPage = status === 404 ? '404.html' : '500.html';
  res
    .status(status)
    .sendFile(path.join(__dirname, `../../public/${errorPage}`));
};

module.exports = errorHandler;
