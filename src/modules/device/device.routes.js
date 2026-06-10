const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth");
const {
  getDevices,
  getDevice,
  createDevice,
  updateDevice,
  deleteDevice,
} = require("./device.controller");

router.use(auth);
router.get("/", getDevices);
router.post("/", createDevice);
router.get("/:id", getDevice);
router.put("/:id", updateDevice);
router.delete("/:id", deleteDevice);

module.exports = router;
