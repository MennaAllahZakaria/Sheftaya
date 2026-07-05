const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const paymobService = require("./paymobService");
const {
  sendNotificationNow,
} = require("./notificationService");

/* =====================================================
   PROCESS PAYOUTS FOR COMPLETED JOB
===================================================== */

/**
 * Process payouts to all workers for a completed job
 * This is called when a job is marked as completed
 * @param {string} jobId - Job ID
 */
exports.processJobPayouts = asyncHandler(async (jobId) => {
  try {
    /* ================= GET JOB ================= */

    const job = await Job.findById(jobId).select(
      "title pricePerHour dailyWorkHours requiredWorkers payment"
    );

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    if (job.payment?.status !== "held") {
      throw new ApiError(
        `Cannot process payouts. Payment status is ${job.payment?.status}`,
        400
      );
    }

    /* ================= GET ACCEPTED WORKERS ================= */

    const applications = await Application.find({
      jobId,
      status: "accepted",
    })
      .select("workerId")
      .populate("workerId", "workerPayoutDetails email firstName lastName phone")
      .lean();

    if (applications.length === 0) {
      throw new ApiError("No accepted workers found for this job", 400);
    }

    /* ================= CALCULATE WORKER SHARE ================= */

    const workerShare =
      (job.pricePerHour.amount * job.dailyWorkHours) / applications.length;

    /* ================= AUTHENTICATE WITH PAYOUTS API ================= */

    let payoutsAccessToken;
    try {
      payoutsAccessToken = await paymobService.authenticatePayouts();
    } catch (error) {
      console.error("Failed to authenticate with Payouts API:", error.message);
      throw new ApiError("Failed to authenticate with payment provider", 500);
    }

    /* ================= PROCESS PAYOUTS FOR EACH WORKER ================= */

    const payoutResults = [];

    for (const application of applications) {
      const worker = application.workerId;

      try {
        // Validate worker payout details
        if (!worker.workerPayoutDetails?.method) {
          console.warn(`Worker ${worker._id} has no payout method configured`);
          payoutResults.push({
            workerId: worker._id,
            status: "failed",
            reason: "No payout method configured",
          });
          continue;
        }

        /* ================= BUILD PAYOUT REQUEST ================= */

        const payoutData = {
          amount: workerShare,
          method: worker.workerPayoutDetails.method,
          clientReferenceId: paymobService.generateClientReferenceId(
            worker._id,
            jobId
          ),
        };

        if (worker.workerPayoutDetails.method === "mobile_wallet") {
          payoutData.issuer = worker.workerPayoutDetails.walletIssuer || "vodafone";
          payoutData.msisdn = worker.workerPayoutDetails.mobileWalletNumber;
        } else if (worker.workerPayoutDetails.method === "bank_card") {
          payoutData.bankCardNumber = worker.workerPayoutDetails.bankCardNumber;
          payoutData.bankCode = worker.workerPayoutDetails.bankCode;
          payoutData.bankTransactionType =
            worker.workerPayoutDetails.bankTransactionType || "salary";
          payoutData.fullName = worker.workerPayoutDetails.fullName;
        } else if (worker.workerPayoutDetails.method === "aman") {
          payoutData.msisdn = worker.workerPayoutDetails.mobileWalletNumber;
          payoutData.firstName = worker.workerPayoutDetails.firstName;
          payoutData.lastName = worker.workerPayoutDetails.lastName;
          payoutData.email = worker.email;
        }

        /* ================= INITIATE PAYOUT ================= */

        const payoutResponse = await paymobService.initiatePayout(
          payoutData,
          payoutsAccessToken
        );

        /* ================= HANDLE PAYOUT RESPONSE ================= */

        if (
          payoutResponse.disbursement_status === "success" ||
          payoutResponse.disbursement_status === "successful" ||
          payoutResponse.disbursement_status === "pending"
        ) {
          payoutResults.push({
            workerId: worker._id,
            status: "success",
            transactionId: payoutResponse.transaction_id,
            amount: workerShare,
            disbursementStatus: payoutResponse.disbursement_status,
          });

          /* ================= SEND NOTIFICATION ================= */

          setImmediate(async () => {
            try {
              if (worker.fcmToken) {
                await sendNotificationNow({
                  userId: worker._id,
                  type: "payout_initiated",
                  title: "تم بدء تحويل الراتب",
                  message: `تم بدء تحويل ${workerShare} جنيه لحسابك بنجاح`,
                  relatedJobId: jobId,
                });
              }
            } catch (err) {
              console.error("Notification error:", err.message);
            }
          });
        } else {
          payoutResults.push({
            workerId: worker._id,
            status: "failed",
            reason: payoutResponse.status_description || "Unknown error",
          });
        }
      } catch (error) {
        console.error(`Payout failed for worker ${worker._id}:`, error.message);
        payoutResults.push({
          workerId: worker._id,
          status: "failed",
          reason: error.message,
        });
      }
    }

    /* ================= UPDATE JOB PAYMENT STATUS ================= */

    const successfulPayouts = payoutResults.filter((r) => r.status === "success");
    const failedPayouts = payoutResults.filter((r) => r.status === "failed");

    if (successfulPayouts.length === applications.length) {
      // All payouts successful
      job.payment.status = "paid";
    } else if (successfulPayouts.length > 0) {
      // Partial success - mark as paid but log the failures
      job.payment.status = "paid";
      console.warn(
        `Partial payout success for job ${jobId}: ${successfulPayouts.length}/${applications.length} successful`
      );
    } else {
      // All payouts failed
      console.error(`All payouts failed for job ${jobId}`);
      throw new ApiError("All payouts failed. Please retry.", 500);
    }

    await job.save();

    return {
      jobId,
      totalWorkers: applications.length,
      successful: successfulPayouts.length,
      failed: failedPayouts.length,
      results: payoutResults,
    };
  } catch (error) {
    console.error("Error processing payouts:", error.message);
    throw error;
  }
});

/* =====================================================
   RETRY FAILED PAYOUT
===================================================== */

/**
 * Retry a failed payout for a specific worker
 * @param {string} workerId - Worker ID
 * @param {string} jobId - Job ID
 * @param {number} amount - Amount to payout
 */
exports.retryWorkerPayout = asyncHandler(async (workerId, jobId, amount) => {
  try {
    /* ================= GET WORKER ================= */

    const worker = await User.findById(workerId).select(
      "workerPayoutDetails email firstName lastName"
    );

    if (!worker || !worker.workerPayoutDetails?.method) {
      throw new ApiError("Worker or payout details not found", 404);
    }

    /* ================= AUTHENTICATE WITH PAYOUTS API ================= */

    let payoutsAccessToken;
    try {
      payoutsAccessToken = await paymobService.authenticatePayouts();
    } catch (error) {
      throw new ApiError("Failed to authenticate with payment provider", 500);
    }

    /* ================= BUILD PAYOUT REQUEST ================= */

    const payoutData = {
      amount,
      method: worker.workerPayoutDetails.method,
      clientReferenceId: paymobService.generateClientReferenceId(workerId, jobId),
    };

    if (worker.workerPayoutDetails.method === "mobile_wallet") {
      payoutData.issuer = worker.workerPayoutDetails.walletIssuer || "vodafone";
      payoutData.msisdn = worker.workerPayoutDetails.mobileWalletNumber;
    } else if (worker.workerPayoutDetails.method === "bank_card") {
      payoutData.bankCardNumber = worker.workerPayoutDetails.bankCardNumber;
      payoutData.bankCode = worker.workerPayoutDetails.bankCode;
      payoutData.bankTransactionType =
        worker.workerPayoutDetails.bankTransactionType || "salary";
      payoutData.fullName = worker.workerPayoutDetails.fullName;
    } else if (worker.workerPayoutDetails.method === "aman") {
      payoutData.msisdn = worker.workerPayoutDetails.mobileWalletNumber;
      payoutData.firstName = worker.workerPayoutDetails.firstName;
      payoutData.lastName = worker.workerPayoutDetails.lastName;
      payoutData.email = worker.email;
    }

    /* ================= INITIATE PAYOUT ================= */

    const payoutResponse = await paymobService.initiatePayout(
      payoutData,
      payoutsAccessToken
    );

    /* ================= RESPONSE ================= */

    if (
      payoutResponse.disbursement_status === "success" ||
      payoutResponse.disbursement_status === "successful" ||
      payoutResponse.disbursement_status === "pending"
    ) {
      return {
        status: "success",
        transactionId: payoutResponse.transaction_id,
        amount,
        disbursementStatus: payoutResponse.disbursement_status,
      };
    } else {
      throw new ApiError(
        payoutResponse.status_description || "Payout failed",
        400
      );
    }
  } catch (error) {
    console.error("Error retrying payout:", error.message);
    throw error;
  }
});
