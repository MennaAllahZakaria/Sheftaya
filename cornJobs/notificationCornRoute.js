const express = require("express");
const router = express.Router();

const { startNotificationCron } = require("./notificationCron");

router.get("/notify", startNotificationCron);

module.exports = router;