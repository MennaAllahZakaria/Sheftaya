const express = require("express");
const authMiddleware = require("../middleware/authMiddleware");
const workerPayoutService = require("../services/workerPayoutService");

const router = express.Router();

/**
 * POST /payouts/workers/details
 * Worker registers or updates their payout details
 */
router.post(
  "/workers/details",
  authMiddleware,
  async (req, res, next) => {
    try {
      const workerId = req.user._id;
      const result = await workerPayoutService.registerPayoutDetails(
        workerId,
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
  authMiddleware,
  async (req, res, next) => {
    try {
      const workerId = req.user._id;
      const result = await workerPayoutService.getPayoutDetails(workerId);

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
  authMiddleware,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const result = await workerPayoutService.processJobPayouts(jobId, req.user);

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
  authMiddleware,
  async (req, res, next) => {
    try {
      const { workerId } = req.params;
      const { jobId, amount } = req.body;

      const result = await workerPayoutService.retryWorkerPayout(
        workerId,
        jobId,
        amount
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
  authMiddleware,
  async (req, res, next) => {
    try {
      const { jobId } = req.params;
      const result = await workerPayoutService.getPayoutStatus(jobId);

      res.status(200).json({
        status: "success",
        data: result,
      });
    } catch (error) {
      next(error);
    }
  }
);

module.exports = router;
