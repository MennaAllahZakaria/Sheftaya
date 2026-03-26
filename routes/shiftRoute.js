const express = require("express");
const router = express.Router();

const {
    onTheWay,
    arrive,
    approveArrival,
    startShift,
    endShift,
    workerConfirm
} = require("../services/shiftService");

const {
    idValidator,
} = require("../utils/validators/applicationValidator");
 
// Auth & Authorization
const { protect, allowedTo } = require("../middleware/authMiddleware");

router.patch("/:id/on-the-way", protect, allowedTo("worker"),idValidator, onTheWay);

router.patch("/:id/arrive", protect, allowedTo("worker"),idValidator, arrive);

router.patch("/:id/approve-arrival", protect, allowedTo("employer"),idValidator, approveArrival);

router.patch("/:id/start", protect, allowedTo("employer"),idValidator, startShift);

router.patch("/:id/end", protect, allowedTo("employer"), idValidator, endShift);

router.patch("/:id/confirm", protect, allowedTo("worker"),idValidator, workerConfirm);

module.exports = router;
