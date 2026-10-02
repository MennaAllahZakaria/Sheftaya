const ApiError = require("../utils/apiError");
const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const paymobService = require("./paymobService");
const { sendNotificationNow } = require("./notificationService");

const SUCCESS_STATUSES = new Set(["success", "successful"]);

const buildPayoutData = (worker, amount, clientReferenceId) => {
  const details = worker.workerPayoutDetails;
  const payoutData = {
    amount,
    method: details.method,
    clientReferenceId,
  };

  if (details.method === "mobile_wallet") {
    payoutData.issuer = details.walletIssuer;
    payoutData.msisdn = details.mobileWalletNumber;
  } else if (details.method === "bank_card") {
    payoutData.bankCardNumber = details.bankCardNumber;
    payoutData.bankCode = details.bankCode;
    payoutData.bankTransactionType = details.bankTransactionType || "cash_transfer";
    payoutData.fullName = details.fullName;
  } else if (details.method === "aman") {
    // Paymob Cashin uses the bank_card/instant_bank channels; Aman is not
    // an issuer in the current Cashin API. Keep the legacy method accepted
    // at the domain layer and fail safely until a supported issuer is mapped.
    throw new ApiError("Aman payout is not supported by the current Paymob Cashin API", 400);
  }

  return payoutData;
};

const notifyWorker = (workerId, amount, jobId) => {
  setImmediate(async () => {
    try {
      await sendNotificationNow({
        userId: workerId,
        type: "payout_initiated",
        title: "تم بدء تحويل الراتب",
        message: `تم بدء تحويل ${amount} جنيه لحسابك بنجاح`,
        relatedJobId: jobId,
      });
    } catch (error) {
      console.error("Payout notification error:", error.message);
    }
  });
};

const resultFromResponse = (workerId, amount, response) => {
  const disbursementStatus = String(response.disbursement_status || "").toLowerCase();
  const accepted = SUCCESS_STATUSES.has(disbursementStatus) || disbursementStatus === "pending";

  if (!accepted) {
    return {
      workerId,
      status: "failed",
      transactionId: response.transaction_id,
      amount,
      reason: response.status_description || "Payout failed",
      disbursementStatus,
    };
  }

  return {
    workerId,
    status: "success",
    transactionId: response.transaction_id,
    amount,
    disbursementStatus,
  };
};

const findPayout = (job, applicationId) =>
  job.payment.payouts?.find((payout) => payout.applicationId?.toString() === applicationId.toString());

exports.registerPayoutDetails = async (workerId, payoutDetails) => {
  const {
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
  } = payoutDetails;

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
  }

  if (method === "bank_card" && (!bankCardNumber || !bankCode || !fullName)) {
    throw new ApiError("Bank card number, code, and full name are required", 400);
  }

  if (method === "aman" && (!mobileWalletNumber || !firstName || !lastName)) {
    throw new ApiError("Mobile number, first name, and last name are required for Aman", 400);
  }

  const user = await User.findById(workerId);
  if (!user) throw new ApiError("User not found", 404);

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
  return { workerId: user._id, payoutDetails: user.workerPayoutDetails };
};

exports.getPayoutDetails = async (workerId) => {
  const user = await User.findById(workerId).select("workerPayoutDetails");
  if (!user) throw new ApiError("User not found", 404);

  return { workerId: user._id, payoutDetails: user.workerPayoutDetails };
};

exports.processJobPayouts = async (jobId, user) => {
  const job = await Job.findById(jobId).select(
    "title status pricePerHour dailyWorkHours requiredWorkers payment employerId"
  );

  if (!job) throw new ApiError("Job not found", 404);
  if (user.role !== "admin" && user._id.toString() !== job.employerId.toString()) {
    throw new ApiError("Unauthorized to process payouts for this job", 403);
  }
  if (job.status !== "completed") {
    throw new ApiError("Payouts can only be processed after job completion", 400);
  }
  if (job.payment?.status !== "held") {
    throw new ApiError(`Cannot process payouts. Payment status is ${job.payment?.status}`, 400);
  }
  if (job.payment.payoutStatus === "completed" || job.payment?.status === "paid") {
    throw new ApiError("Payouts have already been completed", 400);
  }

  const applications = await Application.find({
    jobId,
    status: "accepted",
    shiftStatus: "completed",
  })
    .select("_id workerId")
    .populate("workerId", "workerPayoutDetails email firstName lastName fcmToken")
    .lean();

  if (applications.length === 0) {
    throw new ApiError("No completed workers found for this job", 400);
  }

  const workerShare = Number((job.pricePerHour.amount * job.dailyWorkHours).toFixed(2));
  const pendingResults = [];
  const existingSuccessful = [];
  const existingPending = [];

  for (const application of applications) {
    const previous = findPayout(job, application._id);
    if (previous?.status === "success") {
      existingSuccessful.push({
        workerId: application.workerId._id,
        status: "success",
        transactionId: previous.transactionId,
        amount: previous.amount,
        disbursementStatus: previous.disbursementStatus,
      });
    } else if (previous?.status === "pending") {
      existingPending.push({
        workerId: application.workerId._id,
        status: "success",
        transactionId: previous.transactionId,
        amount: previous.amount,
        disbursementStatus: previous.disbursementStatus || "pending",
      });
    } else {
      pendingResults.push({ application, previous });
    }
  }

  let payoutsAccessToken;
  if (pendingResults.length > 0) {
    try {
      payoutsAccessToken = await paymobService.authenticatePayouts();
    } catch (error) {
      throw new ApiError("Failed to authenticate with payment provider", 500);
    }
  }

  const payoutResults = [...existingSuccessful, ...existingPending];

  for (const { application, previous } of pendingResults) {
    const worker = application.workerId;
    const clientReferenceId = previous?.clientReferenceId ||
      paymobService.generateClientReferenceId(worker._id, jobId);
    let result;

    try {
      if (!worker.workerPayoutDetails?.method) {
        result = {
          workerId: worker._id,
          status: "failed",
          amount: workerShare,
          reason: "No payout method configured",
        };
      } else {
        const payoutResponse = await paymobService.initiatePayout(
          buildPayoutData(worker, workerShare, clientReferenceId),
          payoutsAccessToken
        );
        result = resultFromResponse(worker._id, workerShare, payoutResponse);
      }
    } catch (error) {
      result = {
        workerId: worker._id,
        status: "failed",
        amount: workerShare,
        reason: error.message,
      };
    }

    payoutResults.push(result);
    job.payment.payouts = job.payment.payouts || [];
    job.payment.payouts.push({
      applicationId: application._id,
      workerId: worker._id,
      amount: workerShare,
      clientReferenceId,
      transactionId: result.transactionId,
      status: result.disbursementStatus === "pending" ? "pending" : result.status,
      disbursementStatus: result.disbursementStatus,
      reason: result.reason,
      processedAt: new Date(),
    });

    if (result.status === "success") notifyWorker(worker._id, workerShare, jobId);
  }

  const finalizedCount = payoutResults.filter(
    (result) => result.status === "success" && SUCCESS_STATUSES.has(result.disbursementStatus)
  ).length;
  const initiatedCount = payoutResults.filter((result) => result.status === "success").length;
  const failedCount = payoutResults.filter((result) => result.status === "failed").length;

  if (finalizedCount === applications.length) {
    job.payment.status = "paid";
    job.payment.payoutStatus = "completed";
  } else if (initiatedCount > 0) {
    job.payment.payoutStatus = failedCount > 0 ? "partial" : "processing";
    // Keep funds held until every provider payout is final and successful.
  } else {
    job.payment.payoutStatus = "partial";
  }

  await job.save();

  if (initiatedCount === 0) {
    throw new ApiError("All payouts failed. Please retry.", 500);
  }

  return {
    jobId,
    totalWorkers: applications.length,
    successful: initiatedCount,
    failed: failedCount,
    results: payoutResults,
  };
};

exports.retryWorkerPayout = async (workerId, jobId, user) => {
  const job = await Job.findById(jobId).select(
    "status payment employerId pricePerHour dailyWorkHours payouts"
  );
  if (!job) throw new ApiError("Job not found", 404);
  if (user.role !== "admin" && user._id.toString() !== job.employerId.toString()) {
    throw new ApiError("Unauthorized to retry this payout", 403);
  }
  if (job.status !== "completed" || job.payment?.status !== "held") {
    throw new ApiError("Payout can only be retried for a completed job with held funds", 400);
  }

  const application = await Application.findOne({
    jobId,
    workerId,
    status: "accepted",
    shiftStatus: "completed",
  }).select("_id workerId").populate("workerId", "workerPayoutDetails email firstName lastName");
  if (!application) throw new ApiError("Completed worker application not found", 404);

  const previous = findPayout(job, application._id);
  if (previous?.status === "success" || previous?.status === "pending") {
    throw new ApiError("This payout is already initiated", 400);
  }

  const amount = Number((job.pricePerHour.amount * job.dailyWorkHours).toFixed(2));
  const token = await paymobService.authenticatePayouts();
  const clientReferenceId = paymobService.generateClientReferenceId(workerId, jobId);
  const response = await paymobService.initiatePayout(
    buildPayoutData(application.workerId, amount, clientReferenceId),
    token
  );
  const result = resultFromResponse(workerId, amount, response);

  job.payment.payouts = job.payment.payouts || [];
  job.payment.payouts.push({
    applicationId: application._id,
    workerId,
    amount,
    clientReferenceId,
    transactionId: result.transactionId,
    status: result.disbursementStatus === "pending" ? "pending" : result.status,
    disbursementStatus: result.disbursementStatus,
    reason: result.reason,
    processedAt: new Date(),
  });
  await job.save();

  if (result.status === "failed") throw new ApiError(result.reason, 400);
  return {
    status: "success",
    transactionId: result.transactionId,
    amount,
    disbursementStatus: result.disbursementStatus,
  };
};

exports.getPayoutStatus = async (jobId, user) => {
  const job = await Job.findById(jobId).select(
    "title payment status confirmation requiredWorkers employerId"
  );
  if (!job) throw new ApiError("Job not found", 404);

  if (
    user &&
    user.role !== "admin" &&
    job.employerId.toString() !== user._id.toString()
  ) {
    const isWorker = await Application.exists({ jobId, workerId: user._id });
    if (!isWorker) throw new ApiError("Unauthorized to view this payout", 403);
  }

  return {
    jobId: job._id,
    title: job.title,
    jobStatus: job.status,
    paymentStatus: job.payment?.status,
    amount: job.payment?.totalAmount,
    isCompleted: job.confirmation?.employerConfirmed,
    requiredWorkers: job.requiredWorkers,
    payoutStatus: job.payment.payoutStatus,
  };
};

exports.handlePayoutWebhook = async (payload, callbackSecret) => {
  if (
    process.env.PAYMOB_PAYOUT_CALLBACK_SECRET &&
    callbackSecret !== process.env.PAYMOB_PAYOUT_CALLBACK_SECRET
  ) {
    throw new ApiError("Invalid payout callback secret", 401);
  }

  const transactionId = payload.transaction_id || payload.id;
  const status = String(
    payload.disbursement_status || payload.status || ""
  ).toLowerCase();

  if (!transactionId || !status) {
    throw new ApiError("Missing payout callback data", 400);
  }

  const job = await Job.findOne({ "payment.payouts.transactionId": transactionId });
  if (!job) throw new ApiError("Payout transaction not found", 404);

  const payout = job.payment.payouts.find(
    (item) => item.transactionId === transactionId
  );
  if (!payout) throw new ApiError("Payout transaction not found", 404);

  const isSuccess = SUCCESS_STATUSES.has(status);
  payout.status = isSuccess ? "success" : status === "pending" ? "pending" : "failed";
  payout.disbursementStatus = status;
  payout.reason = payload.status_description || payout.reason;
  payout.processedAt = new Date();

  const latestByApplication = new Map();
  for (const item of job.payment.payouts) {
    latestByApplication.set(item.applicationId.toString(), item);
  }
  const latestPayouts = [...latestByApplication.values()];
  const allSuccessful = latestPayouts.length > 0 &&
    latestPayouts.every((item) => item.status === "success");
  const hasPending = latestPayouts.some((item) => item.status === "pending");

  if (allSuccessful) {
    job.payment.status = "paid";
    job.payment.payoutStatus = "completed";
  } else if (hasPending) {
    job.payment.payoutStatus = "processing";
  } else {
    job.payment.payoutStatus = "partial";
  }

  await job.save();

  return {
    jobId: job._id,
    transactionId,
    status,
    paymentStatus: job.payment.status,
    payoutStatus: job.payment.payoutStatus,
  };
};
