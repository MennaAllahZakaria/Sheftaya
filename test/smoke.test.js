const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");
const { test } = require("node:test");

// Firebase is an external runtime dependency. Stub it for offline module/smoke tests.
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request.endsWith("fireBase/admin") || request.endsWith("fireBase/admin.js")) {
    return { messaging: () => ({ send: async () => "test-message-id" }) };
  }
  return originalLoad.call(this, request, parent, isMain);
};

process.env.PAYMOB_HMAC_SECRET = "smoke-test-secret";

const paymobService = require("../services/paymobService");
const paymentService = require("../services/paymentService");
const workerPayoutService = require("../services/workerPayoutService");
const sendEmail = require("../utils/sendEmail");
const Notification = require("../models/notificationModel");
const Job = require("../models/jobModel");
const paymentRoute = require("../routes/paymentRoute");
const payoutRoute = require("../routes/payoutRoute");
const express = require("express");
const mountRoutes = require("../routes/index");

const transaction = {
  amount_cents: 100,
  created_at: "2020-03-25T18:39:44.719228",
  currency: "EGP",
  error_occured: false,
  has_parent_transaction: false,
  id: 2556706,
  integration_id: 6741,
  is_3d_secure: true,
  is_auth: false,
  is_capture: false,
  is_refunded: false,
  is_standalone_payment: true,
  is_voided: false,
  order: { id: 4778239 },
  owner: 4705,
  pending: false,
  source_data: { pan: "2346", sub_type: "MasterCard", type: "card" },
  success: true,
};

const transactionHmac = () => {
  const fields = [
    transaction.amount_cents,
    transaction.created_at,
    transaction.currency,
    transaction.error_occured,
    transaction.has_parent_transaction,
    transaction.id,
    transaction.integration_id,
    transaction.is_3d_secure,
    transaction.is_auth,
    transaction.is_capture,
    transaction.is_refunded,
    transaction.is_standalone_payment,
    transaction.is_voided,
    transaction.order.id,
    transaction.owner,
    transaction.pending,
    transaction.source_data.pan,
    transaction.source_data.sub_type,
    transaction.source_data.type,
    transaction.success,
  ];

  return crypto
    .createHmac("sha512", process.env.PAYMOB_HMAC_SECRET)
    .update(fields.map(String).join(""))
    .digest("hex");
};

test("Paymob HMAC accepts an authentic transaction and rejects a tampered one", () => {
  const signature = transactionHmac();
  assert.equal(paymobService.verifyWebhookSignature({ obj: transaction }, signature), true);
  const tampered = signature.slice(0, -1) + (signature.endsWith("0") ? "1" : "0");
  assert.equal(paymobService.verifyWebhookSignature({ obj: transaction }, tampered), false);
});

test("payment and payout routes load successfully", () => {
  assert.equal(typeof paymentRoute, "function");
  assert.equal(typeof payoutRoute, "function");
});

test("all application routes mount successfully", () => {
  const app = express();
  mountRoutes(app);
  const stack = app._router?.stack || app.router?.stack || [];
  assert.ok(stack.length > 0);
});

test("payment schema contains the escrow and payout states used by services", () => {
  assert.deepEqual(Job.schema.path("payment.status").enumValues, [
    "pending",
    "held",
    "paid",
    "refunded",
  ]);
  assert.deepEqual(Job.schema.path("payment.payoutStatus").enumValues, [
    "not_started",
    "processing",
    "partial",
    "completed",
  ]);
});

test("all notification types used by payment and job flows are valid", () => {
  const allowed = Notification.schema.path("type").enumValues;
  for (const type of [
    "new_application",
    "job_rejected",
    "worker_withdrew",
    "no_show_recorded",
    "job_cancelled",
    "payment_success",
    "payout_initiated",
    "refund_processed",
  ]) {
    assert.equal(allowed.includes(type), true, `${type} is missing from notification enum`);
  }
});

test("payment webhook rejects invalid signatures before database access", async () => {
  await assert.rejects(
    paymentService.handlePaymentWebhook({ obj: transaction }, "invalid"),
    (error) => error.statusCode === 401
  );
});

test("payment initiation rejects non-employers before database access", async () => {
  await assert.rejects(
    paymentService.initiateJobPayment("507f1f77bcf86cd799439011", { role: "worker" }),
    (error) => error.statusCode === 403
  );
});

test("payout details reject unsupported methods before database access", async () => {
  await assert.rejects(
    workerPayoutService.registerPayoutDetails("507f1f77bcf86cd799439011", { method: "crypto" }),
    (error) => error.statusCode === 400
  );
});

test("payout webhook rejects incomplete payload before database access", async () => {
  await assert.rejects(
    workerPayoutService.handlePayoutWebhook({}, undefined),
    (error) => error.statusCode === 400
  );
});

test("email utility fails safely when Brevo is not configured", async () => {
  const previousKey = process.env.BREVO_API_KEY;
  delete process.env.BREVO_API_KEY;

  await assert.rejects(
    sendEmail({ Email: "test@example.com", subject: "Test", message: "Test" }),
    (error) =>
      error.statusCode === 503 &&
      error.message === "Email service is not configured" &&
      !error.response
  );

  if (previousKey) process.env.BREVO_API_KEY = previousKey;
});
