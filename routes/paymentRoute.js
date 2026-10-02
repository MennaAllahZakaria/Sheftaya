const express = require("express");
const { protect, allowedTo } = require("../middleware/authMiddleware");
const paymentService = require("../services/paymentService");

const router = express.Router();

/**
 * POST /payments/jobs/:jobId/initiate
 * Employer initiates payment for a job after accepting workers
 */
router.post(
  "/jobs/:jobId/initiate",
  protect,
  allowedTo("employer"),
  async (req, res, next) => {
    try {
      const result = await paymentService.initiateJobPayment(
        req.params.jobId,
        req.user
      );

      res.status(200).json({
        status: "success",
        message: "Payment initiated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /payments/webhook
 * Receive payment notifications from Paymob
 */
router.post("/webhook", async (req, res, next) => {
  try {
    const signature =
      req.headers["hmac-signature"] ||
      req.headers["x-paymob-hmac"] ||
      req.query.hmac ||
      req.body?.hmac;

    const result = await paymentService.handlePaymentWebhook(
      req.body,
      signature
    );

    res.status(200).json({
      status: "success",
      message: "Webhook processed successfully",
      data: result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "fail",
      message: error.message,
    });
  }
});

/**
 * GET /payments/jobs/:jobId/status
 * Get payment status for a job
 */
router.get(
  "/jobs/:jobId/status",
  protect,
  allowedTo("employer", "worker", "admin"),
  async (req, res, next) => {
    try {
      const result = await paymentService.getPaymentStatus(
        req.params.jobId,
        req.user
      );

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /payments/jobs/:jobId/refund
 * Initiate refund for a job payment
 */
router.post(
  "/jobs/:jobId/refund",
  protect,
  allowedTo("employer", "admin"),
  async (req, res, next) => {
    try {
      const result = await paymentService.initiateRefund(
        req.params.jobId,
        req.user
      );

      res.status(200).json({
        status: "success",
        message: "Refund initiated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
