const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");
const Job = require("../models/jobModel");
const paymobService = require("./paymobService");
const { sendNotificationNow } = require("./notificationService");
const User = require("../models/userModel");

/* =====================================================
   INITIATE PAYMENT FOR JOB
===================================================== */

/**
 * Initiate payment for a job after workers are accepted
 * @param {string} jobId - Job ID
 * @param {Object} user - User object (employer)
 * @returns {Promise<Object>} Payment link and order details
 */
exports.initiateJobPayment = asyncHandler(async (jobId, user) => {
  /* ================= VALIDATION ================= */

  if (user.role !== "employer") {
    throw new ApiError("Only employers can initiate payments", 403);
  }

  /* ================= GET JOB ================= */

  const job = await Job.findOne({
    _id: jobId,
    employerId: user._id,
  }).select(
    "title totalAmount pricePerHour dailyWorkHours requiredWorkers acceptedWorkersCount payment"
  );

  if (!job) {
    throw new ApiError("Job not found or unauthorized", 404);
  }

  /* ================= CHECK JOB STATUS ================= */

  if (job.payment?.status !== "pending") {
    throw new ApiError(
      `Payment already initiated or completed. Current status: ${job.payment?.status}`,
      400
    );
  }

  if (job.acceptedWorkersCount < job.requiredWorkers) {
    throw new ApiError(
      `Not all workers accepted yet. ${job.acceptedWorkersCount}/${job.requiredWorkers}`,
      400
    );
  }

  /* ================= AUTHENTICATE WITH PAYMOB ================= */

  let authToken;
  try {
    authToken = await paymobService.authenticate();
  } catch (error) {
    throw new ApiError("Failed to authenticate with payment provider", 500);
  }

  /* ================= REGISTER ORDER ================= */

  const merchantOrderId = paymobService.generateMerchantOrderId(jobId);
  let paymobOrder;
  try {
    paymobOrder = await paymobService.registerOrder(
      {
        amount: job.payment.totalAmount,
        currency: "EGP",
        merchantOrderId,
        customerFirstName: user.firstName,
        customerLastName: user.lastName,
        customerEmail: user.email,
        customerPhone: user.phone,
        items: [
          {
            name: job.title,
            description: `Job payment for ${job.requiredWorkers} workers`,
            amount_cents: Math.round(job.payment.totalAmount * 100),
            quantity: 1,
          },
        ],
      },
      authToken
    );
  } catch (error) {
    throw new ApiError("Failed to register order with payment provider", 500);
  }

  /* ================= REQUEST PAYMENT KEY ================= */

  let paymentKeyResponse;
  try {
    paymentKeyResponse = await paymobService.requestPaymentKey(
      {
        amount: job.payment.totalAmount,
        orderId: paymobOrder.id,
        method: job.payment.method || "card",
        currency: "EGP",
        customerFirstName: user.firstName,
        customerLastName: user.lastName,
        customerEmail: user.email,
        customerPhone: user.phone,
      },
      authToken
    );
  } catch (error) {
    throw new ApiError("Failed to generate payment key", 500);
  }

  /* ================= UPDATE JOB WITH PAYMENT DETAILS ================= */

  job.payment.status = "pending";
  job.payment.escrowId = paymobOrder.id;
  job.payment.paymobOrderId = paymobOrder.id;
  job.payment.paymentLink = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKeyResponse.token}`;

  await job.save();

  /* ================= RETURN RESPONSE ================= */

  return {
    jobId: job._id,
    paymentLink: job.payment.paymentLink,
    amount: job.payment.totalAmount,
    orderId: paymobOrder.id,
    paymentToken: paymentKeyResponse.token,
  };
});

/* =====================================================
   HANDLE PAYMENT WEBHOOK
===================================================== */

/**
 * Handle Paymob webhook notification
 * @param {Object} webhookData - Webhook payload from Paymob
 * @param {string} signature - HMAC signature
 * @returns {Promise<Object>} Processing result
 */
exports.handlePaymentWebhook = asyncHandler(async (webhookData, signature) => {
  /* ================= VERIFY SIGNATURE ================= */

  if (!paymobService.verifyWebhookSignature(webhookData, signature)) {
    throw new ApiError("Invalid webhook signature", 401);
  }

  /* ================= EXTRACT DATA ================= */

  const orderId = webhookData.order?.id;
  const transactionId = webhookData.transaction?.id;
  const success = webhookData.success;
  const amount = webhookData.order?.amount_cents / 100;

  if (!orderId || !transactionId) {
    throw new ApiError("Missing required webhook data", 400);
  }

  /* ================= FIND AND UPDATE JOB ================= */

  const job = await Job.findOne({
    "payment.paymobOrderId": orderId,
  });

  if (!job) {
    throw new ApiError("Job not found for this payment", 404);
  }

  if (success) {
    job.payment.status = "held";
    job.payment.paymobTransactionId = transactionId;
    await job.save();

    /* ================= SEND NOTIFICATION ================= */

    setImmediate(async () => {
      try {
        const employer = await User.findById(job.employerId);
        if (employer?.fcmToken) {
          await sendNotificationNow({
            userId: job.employerId,
            type: "payment_success",
            title: "تم استلام الدفع",
            message: `تم استلام دفعة ${amount} جنيه للوظيفة "${job.title}" بنجاح`,
            relatedJobId: job._id,
          });
        }
      } catch (err) {
        console.error("Notification error:", err.message);
      }
    });

    console.log(`Payment received for job ${job._id}: ${amount} EGP`);
  } else {
    job.payment.status = "pending";
    await job.save();
    console.log(`Payment failed for job ${job._id}`);
  }

  return {
    jobId: job._id,
    success,
    status: job.payment.status,
  };
});

/* =====================================================
   GET PAYMENT STATUS
===================================================== */

/**
 * Get payment status for a job
 * @param {string} jobId - Job ID
 * @returns {Promise<Object>} Payment status details
 */
exports.getPaymentStatus = asyncHandler(async (jobId) => {
  const job = await Job.findById(jobId).select("payment title");

  if (!job) {
    throw new ApiError("Job not found", 404);
  }

  return {
    jobId: job._id,
    title: job.title,
    paymentStatus: job.payment?.status,
    amount: job.payment?.totalAmount,
    escrowId: job.payment?.escrowId,
  };
});

/* =====================================================
   INITIATE REFUND
===================================================== */

/**
 * Initiate refund for a job payment
 * @param {string} jobId - Job ID
 * @param {Object} user - User object (employer or admin)
 * @returns {Promise<Object>} Refund result
 */
exports.initiateRefund = asyncHandler(async (jobId, user) => {
  /* ================= GET JOB ================= */

  const job = await Job.findById(jobId);

  if (!job) {
    throw new ApiError("Job not found", 404);
  }

  /* ================= AUTHORIZATION ================= */

  if (user.role !== "admin" && user._id.toString() !== job.employerId.toString()) {
    throw new ApiError("Unauthorized to refund this payment", 403);
  }

  /* ================= CHECK PAYMENT STATUS ================= */

  if (job.payment?.status !== "held") {
    throw new ApiError(
      `Cannot refund. Payment status is ${job.payment?.status}`,
      400
    );
  }

  if (!job.payment?.paymobTransactionId) {
    throw new ApiError("No transaction ID found for refund", 400);
  }

  /* ================= AUTHENTICATE WITH PAYMOB ================= */

  let authToken;
  try {
    authToken = await paymobService.authenticate();
  } catch (error) {
    throw new ApiError("Failed to authenticate with payment provider", 500);
  }

  /* ================= INITIATE REFUND ================= */

  try {
    const refundResponse = await paymobService.initiateRefund(
      {
        transactionId: job.payment.paymobTransactionId,
      },
      authToken
    );

    job.payment.status = "refunded";
    await job.save();

    /* ================= SEND NOTIFICATION ================= */

    setImmediate(async () => {
      try {
        const employer = await User.findById(job.employerId);
        if (employer?.fcmToken) {
          await sendNotificationNow({
            userId: job.employerId,
            type: "refund_processed",
            title: "تم استرجاع الدفع",
            message: `تم استرجاع مبلغ ${job.payment.totalAmount} جنيه للوظيفة "${job.title}"`,
            relatedJobId: job._id,
          });
        }
      } catch (err) {
        console.error("Notification error:", err.message);
      }
    });

    return {
      jobId: job._id,
      status: "refunded",
      amount: job.payment.totalAmount,
      transactionId: refundResponse.id,
    };
  } catch (error) {
    throw new ApiError("Failed to initiate refund", 500);
  }
});
