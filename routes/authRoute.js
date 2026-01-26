const express = require("express");
const router = express.Router();

const authController = require("../services/authService");

// Validation
const authValidation = require("..//utils/validators/authValidator");

// Auth & Authorization
const { protect, allowedTo } = require("../middleware/authMiddleware");

/* =====================================================
   AUTH – SIGNUP FLOW
===================================================== */

/**
 * STEP 1 – Request signup (send email OTP)
 * POST /auth/signup/request
 */
router.post(
  "/signup/request",
  authValidation.signupRequestValidation,
  authController.signupRequest
);

/**
 * STEP 2 – Verify signup OTP
 * POST /auth/signup/verify
 */
router.post(
  "/signup/verify",
  authValidation.verifyOtpValidation,
  authController.verifySignupOtp
);

/**
 * STEP 3 – Complete signup (create user + profile)
 * POST /auth/signup/complete
 * Header: Authorization: Bearer signupToken
 */
router.post(
  "/signup/complete",
  authValidation.completeSignupValidation,
  authController.completeSignup
);

/* =====================================================
   AUTH – LOGIN
===================================================== */

/**
 * POST /auth/login
 */
router.post(
  "/login",
  authValidation.loginValidation,
  authController.login
);

/* =====================================================
   AUTH – FORGOT / RESET PASSWORD
===================================================== */

/**
 * STEP 1 – Request password reset
 * POST /auth/password/forgot
 */
router.post(
  "/password/forgot",
  authValidation.forgotPasswordValidation,
  authController.forgotPassword
);

/**
 * STEP 2 – Verify reset OTP
 * POST /auth/password/verify
 */
router.post(
  "/password/verify",
  authValidation.verifyOtpValidation,
  authController.verifyResetOtp
);

/**
 * STEP 3 – Reset password
 * POST /auth/password/reset
 * Header: Authorization: Bearer resetToken
 */
router.post(
  "/password/reset",
  authValidation.resetPasswordValidation,
  authController.resetPassword
);

/* =====================================================
   AUTH – PROTECTED USER ACTIONS
===================================================== */

/**
 * Change password (logged-in user)
 * PUT /auth/change-password
 */
router.put(
  "/change-password",
  protect,
  authValidation.resetPasswordValidation,
  authController.changePassword
);

router.get(
  "/me",
  protect,
  authController.getLoggedInUser
);

router.put(
  "/update-fcm-tokens",
  protect,
  authController.updateFCMToken
);

module.exports = router;
