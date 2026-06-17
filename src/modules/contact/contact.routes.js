const express = require('express');
const { submitSupport, uploadSingle } = require('./contact.controller');
const router = express.Router();

router.post('/support', uploadSingle, submitSupport);

module.exports = router;
