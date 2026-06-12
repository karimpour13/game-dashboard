const express = require("express");
const router = express.Router();
const { auth, isSuperAdmin } = require("../../middlewares/auth");
const {
  createGameNet,
  getGameNets,
  getGameNet,
  updateGameNet,
  updateSettings,
  updateTheme,
  deleteGameNet,
} = require("./gameNet.controller");

// همه مسیرها نیاز به احراز هویت دارند
router.use(auth);

// فقط سوپرادمین می‌تواند گیم‌نت‌ها را مدیریت کند
router.post("/", isSuperAdmin, createGameNet);
router.get("/", isSuperAdmin, getGameNets);
router.put("/:id", isSuperAdmin, updateGameNet);
router.delete("/:id", isSuperAdmin, deleteGameNet);

// اما مشاهده یک گیم‌نت خاص برای کاربر لاگین شده (چه ادمین چه سوپرادمین) مجاز است
// در کنترلر باید بررسی شود که ادمین فقط گیم‌نت خودش را ببیند
router.get("/:id", getGameNet);
router.put("/:id/settings", updateSettings);
router.put("/:id/theme", updateTheme);

module.exports = router;
