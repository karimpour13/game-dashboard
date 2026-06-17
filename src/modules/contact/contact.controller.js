const nodemailer = require('nodemailer');
const multer = require('multer');
const User = require('../user/user.model');
const GameNet = require('../gameNet/gameNet.model');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: false,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const upload = multer({ storage: multer.memoryStorage() });

exports.submitSupport = async (req, res, next) => {
  try {
    // اطلاعات فرم (که کاربر وارد کرده)
    const { name, email, subjectType, message } = req.body;
    const file = req.file;

    if (!name || !email || !subjectType || !message) {
      return res.status(400).json({ message: 'تمامی فیلدها الزامی است' });
    }

    // ========== استخراج اطلاعات کامل کاربر لاگین شده ==========
    const userId = req.user.id;
    const user = await User.findById(userId)
      .select('-password -refreshToken')
      .lean();
    const gameNet = user.gameNetId
      ? await GameNet.findById(user.gameNetId).lean()
      : null;

    // اطلاعاتی که از دیتابیس می‌گیریم (غیر امنیتی)
    const userFullInfo = `
      <strong>🆔 شناسه کاربر (سیستم):</strong> ${user._id}<br>
      <strong>👤 نام و نام خانوادگی:</strong> ${user.firstName} ${user.lastName}<br>
      <strong>📛 نام کاربری:</strong> ${user.username}<br>
      <strong>📧 ایمیل ثبت شده:</strong> ${user.email}<br>
      <strong>📅 آخرین لاگین:</strong> ${user.lastLogin ? new Date(user.lastLogin).toLocaleString('fa-IR') : 'نامشخص'}<br>
      <strong>🕒 آخرین فعالیت:</strong> ${user.lastActivity ? new Date(user.lastActivity).toLocaleString('fa-IR') : 'نامشخص'}<br>
      ${
        gameNet
          ? `
      <strong>🏢 نام گیم‌نت:</strong> ${gameNet.name}<br>
      <strong>📍 آدرس گیم‌نت:</strong> ${gameNet.address || 'ثبت نشده'}<br>
      <strong>📞 تلفن گیم‌نت:</strong> ${gameNet.phone || 'ثبت نشده'}<br>
      <strong>⏳ انقضا:</strong> ${gameNet.expiresAt ? new Date(gameNet.expiresAt).toLocaleDateString('fa-IR') : 'نامشخص'}<br>
      `
          : '<strong>🏢 گیم‌نت:</strong> (سوپرادمین یا بدون گیم‌نت)'
      }
    `;

    // اطلاعاتی که کاربر در فرم تایپ کرده (ممکن است متفاوت باشد)
    const userEnteredInfo = `
      <strong>نام وارد شده در فرم:</strong> ${name}<br>
      <strong>ایمیل وارد شده در فرم:</strong> ${email}<br>
    `;

    const attachments = file
      ? [
          {
            filename: file.originalname,
            content: file.buffer,
            contentType: file.mimetype,
          },
        ]
      : [];

    const mailOptions = {
      from: `"پشتیبانی گیم‌نت" <${process.env.EMAIL_USER}>`,
      to: process.env.CONTACT_EMAIL || process.env.EMAIL_USER,
      subject: `پیام پشتیبانی: ${subjectType} - از ${user.firstName} ${user.lastName}`,
      html: `
        <div dir="rtl" style="font-family: Tahoma, sans-serif;">
          <h3>📩 پیام جدید از فرم پشتیبانی</h3>
          <p><strong>موضوع:</strong> ${subjectType}</p>
          <p><strong>متن پیام:</strong></p>
          <p style="background:#f4f4f4; padding:10px; border-radius:8px;">${message.replace(/\n/g, '<br>')}</p>
          <hr>
          <h4>🔍 اطلاعات کاربر لاگین شده (از دیتابیس)</h4>
          <p>${userFullInfo}</p>
          <hr>
          <h4>✍️ اطلاعات وارد شده در فرم (توسط کاربر)</h4>
          <p>${userEnteredInfo}</p>
        </div>
      `,
      attachments,
    };

    await transporter.sendMail(mailOptions);
    res.status(200).json({ message: 'پیام شما با موفقیت ارسال شد' });
  } catch (err) {
    console.error(err);
    next({ status: 500, message: 'خطا در ارسال پیام. لطفاً بعداً تلاش کنید.' });
  }
};

exports.uploadSingle = upload.single('attachment');
