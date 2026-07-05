const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const paymentService = require("../services/paymentService");

const router = express.Router();

/**
 * POST /payments/jobs/:jobId/initiate
 * Employer initiates payment for a job after accepting workers
 */
router.post(
  "/jobs/:jobId/initiate",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const result = await paymentService.initiateJobPayment(jobId, req.user);

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
router.post(
  "/webhook",
  async (req, res, next) => {
    try {
      const webhookData = req.body;
      const signature = req.headers["hmac-signature"] || req.query.hmac;

      const result = await paymentService.handlePaymentWebhook(
        webhookData,
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
  }
);

/**
 * GET /payments/jobs/:jobId/status
 * Get payment status for a job
 */
router.get(
  "/jobs/:jobId/status",
  authMiddleware,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const result = await paymentService.getPaymentStatus(jobId);

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
  authMiddleware,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const result = await paymentService.initiateRefund(jobId, req.user);

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
