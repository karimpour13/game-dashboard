const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth");
const { exportDailyReport } = require("./report.controller");

router.use(auth);
router.get("/export", exportDailyReport);

module.exports = router;
