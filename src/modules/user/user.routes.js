const express = require("express");
const router = express.Router();
const {
  createUser,
  getUsers,
  updateUser,
  deleteUser,
} = require("./user.controller");
const { auth, isSuperAdmin } = require("../../middlewares/auth");

// همه مسیرهای مدیریت کاربران نیاز به احراز هویت و سطح سوپرادمین دارند
router.use(auth);
router.use(isSuperAdmin);

router.post("/", createUser);
router.get("/", getUsers);
router.put("/:id", updateUser);
router.delete("/:id", deleteUser);

module.exports = router;
