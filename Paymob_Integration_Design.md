# Paymob Integration Design for Sheftaya

This document outlines the proposed payment and escrow flow for the Sheftaya project using Paymob. The goal is to ensure that employers pay for jobs after accepting workers, funds are held in escrow, and workers receive their payments only after job completion and verification.

## 1. Current Project Analysis

Based on the analysis of the `Sheftaya` project, the following key models and services are relevant:

*   **`jobModel.js`**: This model already includes a `payment` object with fields like `method`, `status` (`pending`, `held`, `paid`, `refunded`), `totalAmount`, `platformFee`, and `escrowId`. This structure is well-suited for implementing an escrow system.
*   **`applicationModel.js`**: Manages job applications and their statuses, including `accepted` status, which is a trigger for payment initiation.
*   **`userModel.js`**: Contains basic user information. It will need to be extended to store worker payout details (e.g., mobile wallet number, bank account details) and potentially an employer's preferred payment method.
*   **`workerProfileModel.js`**: Contains worker-specific details but currently lacks fields for payout information. This will need to be updated.
*   **`jobService.js`**: Contains logic for creating, updating, canceling, and confirming job completion. The `cancelJob` function already handles changing `payment.status` to `refunded` if funds are `held`. The `confirmCompletion` function updates `job.status` to `completed` and `payment.status` to `paid` when all conditions are met. These functions will be enhanced to integrate with Paymob APIs.
*   **`applicationService.js`**: Handles worker applications and acceptance. The `acceptWorker` function is a critical point where payment initiation should occur.

## 2. Paymob API Overview

Paymob provides two main sets of APIs relevant to this project:

*   **Accept Standard Redirect API**: Used for processing payments from employers. This involves authentication, order registration, payment key requests, and redirection to a hosted payment page.
*   **Payouts Portal API (Instant Cashin API)**: Used for disbursing funds to workers. This API supports transfers to mobile wallets and bank accounts.

### Paymob Credentials (from user)

The following environment variables are provided for Paymob integration:

*   `PAYMOB_API_KEY`
*   `PAYMOB_PUBLIC_KEY`
*   `PAYMOB_SECRET_KEY`
*   `PAYMOB_INTEGRATION_ID` (for card payments)
*   `PAYMOB_WALLET_INTEGRATION_ID` (for mobile wallet payments)
*   `PAYMOB_CARD_INTEGRATION_ID` (likely redundant with `PAYMOB_INTEGRATION_ID` but will keep for clarity)
*   `PAYMOB_IFRAME_ID`
*   `PAYMOB_HMAC_SECRET`
*   `PAYMOB_API_URL` (This will likely be `https://accept.paymob.com/api` for payments and `https://payouts.paymobsolutions.com/api` for payouts).

## 3. Proposed Payment and Escrow Flow

### 3.1. Employer Initiates Payment (Escrow Funding)

**Trigger**: An employer accepts enough workers for a job, and the `job.acceptedWorkersCount` reaches `job.requiredWorkers`.

**Flow**: 
1.  **Authentication**: The backend authenticates with Paymob using `PAYMOB_API_KEY` to obtain an authentication token.
2.  **Order Registration**: A new order is registered with Paymob, including the `job.totalAmount` and other relevant job details. The `job.payment.status` will be `pending` at this stage.
3.  **Payment Key Request**: A payment key is requested from Paymob, specifying the chosen integration ID (card or wallet) and the order ID.
4.  **Employer Redirection**: The employer is redirected to a Paymob hosted payment page (using the `PAYMOB_IFRAME_ID` or a direct redirect URL) to complete the payment.
5.  **Webhook Notification**: Upon successful payment, Paymob sends a webhook notification to a designated endpoint in our backend.
6.  **Webhook Verification**: Our backend verifies the HMAC signature of the webhook using `PAYMOB_HMAC_SECRET` to ensure its authenticity.
7.  **Update Job Status**: If the payment is successful and verified, the `job.payment.status` is updated to `held`, and the Paymob transaction ID is stored in `job.payment.escrowId`.

### 3.2. Worker Payout (Escrow Disbursement)

**Trigger**: The job status becomes `completed` (i.e., `job.confirmation.employerConfirmed` is true and `job.confirmation.workersConfirmedCount` equals `job.requiredWorkers`).

**Flow**: 
1.  **Retrieve Worker Payout Details**: For each worker associated with the completed job, retrieve their registered payout information (e.g., mobile wallet number, bank account details) from their `userModel` or `workerProfileModel`.
2.  **Calculate Worker Share**: Calculate each worker's share of the `job.totalAmount` based on `pricePerHour` and `dailyWorkHours`.
3.  **Paymob Payout Request**: For each worker, initiate a payout request to Paymob's Instant Cashin API. This request will include the worker's payout details, the amount, and the appropriate issuer (e.g., `vodafone`, `etisalat`, `bank_card`).
4.  **Payout Status Tracking**: Monitor the status of each payout. Paymob's Instant Cashin API provides a `disbursement_status` in its response. For bank transfers, this might take up to 2 working days to finalize.
5.  **Update Worker Balance/Transaction History**: Update the worker's balance or transaction history in our system to reflect the payout.
6.  **Update Job Payment Status**: Once all payouts are successfully initiated/completed, the `job.payment.status` can be updated to `paid`.

### 3.3. Refunds (Escrow Release)

**Trigger**: A job is cancelled under conditions that warrant a refund to the employer (e.g., `job.status` changes to `cancelled` and `job.payment.status` is `held`).

**Flow**: 
1.  **Paymob Refund Request**: Initiate a refund request to Paymob using the `escrowId` (original transaction ID) and the `totalAmount`.
2.  **Refund Status Tracking**: Monitor the refund status from Paymob.
3.  **Update Job Status**: Upon successful refund, update `job.payment.status` to `refunded`.

## 4. Required Model Changes

### `userModel.js`

Add fields to store worker payout information and employer payment preferences:

```javascript
// ... existing schema fields

    paymentPreferences: {
      method: {
        type: String,
        enum: ["card", "wallet"], // Employer's preferred payment method
      },
      // Potentially store tokenized card info or wallet details if needed for recurring payments (advanced)
    },
    
    workerPayoutDetails: {
      mobileWalletNumber: String, // For mobile wallet payouts
      bankAccountNumber: String, // For bank card/account payouts
      bankName: String,
      bankCode: String,
      fullName: String, // Name of the account holder
      // ... other necessary bank details
    },

// ... rest of the schema
```

### `jobModel.js`

The existing `payment` object is largely sufficient, but we might want to store more details about the Paymob transaction for auditing and refund purposes.

```javascript
// ... existing payment object

    payment: {
      method: {
        type: String,
        enum: ["card", "wallet"],
        required: true,
      },

      status: {
        type: String,
        enum: ["pending", "held", "paid", "refunded"],
        default: "pending",
        index: true,
      },

      totalAmount: {
        type: Number,
        min: 0,
        required: true,
      },

      platformFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      escrowId: String, // Paymob Order ID or Transaction ID for the held funds
      paymobTransactionId: String, // The actual transaction ID from Paymob after successful payment
      paymobOrderId: String, // The order ID generated by Paymob
      paymentLink: String, // The URL for the hosted payment page
    },

// ... rest of the schema
```

## 5. Backend Implementation Steps

1.  **Paymob API Wrapper**: Create a service (e.g., `paymobService.js`) to encapsulate all interactions with the Paymob APIs (authentication, order registration, payment key, refunds, payouts).
2.  **Environment Variables**: Ensure all Paymob secrets are correctly loaded from `.env`.
3.  **Employer Payment Endpoint**: Create a new endpoint (e.g., `/jobs/:jobId/pay`) that an employer can call after accepting workers. This endpoint will:
    *   Call `paymobService.authenticate()`.
    *   Call `paymobService.registerOrder()`.
    *   Call `paymobService.requestPaymentKey()`.
    *   Return the Paymob payment URL to the frontend for redirection.
4.  **Webhook Handler**: Create a webhook endpoint (e.g., `/paymob/webhook`) to receive notifications from Paymob. This handler will:
    *   Verify the HMAC signature.
    *   Parse the transaction status.
    *   Update the `job.payment.status` and `job.payment.paymobTransactionId` based on the webhook data.
5.  **Worker Payout Logic**: Enhance the `jobService.confirmCompletion` function to:
    *   Iterate through accepted workers.
    *   Retrieve worker payout details.
    *   Call `paymobService.initiatePayout()` for each worker.
    *   Handle potential errors during payouts (e.g., insufficient funds, invalid worker details).
6.  **Refund Logic**: Enhance the `jobService.cancelJob` function to:
    *   Check if `job.payment.status` is `held`.
    *   Call `paymobService.initiateRefund()`.
    *   Update `job.payment.status` to `refunded`.

## 6. Frontend Considerations

1.  **Payment Initiation**: After an employer accepts workers, the frontend will call the new `/jobs/:jobId/pay` endpoint. It will then redirect the user to the Paymob payment URL received in the response.
2.  **Payment Confirmation**: After the employer completes the payment on Paymob's page, they will be redirected back to our application (success/failure URL). The frontend should display an appropriate message.
3.  **Worker Payout Details**: The worker profile page will need UI elements for workers to input and update their mobile wallet numbers or bank account details.
4.  **Employer Payment Method Selection**: The job creation or payment initiation flow will need UI for the employer to select their preferred payment method (card or wallet).

## 7. Security Considerations

*   **Webhook Security**: Always verify Paymob webhook signatures to prevent spoofing.
*   **API Key Management**: Store API keys securely in environment variables and never expose them in client-side code.
*   **Sensitive Data**: Avoid storing sensitive payment information directly in our database. Rely on Paymob for handling card data. Only store necessary references (e.g., `escrowId`, `paymobTransactionId`).
*   **Transaction Idempotency**: Implement idempotency for payment and payout requests to handle duplicate requests gracefully.

## 8. Next Steps

1.  Implement the `paymobService.js` wrapper for Paymob APIs.
2.  Modify `userModel.js` and `workerProfileModel.js` to include payout details.
3.  Create the employer payment initiation endpoint.
4.  Implement the Paymob webhook handler.
5.  Integrate payout logic into `jobService.confirmCompletion`.
6.  Integrate refund logic into `jobService.cancelJob`.
7.  Develop frontend components for payment initiation and worker payout details.
