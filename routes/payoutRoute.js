const express = require("express");
const asyncHandler = require("express-async-handler");
const authMiddleware = require("../middleware/authMiddleware");
const ApiError = require("../utils/apiError");
const User = require("../models/userModel");
const Job = require("../models/jobModel");
const payoutService = require("../services/payoutService");

const router = express.Router();

// ==================== WORKER PAYOUT DETAILS ====================

/**
 * POST /payouts/workers/details
 * Worker registers or updates their payout details
 */
router.post(
  "/workers/details",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const workerId = req.user._id;
    const { method, mobileWalletNumber, walletIssuer, bankCardNumber, bankCode, bankName, bankTransactionType, fullName, firstName, lastName } = req.body;

    /* ================= VALIDATION ================= */

    if (!method || !["mobile_wallet", "bank_card", "aman"].includes(method)) {
      throw new ApiError("Invalid payout method", 400);
    }

    if (method === "mobile_wallet") {
      if (!mobileWalletNumber || !walletIssuer) {
        throw new ApiError("Mobile wallet number and issuer are required", 400);
      }
      if (!/^\d{11}$/.test(mobileWalletNumber)) {
        throw new ApiError("Mobile wallet number must be 11 digits", 400);
      }
    } else if (method === "bank_card") {
      if (!bankCardNumber || !bankCode || !fullName) {
        throw new ApiError("Bank card number, code, and full name are required", 400);
      }
    } else if (method === "aman") {
      if (!mobileWalletNumber || !firstName || !lastName) {
        throw new ApiError("Mobile number, first name, and last name are required for Aman", 400);
      }
    }

    /* ================= UPDATE USER PAYOUT DETAILS ================= */

    const user = await User.findById(workerId);

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    user.workerPayoutDetails = {
      method,
      mobileWalletNumber,
      walletIssuer,
      bankCardNumber,
      bankCode,
      bankName,
      bankTransactionType,
      fullName,
      firstName,
      lastName,
    };

    await user.save();

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Payout details updated successfully",
      data: {
        workerId: user._id,
        payoutDetails: user.workerPayoutDetails,
      },
    });
  })
);

/**
 * GET /payouts/workers/details
 * Get worker's payout details
 */
router.get(
  "/workers/details",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const workerId = req.user._id;

    const user = await User.findById(workerId).select("workerPayoutDetails");

    if (!user) {
      throw new ApiError("User not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: {
        workerId: user._id,
        payoutDetails: user.workerPayoutDetails,
      },
    });
  })
);

// ==================== PROCESS JOB PAYOUTS ====================

/**
 * POST /payouts/jobs/:jobId/process
 * Process payouts for a completed job (called by system/admin)
 */
router.post(
  "/jobs/:jobId/process",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    /* ================= AUTHORIZATION ================= */

    // Only admins or the job employer can process payouts
    const job = await Job.findById(jobId).select("employerId");

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    if (req.user.role !== "admin" && req.user._id.toString() !== job.employerId.toString()) {
      throw new ApiError("Unauthorized to process payouts for this job", 403);
    }

    /* ================= PROCESS PAYOUTS ================= */

    try {
      const result = await payoutService.processJobPayouts(jobId);

      res.status(200).json({
        status: "success",
        message: "Payouts processed successfully",
        data: result,
      });
    } catch (error) {
      throw new ApiError(error.message || "Failed to process payouts", 500);
    }
  })
);

// ==================== RETRY WORKER PAYOUT ====================

/**
 * POST /payouts/workers/:workerId/retry
 * Retry a failed payout for a worker (admin only)
 */
router.post(
  "/workers/:workerId/retry",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { workerId } = req.params;
    const { jobId, amount } = req.body;

    /* ================= AUTHORIZATION ================= */

    if (req.user.role !== "admin") {
      throw new ApiError("Only admins can retry payouts", 403);
    }

    /* ================= VALIDATION ================= */

    if (!jobId || !amount || amount <= 0) {
      throw new ApiError("Job ID and valid amount are required", 400);
    }

    /* ================= RETRY PAYOUT ================= */

    try {
      const result = await payoutService.retryWorkerPayout(workerId, jobId, amount);

      res.status(200).json({
        status: "success",
        message: "Payout retry initiated successfully",
        data: result,
      });
    } catch (error) {
      throw new ApiError(error.message || "Failed to retry payout", 500);
    }
  })
);

// ==================== GET PAYOUT STATUS ====================

/**
 * GET /payouts/jobs/:jobId/status
 * Get payout status for a job
 */
router.get(
  "/jobs/:jobId/status",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await Job.findById(jobId).select(
      "title payment status confirmation requiredWorkers"
    );

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: {
        jobId: job._id,
        title: job.title,
        jobStatus: job.status,
        paymentStatus: job.payment?.status,
        amount: job.payment?.totalAmount,
        isCompleted: job.confirmation?.employerConfirmed,
        requiredWorkers: job.requiredWorkers,
      },
    });
  })
);

module.exports = router;
