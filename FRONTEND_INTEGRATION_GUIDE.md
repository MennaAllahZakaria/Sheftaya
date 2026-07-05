# Frontend Integration Guide - Paymob Payment System

This document provides all the necessary information for the Frontend team to integrate with the Paymob payment system implemented in the Backend.

## Architecture Overview

The Backend follows a clean architecture pattern:
- **Routes** (`/routes`) - Handle HTTP requests and call service functions
- **Services** (`/services`) - Contain all business logic
- **Models** (`/models`) - Define data schemas

### Payment Services

1. **`paymentService.js`** - Handles employer payment initiation, webhook processing, and refunds
2. **`workerPayoutService.js`** - Handles worker payout details and payout processing
3. **`paymobService.js`** - Wrapper for Paymob API interactions
4. **`payoutService.js`** - Legacy payout service (being replaced by workerPayoutService)

## API Endpoints

### 1. Initiate Payment (Employer)

**Endpoint**: `POST /api/payments/jobs/:jobId/initiate`

**Authentication**: Required (Bearer Token)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Parameters**:
- `jobId` (URL parameter): The ID of the job for which payment is being initiated

**Request Body**: Empty (no body needed)

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Payment initiated successfully",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "paymentLink": "https://accept.paymob.com/api/acceptance/iframes/{IFRAME_ID}?payment_token={TOKEN}",
    "amount": 5000,
    "orderId": 123456,
    "paymentToken": "ZXhhbXBsZV90b2tlbg=="
  }
}
```

**Response** (Error - 400/403/404/500):
```json
{
  "status": "fail",
  "message": "Error description"
}
```

**Frontend Implementation**:
1. Call this endpoint when the employer clicks "Proceed to Payment" button
2. Receive the `paymentLink` from the response
3. Redirect the user to the `paymentLink` (Paymob hosted payment page)
4. After payment completion, Paymob will redirect back to your success/failure page

**Example JavaScript**:
```javascript
const initiatePayment = async (jobId) => {
  try {
    const response = await fetch(`/api/payments/jobs/${jobId}/initiate`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      // Redirect to payment page
      window.location.href = data.data.paymentLink;
    } else {
      console.error('Payment initiation failed:', data.message);
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 2. Get Payment Status

**Endpoint**: `GET /api/payments/jobs/:jobId/status`

**Authentication**: Required (Bearer Token)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Parameters**:
- `jobId` (URL parameter): The ID of the job

**Request Body**: None

**Response** (Success - 200):
```json
{
  "status": "success",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "title": "House Renovation",
    "paymentStatus": "held",
    "amount": 5000,
    "escrowId": "123456"
  }
}
```

**Payment Status Values**:
- `pending` - Payment not yet initiated
- `held` - Payment received and held in escrow
- `paid` - Payment distributed to workers
- `refunded` - Payment refunded to employer

**Frontend Implementation**:
```javascript
const checkPaymentStatus = async (jobId) => {
  try {
    const response = await fetch(`/api/payments/jobs/${jobId}/status`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });

    const data = await response.json();
    
    if (data.status === 'success') {
      console.log('Payment Status:', data.data.paymentStatus);
      // Update UI based on payment status
    }
  } catch (error) {
    console.error('Error:', error);
  }
};
```

---

### 3. Refund Payment

**Endpoint**: `POST /api/payments/jobs/:jobId/refund`

**Authentication**: Required (Bearer Token - Employer or Admin)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Parameters**:
- `jobId` (URL parameter): The ID of the job

**Request Body**: Empty

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Refund initiated successfully",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "status": "refunded",
    "amount": 5000,
    "transactionId": "abc123"
  }
}
```

---

### 4. Register Worker Payout Details

**Endpoint**: `POST /api/payouts/workers/details`

**Authentication**: Required (Bearer Token - Worker)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Request Body** (Mobile Wallet):
```json
{
  "method": "mobile_wallet",
  "mobileWalletNumber": "01020304050",
  "walletIssuer": "vodafone"
}
```

**Request Body** (Bank Card):
```json
{
  "method": "bank_card",
  "bankCardNumber": "1111-2222-3333-4444",
  "bankCode": "CIB",
  "bankName": "Commercial International Bank",
  "bankTransactionType": "salary",
  "fullName": "Ahmed Hassan"
}
```

**Request Body** (Aman):
```json
{
  "method": "aman",
  "mobileWalletNumber": "01020304050",
  "firstName": "Ahmed",
  "lastName": "Hassan"
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Payout details updated successfully",
  "data": {
    "workerId": "507f1f77bcf86cd799439011",
    "payoutDetails": {
      "method": "mobile_wallet",
      "mobileWalletNumber": "01020304050",
      "walletIssuer": "vodafone"
    }
  }
}
```

---

### 5. Get Worker Payout Details

**Endpoint**: `GET /api/payouts/workers/details`

**Authentication**: Required (Bearer Token - Worker)

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "data": {
    "workerId": "507f1f77bcf86cd799439011",
    "payoutDetails": {
      "method": "mobile_wallet",
      "mobileWalletNumber": "01020304050",
      "walletIssuer": "vodafone"
    }
  }
}
```

---

### 6. Process Job Payouts

**Endpoint**: `POST /api/payouts/jobs/:jobId/process`

**Authentication**: Required (Bearer Token - Employer or Admin)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Parameters**:
- `jobId` (URL parameter): The ID of the job

**Request Body**: Empty

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Payouts processed successfully",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "totalWorkers": 3,
    "successful": 3,
    "failed": 0,
    "results": [
      {
        "workerId": "507f1f77bcf86cd799439012",
        "status": "success",
        "transactionId": "txn123",
        "amount": 1000,
        "disbursementStatus": "success"
      }
    ]
  }
}
```

---

### 7. Get Payout Status

**Endpoint**: `GET /api/payouts/jobs/:jobId/status`

**Authentication**: Required (Bearer Token)

**Headers**:
```
Authorization: Bearer {token}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "data": {
    "jobId": "507f1f77bcf86cd799439011",
    "title": "House Renovation",
    "jobStatus": "completed",
    "paymentStatus": "paid",
    "amount": 5000,
    "isCompleted": true,
    "requiredWorkers": 3
  }
}
```

---

### 8. Retry Worker Payout (Admin Only)

**Endpoint**: `POST /api/payouts/workers/:workerId/retry`

**Authentication**: Required (Bearer Token - Admin)

**Headers**:
```
Authorization: Bearer {token}
Content-Type: application/json
```

**Parameters**:
- `workerId` (URL parameter): The ID of the worker

**Request Body**:
```json
{
  "jobId": "507f1f77bcf86cd799439011",
  "amount": 1000
}
```

**Response** (Success - 200):
```json
{
  "status": "success",
  "message": "Payout retry initiated successfully",
  "data": {
    "status": "success",
    "transactionId": "txn123",
    "amount": 1000,
    "disbursementStatus": "success"
  }
}
```

---

## Webhook Handling (Backend will handle)

The Backend automatically handles Paymob webhooks at: `POST /api/payments/webhook`

**What happens**:
1. Paymob sends a webhook notification when payment is completed
2. Backend verifies the HMAC signature
3. Backend updates the job payment status to `held` if successful
4. Backend sends a notification to the employer

**Frontend doesn't need to do anything** - the webhook is handled server-side.

---

## User Model Updates (Payout Details)

Workers need to register their payout details before they can receive payments. These should be stored in the `workerPayoutDetails` field of the User model.

### Worker Payout Details Structure

```javascript
workerPayoutDetails: {
  method: "mobile_wallet" | "bank_card" | "aman",
  
  // For mobile wallets
  mobileWalletNumber: "01020304050",
  walletIssuer: "vodafone" | "etisalat" | "orange" | "bank_wallet",
  
  // For bank accounts
  bankCardNumber: "1111-2222-3333-4444",
  bankCode: "CIB",
  bankName: "Commercial International Bank",
  bankTransactionType: "salary",
  fullName: "Ahmed Hassan",
  
  // For Aman
  firstName: "Ahmed",
  lastName: "Hassan"
}
```

**Frontend should provide a form for workers to input**:
1. Payout method (dropdown: Mobile Wallet, Bank Card, Aman)
2. Based on selected method:
   - **Mobile Wallet**: Phone number + Issuer (Vodafone, Etisalat, Orange)
   - **Bank Card**: Card/IBAN number, Bank code, Full name
   - **Aman**: Phone number, First name, Last name

---

## Payment Flow Diagram

```
1. Employer accepts workers for a job
   ↓
2. Employer clicks "Proceed to Payment"
   ↓
3. Frontend calls POST /api/payments/jobs/:jobId/initiate
   ↓
4. Backend returns paymentLink
   ↓
5. Frontend redirects to Paymob payment page
   ↓
6. Employer completes payment on Paymob
   ↓
7. Paymob sends webhook to Backend
   ↓
8. Backend updates job.payment.status to "held"
   ↓
9. Backend sends notification to employer
   ↓
10. Job proceeds with workers
    ↓
11. When job is completed:
    - Frontend calls POST /api/payouts/jobs/:jobId/process
    - Backend initiates payouts to all workers
    - Backend updates job.payment.status to "paid"
    ↓
12. Workers receive their payments
```

---

## Error Handling

### Common Error Scenarios

**1. Payment Initiation Fails**
- Status: 400
- Possible reasons:
  - Not all workers have been accepted yet
  - Payment already initiated
  - Job not found

**2. Unauthorized Access**
- Status: 403
- Reason: Only employers can initiate payments

**3. Job Not Found**
- Status: 404
- Reason: Invalid job ID

**4. Server Error**
- Status: 500
- Reason: Payment provider authentication failed

**Frontend should**:
- Display user-friendly error messages
- Log errors for debugging
- Provide retry options

---

## Testing

### Test Credentials

Use these test numbers on Paymob's staging environment:

- **Vodafone**: `01023456789`
- **Etisalat**: `01123456789`
- **Orange**: `01223456789`
- **Bank Wallet**: `01123416789`
- **Bank Card**: `1111222233334444`
- **Bank IBAN**: `EG829299835722904511873050307`

### Test Payment Flow

1. Create a job and accept workers
2. Call `/api/payments/jobs/:jobId/initiate`
3. Use test card/wallet number on Paymob page
4. Verify payment status changes to `held`
5. Register worker payout details
6. Call `/api/payouts/jobs/:jobId/process`
7. Verify payouts are initiated

---

## Security Considerations

1. **Always use HTTPS** in production
2. **Never expose API keys** in frontend code
3. **Validate all user inputs** before sending to backend
4. **Store tokens securely** (HttpOnly cookies recommended)
5. **Implement CSRF protection** for state-changing operations
6. **Log all payment-related activities** for auditing

---

## Support & Documentation

- Paymob Developer Portal: https://developers.paymob.com/
- Paymob Payouts API: https://payouts.paymobsolutions.com/docs/
- Backend Integration Design: See `Paymob_Integration_Design.md`
- Paymob API Reference: See `PAYMOB_API_REFERENCE.md`
- Implementation Summary: See `IMPLEMENTATION_SUMMARY.md`

---

## Notes for Frontend Team

1. **Payment Initiation**: Only available after all required workers are accepted
2. **Worker Payout Details**: Must be completed before job completion
3. **Webhook Notifications**: Backend handles all webhook logic
4. **Status Polling**: Frontend can poll `/api/payments/jobs/:jobId/status` to check payment status
5. **Error Recovery**: Implement proper error handling and user feedback
6. **Accessibility**: Ensure payment forms are accessible to all users
7. **Mobile Optimization**: Payment page should work well on mobile devices
8. **Service Architecture**: All business logic is in services, routes only handle HTTP requests

---

Last Updated: 2024
Backend Integration Version: 2.0
Architecture: Service-based (Clean Architecture)
