const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth");
const {
  getSessions,
  startSession,
  reserveSession,
  startReserved,
  closeSession,
  changeMode,
  changeTable,
  addCafeOrder,
  addPayment,
  editSession,
  deleteSession,
  reactivateSession,
} = require("./session.controller");

router.use(auth);
router.get("/", getSessions);
router.post("/start", startSession);
router.post("/reserve", reserveSession);
router.post("/:id/start-reserved", startReserved);
router.post("/:id/close", closeSession);
router.put("/:id/mode", changeMode);
router.put("/:id/table", changeTable);
router.post("/:id/cafe", addCafeOrder);
router.post("/:id/payment", addPayment);
router.put("/:id", editSession);
router.delete("/:id", deleteSession);
router.post("/:id/reactivate", reactivateSession);

module.exports = router;
