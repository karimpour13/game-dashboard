const jwt = require('jsonwebtoken');
const { jwtSecret } = require('../config');

exports.auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next({ status: 401, message: 'توکن ارسال نشده است' });
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, jwtSecret);
    req.user = decoded;
    next();
  } catch (err) {
    next({ status: 401, message: 'توکن نامعتبر است' });
  }
};

exports.isSuperAdmin = (req, res, next) => {
  if (req.user.role !== 'superAdmin')
    return next({ status: 403, message: 'شما دسترسی لازم را ندارید' });
  next();
};
