const express = require("express");
const asyncHandler = require("express-async-handler");
const authMiddleware = require("../middleware/authMiddleware");
const ApiError = require("../utils/apiError");
const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const paymobService = require("../services/paymobService");
const {
  sendNotificationNow,
} = require("../services/notificationService");

const router = express.Router();

// ==================== INITIATE PAYMENT ====================

/**
 * POST /payments/jobs/:jobId/initiate
 * Employer initiates payment for a job after accepting workers
 */
router.post(
  "/jobs/:jobId/initiate",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;
    const employerId = req.user._id;

    /* ================= VALIDATION ================= */

    if (req.user.role !== "employer") {
      throw new ApiError("Only employers can initiate payments", 403);
    }

    /* ================= GET JOB ================= */

    const job = await Job.findOne({
      _id: jobId,
      employerId,
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
          customerFirstName: req.user.firstName,
          customerLastName: req.user.lastName,
          customerEmail: req.user.email,
          customerPhone: req.user.phone,
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
          customerFirstName: req.user.firstName,
          customerLastName: req.user.lastName,
          customerEmail: req.user.email,
          customerPhone: req.user.phone,
        },
        authToken
      );
    } catch (error) {
      throw new ApiError("Failed to generate payment key", 500);
    }

    /* ================= UPDATE JOB WITH PAYMENT DETAILS ================= */

    job.payment.status = "pending"; // Will be updated to "held" after successful payment
    job.payment.escrowId = paymobOrder.id;
    job.payment.paymobOrderId = paymobOrder.id;
    job.payment.paymentLink = `https://accept.paymob.com/api/acceptance/iframes/${process.env.PAYMOB_IFRAME_ID}?payment_token=${paymentKeyResponse.token}`;

    await job.save();

    /* ================= RESPONSE ================= */

    res.status(200).json({
      status: "success",
      message: "Payment initiated successfully",
      data: {
        jobId: job._id,
        paymentLink: job.payment.paymentLink,
        amount: job.payment.totalAmount,
        orderId: paymobOrder.id,
        paymentToken: paymentKeyResponse.token,
      },
    });
  })
);

// ==================== PAYMENT WEBHOOK ====================

/**
 * POST /payments/webhook
 * Receive payment notifications from Paymob
 */
router.post(
  "/webhook",
  asyncHandler(async (req, res) => {
    const webhookData = req.body;
    const signature = req.headers["hmac-signature"] || req.query.hmac;

    /* ================= VERIFY SIGNATURE ================= */

    if (!paymobService.verifyWebhookSignature(webhookData, signature)) {
      console.warn("Invalid webhook signature received");
      return res.status(401).json({
        status: "fail",
        message: "Invalid signature",
      });
    }

    /* ================= EXTRACT DATA ================= */

    const orderId = webhookData.order?.id;
    const transactionId = webhookData.transaction?.id;
    const success = webhookData.success;
    const amount = webhookData.order?.amount_cents / 100;

    if (!orderId || !transactionId) {
      return res.status(400).json({
        status: "fail",
        message: "Missing required webhook data",
      });
    }

    /* ================= UPDATE JOB PAYMENT STATUS ================= */

    try {
      const job = await Job.findOne({
        "payment.paymobOrderId": orderId,
      });

      if (!job) {
        console.warn(`Job not found for order ID: ${orderId}`);
        return res.status(404).json({
          status: "fail",
          message: "Job not found",
        });
      }

      if (success) {
        job.payment.status = "held"; // Funds are now held in escrow
        job.payment.paymobTransactionId = transactionId;

        await job.save();

        /* ================= SEND NOTIFICATION ================= */

        setImmediate(async () => {
          try {
            const employer = await require("../models/userModel").findById(job.employerId);
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
        job.payment.status = "pending"; // Payment failed, reset to pending
        await job.save();

        console.log(`Payment failed for job ${job._id}`);
      }

      res.status(200).json({
        status: "success",
        message: "Webhook processed successfully",
      });
    } catch (error) {
      console.error("Webhook processing error:", error.message);
      res.status(500).json({
        status: "fail",
        message: "Error processing webhook",
      });
    }
  })
);

// ==================== GET PAYMENT STATUS ====================

/**
 * GET /payments/jobs/:jobId/status
 * Get payment status for a job
 */
router.get(
  "/jobs/:jobId/status",
  authMiddleware,
  asyncHandler(async (req, res) => {
    const { jobId } = req.params;

    const job = await Job.findById(jobId).select("payment title");

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    res.status(200).json({
      status: "success",
      data: {
        jobId: job._id,
        title: job.title,
        paymentStatus: job.payment?.status,
        amount: job.payment?.totalAmount,
        escrowId: job.payment?.escrowId,
      },
    });
  })
);

module.exports = router;
