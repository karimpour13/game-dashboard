const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const checkExpiration = require('./middlewares/checkExpiration');
const errorHandler = require('./middlewares/errorHandler');
const updateLastActivity = require('./middlewares/updateLastActivity');
const { auth } = require('./middlewares/auth');

const app = express();

// Middlewares
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors());
app.use(express.json());
app.use(checkExpiration);
app.use(morgan('dev'));

// Static files (frontend)
app.use(express.static(path.join(__dirname, '../public')));

// مسیرهای عمومی (بدون احراز هویت)
app.use('/api/v1/auth', require('./modules/auth/auth.routes'));

// مسیرهای محافظت شده (با احراز هویت + به‌روزرسانی lastActivity)
app.use(
  '/api/v1/users',
  auth,
  updateLastActivity,
  require('./modules/user/user.routes')
);
app.use(
  '/api/v1/gameNets',
  auth,
  updateLastActivity,
  require('./modules/gameNet/gameNet.routes')
);
app.use(
  '/api/v1/devices',
  auth,
  updateLastActivity,
  require('./modules/device/device.routes')
);
app.use(
  '/api/v1/cafe',
  auth,
  updateLastActivity,
  require('./modules/cafe/cafe.routes')
);
app.use(
  '/api/v1/sessions',
  auth,
  updateLastActivity,
  require('./modules/session/session.routes')
);
app.use(
  '/api/v1/reports',
  auth,
  updateLastActivity,
  require('./modules/report/report.routes')
);
app.use(
  '/api/v1/deleted',
  auth,
  updateLastActivity,
  require('./modules/deletedSession/deletedSession.routes')
);
app.use(
  '/api/contact',
  auth,
  updateLastActivity,
  require('./modules/contact/contact.routes')
);

// 404 handler
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    return next({ status: 404, message: 'API endpoint not found' });
  }
  res.status(404).sendFile(path.join(__dirname, '../public/404.html'));
});

// Global error handler
app.use(errorHandler);

module.exports = app;
