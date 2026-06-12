const express = require("express");
const router = express.Router();
const { auth } = require("../../middlewares/auth");
const {
  getItems,
  createItem,
  updateItem,
  deleteItem,
} = require("./cafe.controller");

router.use(auth);
router.get("/", getItems);
router.post("/", createItem);
router.put("/:id", updateItem);
router.delete("/:id", deleteItem);

module.exports = router;
