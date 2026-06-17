const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: parseInt(process.env.EMAIL_PORT),
  secure: process.env.EMAIL_PORT == '465',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: { rejectUnauthorized: false },
});

async function sendResetEmail(to, resetLink) {
  const mailOptions = {
    from: `"GameNet Support" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'بازیابی رمز عبور - سامانه مدیریت گیم‌نت',
    html: `
      <div dir="rtl" style="font-family: Tahoma, sans-serif; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #ccc; border-radius: 10px;">
        <h2 style="color: #0055cc;">بازیابی رمز عبور</h2>
        <p>برای تعیین رمز عبور جدید، روی لینک زیر کلیک کنید:</p>
        <a href="${resetLink}" style="display: inline-block; background: #0055cc; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">بازیابی رمز عبور</a>
        <p>این لینک به مدت ۱ ساعت معتبر است.</p>
        <p>اگر شما درخواست نکرده‌اید، این ایمیل را نادیده بگیرید.</p>
        <hr>
        <p style="font-size: 12px; color: gray;">سیستم مدیریت گیم‌نت</p>
      </div>
    `,
  };
  await transporter.sendMail(mailOptions);
}

module.exports = { sendResetEmail };
