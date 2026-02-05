const express = require("express");
const router = express.Router();

//upload controller
const {uploadImagesAndFiles , attachUploadedLinks} = require("../middleware/uploadFileMiddleware");

const {
        signup,
        resendSignupOtp,
        verifySignupOtp,
        login,
        forgotPassword,
        resendPasswordResetOtp,
        verifyResetOtp,
        resetPassword,
        changePassword,
        getLoggedInUser,
        updateFCMToken
      } = require("../services/authService");


const {
        signupRequestValidation,
        verifyOtpValidation,
        completeSignupValidation,
        loginValidation,
        forgotPasswordValidation,
        resetPasswordValidation
      } = require("../utils/validators/authValidator");
// Validation

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
  "/signup",
  uploadImagesAndFiles,
  attachUploadedLinks,
  signupRequestValidation,
  signup
);

/**
 * STEP 2 – Verify signup OTP
 * POST /auth/signup/verify
 */
router.post(
  "/signup/verify",
  verifyOtpValidation,
  verifySignupOtp
);

/**
 * Resend signup OTP
 * POST /auth/signup/resend-otp
 *  Body: { email }
 */
router.post(
  "/signup/resend-otp",
  resendSignupOtp
);


/* =====================================================
   AUTH – LOGIN
===================================================== */

/**
 * POST /auth/login
 */
router.post(
  "/login",
  loginValidation,
  login
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
  forgotPasswordValidation,
  forgotPassword
);

/**
 * Resend password reset OTP
 * POST /auth/password/resend-otp
 **/
router.post(
  "/password/resend-otp",
  resendPasswordResetOtp
);

/**
 * STEP 2 – Verify reset OTP
 * POST /auth/password/verify
 */
router.post(
  "/password/verify",
  verifyOtpValidation,
  verifyResetOtp
);

/**
 * STEP 3 – Reset password
 * POST /auth/password/reset
 * Header: Authorization: Bearer resetToken
 */
router.post(
  "/password/reset",
  resetPasswordValidation,
  resetPassword
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
  resetPasswordValidation,
  changePassword
);

router.get(
  "/me",
  protect,
  getLoggedInUser
);

router.put(
  "/update-fcm-tokens",
  protect,
  updateFCMToken
);

module.exports = router;
