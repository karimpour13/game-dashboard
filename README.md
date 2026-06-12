# 🎮 مدیریت گیم‌نت | GameNet Manager

> یک سیستم مدیریت ساده و جذاب برای گیم‌نت‌ها و کافی‌نت‌ها، ساخته شده با Node.js

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18-blue.svg)](https://nodejs.org/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

---

## 📖 معرفی

پروژه **مدیریت گیم‌نت** یک ابزار تحت وب است که به شما امکان می‌دهد:

- سیستم‌های گیم‌نت خود را مدیریت کنید
- زمان اتصال کاربران را کنترل کنید
- مصرف اینترنت و سخت‌افزار را مانیتور کنید
- گزارش‌گیری آنلاین و آفلاین داشته باشید

این پروژه با **Node.js** نوشته شده و ظاهری ساده اما حرفه‌ای دارد.

---

## ✨ امکانات کلیدی

- ✅ پنل مدیریت کاربران (افزودن، حذف، تمدید زمان)
- ✅ نمایش آنلاین بودن سیستم‌ها (با WebSocket)
- ✅ سیستم رزرو صندلی و سیستم‌ها
- ✅ گزارش مصرف پهنای باند و زمان
- ✅ رابط کاربری واکنش‌گرا (Responsive) با EJS + TailwindCSS
- ✅ امنیت اولیه با JWT و رمزنگاری پسورد
- ✅ لاگ فعالیت و پشتیبان‌گیری خودکار

---

## 🛠 تکنولوژی‌های استفاده شده

| بخش           | فناوری(ها)                              |
|---------------|------------------------------------------|
| Backend       | Node.js, Express.js, Socket.io          |
| Database      | MongoDB (Mongoose) یا PostgreSQL        |
| Frontend      | EJS (template engine), TailwindCSS, JS  |
| Authentication | JWT, bcrypt                             |
| Realtime      | Socket.io                               |

---

## 📦 نصب و راه‌اندازی

1️⃣ **کلون کردن مخزن**

```bash
git clone https://github.com/karimpour13/game-dashboard.git
cd gamenet-manager
