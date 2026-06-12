const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth");
const {
  getDeletedSessions,
  deleteForever,
  restoreSession,
} = require("./deletedSession.controller");

router.use(auth);
router.get("/", getDeletedSessions);
router.delete("/:id", deleteForever);
router.post("/:id/restore", restoreSession); // اختیاری

module.exports = router;
