const express = require("express");
const router = express.Router();
const {
  login,
  refresh,
  logout,
  getMe,
  verifySystemPassword,
} = require("./auth.controller");
const { auth } = require("../../middlewares/auth");

router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", auth, logout);
router.get("/me", auth, getMe);
router.post("/verify-system-password", auth, verifySystemPassword);

module.exports = router;
