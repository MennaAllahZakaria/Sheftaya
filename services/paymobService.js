const axios = require("axios");
const crypto = require("crypto");
const asyncHandler = require("express-async-handler");
const ApiError = require("../utils/apiError");

// ==================== CONFIGURATION ====================

const PAYMOB_API_URL = process.env.PAYMOB_API_URL || "https://accept.paymob.com/api";
const PAYMOB_PAYOUTS_URL = "https://payouts.paymobsolutions.com/api";

const PAYMOB_API_KEY = process.env.PAYMOB_API_KEY;
const PAYMOB_SECRET_KEY = process.env.PAYMOB_SECRET_KEY;
const PAYMOB_HMAC_SECRET = process.env.PAYMOB_HMAC_SECRET;
const PAYMOB_INTEGRATION_ID = process.env.PAYMOB_INTEGRATION_ID;
const PAYMOB_WALLET_INTEGRATION_ID = process.env.PAYMOB_WALLET_INTEGRATION_ID;
const PAYMOB_CARD_INTEGRATION_ID = process.env.PAYMOB_CARD_INTEGRATION_ID;

// ==================== AUTHENTICATION ====================

/**
 * Authenticate with Paymob to get an auth token
 * @returns {Promise<string>} Auth token
 */
exports.authenticate = asyncHandler(async () => {
  try {
    const response = await axios.post(
      `${PAYMOB_API_URL}/auth/tokens`,
      {
        api_key: PAYMOB_API_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!response.data.token) {
      throw new ApiError("Failed to authenticate with Paymob", 500);
    }

    return response.data.token;
  } catch (error) {
    console.error("Paymob authentication error:", error.response?.data || error.message);
    throw new ApiError("Paymob authentication failed", 500);
  }
});

// ==================== ORDER MANAGEMENT ====================

/**
 * Register an order with Paymob
 * @param {Object} orderData - Order details
 * @param {string} authToken - Paymob auth token
 * @returns {Promise<Object>} Order details from Paymob
 */
exports.registerOrder = asyncHandler(async (orderData, authToken) => {
  try {
    const response = await axios.post(
      `${PAYMOB_API_URL}/ecommerce/orders`,
      {
        auth_token: authToken,
        delivery_needed: false,
        amount_cents: Math.round(orderData.amount * 100), // Convert to cents
        currency: orderData.currency || "EGP",
        items: orderData.items || [],
        merchant_order_id: orderData.merchantOrderId,
        customer: {
          first_name: orderData.customerFirstName,
          last_name: orderData.customerLastName,
          email: orderData.customerEmail,
          phone_number: orderData.customerPhone,
        },
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!response.data.id) {
      throw new ApiError("Failed to register order with Paymob", 500);
    }

    return response.data;
  } catch (error) {
    console.error("Paymob order registration error:", error.response?.data || error.message);
    throw new ApiError("Failed to register order with Paymob", 500);
  }
});

// ==================== PAYMENT KEY ====================

/**
 * Request a payment key from Paymob
 * @param {Object} paymentData - Payment details
 * @param {string} authToken - Paymob auth token
 * @returns {Promise<Object>} Payment key response from Paymob
 */
exports.requestPaymentKey = asyncHandler(async (paymentData, authToken) => {
  try {
    const integrationId =
      paymentData.method === "wallet"
        ? PAYMOB_WALLET_INTEGRATION_ID
        : PAYMOB_CARD_INTEGRATION_ID || PAYMOB_INTEGRATION_ID;

    const response = await axios.post(
      `${PAYMOB_API_URL}/acceptance/payment_keys`,
      {
        auth_token: authToken,
        amount_cents: Math.round(paymentData.amount * 100),
        expiration: 3600, // 1 hour
        order_id: paymentData.orderId,
        billing_data: {
          apartment: "NA",
          email: paymentData.customerEmail,
          floor: "NA",
          first_name: paymentData.customerFirstName,
          street: "NA",
          postal_code: "NA",
          city: "NA",
          country: "EG",
          last_name: paymentData.customerLastName,
          phone_number: paymentData.customerPhone,
          state: "NA",
        },
        currency: paymentData.currency || "EGP",
        integration_id: integrationId,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!response.data.token) {
      throw new ApiError("Failed to request payment key from Paymob", 500);
    }

    return response.data;
  } catch (error) {
    console.error("Paymob payment key error:", error.response?.data || error.message);
    throw new ApiError("Failed to request payment key from Paymob", 500);
  }
});

// ==================== WEBHOOK VERIFICATION ====================

/**
 * Verify Paymob webhook signature
 * @param {Object} webhookData - Webhook payload
 * @param {string} signature - HMAC signature from Paymob
 * @returns {boolean} True if signature is valid
 */
exports.verifyWebhookSignature = (webhookData, signature) => {
  try {
    // Construct the message to be verified
    // Paymob uses: order_id + transaction_id + success + amount_cents + secret_key
    const message = `${webhookData.order.id}${webhookData.transaction.id}${webhookData.success}${webhookData.order.amount_cents}${PAYMOB_HMAC_SECRET}`;

    // Generate HMAC SHA256 signature
    const expectedSignature = crypto
      .createHmac("sha256", PAYMOB_HMAC_SECRET)
      .update(message)
      .digest("hex");

    return expectedSignature === signature;
  } catch (error) {
    console.error("Webhook signature verification error:", error.message);
    return false;
  }
};

// ==================== REFUNDS ====================

/**
 * Initiate a refund for a transaction
 * @param {Object} refundData - Refund details
 * @param {string} authToken - Paymob auth token
 * @returns {Promise<Object>} Refund response from Paymob
 */
exports.initiateRefund = asyncHandler(async (refundData, authToken) => {
  try {
    const response = await axios.post(
      `${PAYMOB_API_URL}/acceptance/void_transactions/${refundData.transactionId}`,
      {
        auth_token: authToken,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Paymob refund error:", error.response?.data || error.message);
    throw new ApiError("Failed to initiate refund with Paymob", 500);
  }
});

// ==================== PAYOUTS ====================

/**
 * Authenticate with Paymob Payouts API
 * @returns {Promise<string>} Payouts API access token
 */
exports.authenticatePayouts = asyncHandler(async () => {
  try {
    const response = await axios.post(
      `${PAYMOB_PAYOUTS_URL}/generate_and_refresh_token/`,
      {
        api_key: PAYMOB_API_KEY,
      },
      {
        headers: {
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    if (!response.data.access_token) {
      throw new ApiError("Failed to authenticate with Paymob Payouts API", 500);
    }

    return response.data.access_token;
  } catch (error) {
    console.error("Paymob Payouts authentication error:", error.response?.data || error.message);
    throw new ApiError("Failed to authenticate with Paymob Payouts API", 500);
  }
});

/**
 * Initiate a payout to a worker
 * @param {Object} payoutData - Payout details
 * @param {string} accessToken - Payouts API access token
 * @returns {Promise<Object>} Payout response from Paymob
 */
exports.initiatePayout = asyncHandler(async (payoutData, accessToken) => {
  try {
    // Determine issuer based on payout method
    let issuer = "vodafone"; // Default
    let requestBody = {
      amount: payoutData.amount,
      issuer: issuer,
      client_reference_id: payoutData.clientReferenceId,
    };

    if (payoutData.method === "mobile_wallet") {
      issuer = payoutData.issuer || "vodafone"; // vodafone, etisalat, orange, etc.
      requestBody.issuer = issuer;
      requestBody.msisdn = payoutData.msisdn; // Mobile number without +2
    } else if (payoutData.method === "bank_card") {
      requestBody.issuer = "bank_card";
      requestBody.bank_card_number = payoutData.bankCardNumber;
      requestBody.bank_code = payoutData.bankCode;
      requestBody.bank_transaction_type = payoutData.bankTransactionType || "salary";
      requestBody.full_name = payoutData.fullName;
    } else if (payoutData.method === "aman") {
      requestBody.issuer = "aman";
      requestBody.msisdn = payoutData.msisdn;
      requestBody.first_name = payoutData.firstName;
      requestBody.last_name = payoutData.lastName;
      requestBody.email = payoutData.email;
    }

    const response = await axios.post(
      `${PAYMOB_PAYOUTS_URL}/disburse/`,
      requestBody,
      {
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Paymob payout error:", error.response?.data || error.message);
    throw new ApiError("Failed to initiate payout with Paymob", 500);
  }
});

// ==================== TRANSACTION INQUIRY ====================

/**
 * Get transaction details from Paymob
 * @param {string} transactionId - Paymob transaction ID
 * @param {string} authToken - Paymob auth token
 * @returns {Promise<Object>} Transaction details
 */
exports.getTransactionDetails = asyncHandler(async (transactionId, authToken) => {
  try {
    const response = await axios.get(
      `${PAYMOB_API_URL}/acceptance/transactions/${transactionId}`,
      {
        params: {
          auth_token: authToken,
        },
        timeout: 10000,
      }
    );

    return response.data;
  } catch (error) {
    console.error("Paymob transaction inquiry error:", error.response?.data || error.message);
    throw new ApiError("Failed to retrieve transaction details from Paymob", 500);
  }
});

// ==================== HELPER FUNCTIONS ====================

/**
 * Generate a unique merchant order ID
 * @param {string} jobId - Job ID
 * @returns {string} Merchant order ID
 */
exports.generateMerchantOrderId = (jobId) => {
  return `JOB_${jobId}_${Date.now()}`;
};

/**
 * Generate a unique client reference ID for payouts
 * @param {string} workerId - Worker ID
 * @param {string} jobId - Job ID
 * @returns {string} Client reference ID
 */
exports.generateClientReferenceId = (workerId, jobId) => {
  return `PAYOUT_${workerId}_${jobId}_${Date.now()}`;
};
