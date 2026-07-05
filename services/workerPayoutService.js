const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const paymobService = require("./paymobService");
const payoutService = require("./payoutService");
const { sendNotificationNow } = require("./notificationService");

/* =====================================================
   REGISTER WORKER PAYOUT DETAILS
===================================================== */

/**
 * Register or update worker's payout details
 * @param {string} workerId - Worker ID
 * @param {Object} payoutDetails - Payout details
 * @returns {Promise<Object>} Updated payout details
 */
exports.registerPayoutDetails = asyncHandler(async (workerId, payoutDetails) => {
  const { method, mobileWalletNumber, walletIssuer, bankCardNumber, bankCode, bankName, bankTransactionType, fullName, firstName, lastName } = payoutDetails;

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

  /* ================= UPDATE USER ================= */

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

  /* ================= RETURN RESPONSE ================= */

  return {
    workerId: user._id,
    payoutDetails: user.workerPayoutDetails,
  };
});

/* =====================================================
   GET WORKER PAYOUT DETAILS
===================================================== */

/**
 * Get worker's payout details
 * @param {string} workerId - Worker ID
 * @returns {Promise<Object>} Payout details
 */
exports.getPayoutDetails = asyncHandler(async (workerId) => {
  const user = await User.findById(workerId).select("workerPayoutDetails");

  if (!user) {
    throw new ApiError("User not found", 404);
  }

  return {
    workerId: user._id,
    payoutDetails: user.workerPayoutDetails,
  };
});

/* =====================================================
   PROCESS JOB PAYOUTS
===================================================== */

/**
 * Process payouts for a completed job
 * @param {string} jobId - Job ID
 * @param {Object} user - User object (employer or admin)
 * @returns {Promise<Object>} Payout results
 */
exports.processJobPayouts = asyncHandler(async (jobId, user) => {
  /* ================= GET JOB ================= */

  const job = await Job.findById(jobId).select(
    "title pricePerHour dailyWorkHours requiredWorkers payment employerId"
  );

  if (!job) {
    throw new ApiError("Job not found", 404);
  }

  /* ================= AUTHORIZATION ================= */

  if (user.role !== "admin" && user._id.toString() !== job.employerId.toString()) {
    throw new ApiError("Unauthorized to process payouts for this job", 403);
  }

  /* ================= CHECK PAYMENT STATUS ================= */

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
    .populate("workerId", "workerPayoutDetails email firstName lastName")
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
    job.payment.status = "paid";
  } else if (successfulPayouts.length > 0) {
    job.payment.status = "paid";
    console.warn(
      `Partial payout success for job ${jobId}: ${successfulPayouts.length}/${applications.length} successful`
    );
  } else {
    throw new ApiError("All payouts failed. Please retry.", 500);
  }

  await job.save();

  /* ================= RETURN RESPONSE ================= */

  return {
    jobId,
    totalWorkers: applications.length,
    successful: successfulPayouts.length,
    failed: failedPayouts.length,
    results: payoutResults,
  };
});

/* =====================================================
   RETRY WORKER PAYOUT
===================================================== */

/**
 * Retry a failed payout for a specific worker
 * @param {string} workerId - Worker ID
 * @param {string} jobId - Job ID
 * @param {number} amount - Amount to payout
 * @returns {Promise<Object>} Payout result
 */
exports.retryWorkerPayout = asyncHandler(async (workerId, jobId, amount) => {
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

  /* ================= HANDLE RESPONSE ================= */

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
});

/* =====================================================
   GET PAYOUT STATUS
===================================================== */

/**
 * Get payout status for a job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Payout status details
 */
exports.getPayoutStatus = asyncHandler(async (jobId) => {
  const job = await Job.findById(jobId).select(
    "title payment status confirmation requiredWorkers"
  );

  if (!job) {
    throw new ApiError("Job not found", 404);
  }

  return {
    jobId: job._id,
    title: job.title,
    jobStatus: job.status,
    paymentStatus: job.payment?.status,
    amount: job.payment?.totalAmount,
    isCompleted: job.confirmation?.employerConfirmed,
    requiredWorkers: job.requiredWorkers,
  };
});
