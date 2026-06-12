require("dotenv").config();
const bcrypt = require("bcrypt");
const connectDB = require("./src/db/mongoose");
const User = require("./src/modules/user/user.model");
const GameNet = require("./src/modules/gameNet/gameNet.model");

const seed = async () => {
  await connectDB();

  // بررسی وجود سوپرادمین
  const superAdminExists = await User.findOne({ role: "superAdmin" });
  if (superAdminExists) {
    console.log("Super admin already exists");
    process.exit(0);
  }

  // ساخت یک گیم‌نت پیش‌فرض (برای تست)
  const defaultGameNet = await GameNet.create({
    name: "گیم‌نت نمونه",
    address: "تهران",
    phone: "02111111",
    expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 سال
  });

  const hashedPassword = await bcrypt.hash("Admin123!", 10);
  await User.create({
    firstName: "Super",
    lastName: "Admin",
    username: "superadmin",
    password: hashedPassword,
    email: "super@example.com",
    role: "superAdmin",
    isActive: true,
  });

  console.log("Super admin created. Username: superadmin, Password: Admin123!");
  process.exit(0);
};

seed();
