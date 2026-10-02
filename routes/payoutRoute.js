const express = require("express");
const { protect, allowedTo } = require("../middleware/authMiddleware");
const workerPayoutService = require("../services/workerPayoutService");

const router = express.Router();

/**
 * POST /payouts/workers/details
 * Worker registers or updates their payout details
 */
router.post(
  "/workers/details",
  protect,
  allowedTo("worker"),
  async (req, res, next) => {
    try {
      const result = await workerPayoutService.registerPayoutDetails(
        req.user._id,
        req.body
      );

      res.status(200).json({
        status: "success",
        message: "Payout details updated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /payouts/workers/details
 * Get worker's payout details
 */
router.get(
  "/workers/details",
  protect,
  allowedTo("worker"),
  async (req, res, next) => {
    try {
      const result = await workerPayoutService.getPayoutDetails(req.user._id);

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
 * POST /payouts/jobs/:jobId/process
 * Process payouts for a completed job
 */
router.post(
  "/jobs/:jobId/process",
  protect,
  allowedTo("employer", "admin"),
  async (req, res, next) => {
    try {
      const result = await workerPayoutService.processJobPayouts(
        req.params.jobId,
        req.user
      );

      res.status(200).json({
        status: "success",
        message: "Payouts processed successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /payouts/workers/:workerId/retry
 * Retry a failed payout for a worker
 */
router.post(
  "/workers/:workerId/retry",
  protect,
  allowedTo("admin", "employer"),
  async (req, res, next) => {
    try {
      const result = await workerPayoutService.retryWorkerPayout(
        req.params.workerId,
        req.body.jobId,
        req.user
      );

      res.status(200).json({
        status: "success",
        message: "Payout retry initiated successfully",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /payouts/jobs/:jobId/status
 * Get payout status for a job
 */
router.get(
  "/jobs/:jobId/status",
  protect,
  allowedTo("employer", "worker", "admin"),
  async (req, res, next) => {
    try {
      const result = await workerPayoutService.getPayoutStatus(
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
 * POST /payouts/webhook
 * Paymob disbursement callback for asynchronous bank transactions
 */
router.post("/webhook", async (req, res, next) => {
  try {
    const callbackSecret =
      req.headers["x-paymob-callback-secret"] || req.query.secret;
    const result = await workerPayoutService.handlePayoutWebhook(
      req.body,
      callbackSecret
    );

    res.status(200).json({
      status: "success",
      message: "Payout webhook processed successfully",
      data: result,
    });
  } catch (error) {
    res.status(error.statusCode || 500).json({
      status: "fail",
      message: error.message,
    });
  }
});

module.exports = router;
