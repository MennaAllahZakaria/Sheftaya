# Paymob API Reference

## Payouts Portal API - Instant Cashin Endpoint

**Base URL**: `https://payouts.paymobsolutions.com/api`

### Authentication

**Endpoint**: `POST /generate_and_refresh_token/`

**Request**:
```json
{
  "api_key": "YOUR_API_KEY"
}
```

**Response**:
```json
{
  "access_token": "YOUR_ACCESS_TOKEN"
}
```

### Instant Cashin (Disbursement)

**Endpoint**: `POST /disburse/`

**Headers**:
```
Content-Type: application/json
Authorization: Bearer {ACCESS_TOKEN}
```

**Request Parameters**:

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| issuer | String | Yes | vodafone, etisalat, orange, aman, bank_wallet, bank_card |
| amount | Float | Yes | Amount to disburse (up to 2 decimal points) |
| msisdn | String | Conditional | Mobile number (11 digits, no +2 prefix) for wallet/aman |
| bank_card_number | String | Conditional | Bank account, IBAN, or card number for bank transfers |
| bank_code | String | Conditional | Bank code (case-sensitive) for bank transfers |
| bank_transaction_type | String | Conditional | salary, credit_card, prepaid_card, cash_transfer |
| full_name | String | Conditional | Account holder name for bank transfers |
| first_name | String | Conditional | First name for Aman |
| last_name | String | Conditional | Last name for Aman |
| email | String | Conditional | Email for Aman |
| client_reference_id | String | Optional | UUID for tracking |

**Response**:
```json
{
  "transaction_id": "92134d2b-d1a5-4dde-859c-a1175e94582c",
  "issuer": "vodafone",
  "amount": "90.56",
  "disbursement_status": "success",
  "status_code": "200",
  "status_description": "تم إيداع 90.56 جنيه إلى رقم 01010101010 بنجاح",
  "created_at": "2020-10-12 06:54:31.849561",
  "updated_at": "2020-10-12 06:54:33.146926"
}
```

**Disbursement Status Values**:
- `success` / `successful` - Transaction successful
- `failed` - Transaction failed
- `pending` - Transaction pending (for bank transfers)

**Processing Times**:
- Mobile wallets: Instant
- Bank transfers: Up to 2 working days

### Test Numbers (Staging Only)

- Vodafone: `01023456789`
- Etisalat: `01123456789`
- Orange: `01223456789`
- Bank Wallet: `01123416789`
- Bank Card: `1111222233334444`
- Bank IBAN: `EG829299835722904511873050307`

## Paymob Accept API

**Base URL**: `https://accept.paymob.com/api`

### Authentication

**Endpoint**: `POST /auth/tokens`

**Request**:
```json
{
  "api_key": "YOUR_API_KEY"
}
```

**Response**:
```json
{
  "token": "YOUR_AUTH_TOKEN"
}
```

### Order Registration

**Endpoint**: `POST /ecommerce/orders`

**Request**:
```json
{
  "auth_token": "YOUR_AUTH_TOKEN",
  "delivery_needed": false,
  "amount_cents": 9000,
  "currency": "EGP",
  "merchant_order_id": "JOB_123_1234567890",
  "customer": {
    "first_name": "Ahmed",
    "last_name": "Hassan",
    "email": "ahmed@example.com",
    "phone_number": "01012345678"
  }
}
```

### Payment Key Request

**Endpoint**: `POST /acceptance/payment_keys`

**Request**:
```json
{
  "auth_token": "YOUR_AUTH_TOKEN",
  "amount_cents": 9000,
  "expiration": 3600,
  "order_id": 123456,
  "billing_data": {
    "apartment": "NA",
    "email": "ahmed@example.com",
    "floor": "NA",
    "first_name": "Ahmed",
    "street": "NA",
    "postal_code": "NA",
    "city": "Cairo",
    "country": "EG",
    "last_name": "Hassan",
    "phone_number": "01012345678",
    "state": "NA"
  },
  "currency": "EGP",
  "integration_id": 123456
}
```

**Response**:
```json
{
  "token": "YOUR_PAYMENT_TOKEN"
}
```

### Payment URL

**Format**: `https://accept.paymob.com/api/acceptance/iframes/{IFRAME_ID}?payment_token={PAYMENT_TOKEN}`

## Webhook Signature Verification

**HMAC Signature Construction**:
```
message = order_id + transaction_id + success + amount_cents + HMAC_SECRET
signature = HMAC-SHA256(message, HMAC_SECRET)
```

**Webhook Headers**:
- `hmac-signature`: The HMAC signature to verify

## Bank Codes (Case-Sensitive)

| Bank Name | Code |
|-----------|------|
| Ahli United Bank | AUB |
| Banque Du Caire | BDC |
| HSBC Bank Egypt S.A.E | HSBC |
| Credit Agricole Egypt S.A.E | CAE |
| Egyptian Gulf Bank | EGB |
| The United Bank | UB |
| Qatar National Bank Alahli | QNB |
| Arab Bank PLC | ARAB |
| Commercial International Bank - Egypt S.A.E | CIB |
| Banque Misr | MISR |
| National Bank of Egypt | NBE |
| Al Baraka Bank Egypt B.S.C. | ABRK |
| (and many more...) | |

## Environment Variables Required

```
PAYMOB_API_KEY=
PAYMOB_PUBLIC_KEY=
PAYMOB_SECRET_KEY=
PAYMOB_INTEGRATION_ID=
PAYMOB_WALLET_INTEGRATION_ID=
PAYMOB_CARD_INTEGRATION_ID=
PAYMOB_IFRAME_ID=
PAYMOB_HMAC_SECRET=
PAYMOB_API_URL=https://accept.paymob.com/api
```

## References

- Paymob Developer Portal: https://developers.paymob.com/
- Paymob Payouts API: https://payouts.paymobsolutions.com/docs/instant_cashin_api/
- Paymob Accept API: https://developers.paymob.com/paymob-docs/accept-standard-redirect/overview
