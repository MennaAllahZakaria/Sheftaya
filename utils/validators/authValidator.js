const validatorMiddleware = require("../../middleware/validatorMiddleware");

// validations/authValidation.js
const { body } = require("express-validator");

exports.signupRequestValidation = [
  body("email")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters")
    .matches(/[A-Z]/).withMessage("Password must contain uppercase letter")
    .matches(/[a-z]/).withMessage("Password must contain lowercase letter")
    .matches(/[0-9]/).withMessage("Password must contain number"),

validatorMiddleware
];

exports.verifyOtpValidation = [
  body("email")
    .isEmail()
    .withMessage("Invalid email"),

  body("code")
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage("OTP must be 6 digits"),
validatorMiddleware
];

exports.completeSignupValidation = [
  body("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name required"),

  body("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name required"),

  body("role")
    .isIn(["worker", "employer"])
    .withMessage("Invalid role"),

  body("city")
    .notEmpty()
    .withMessage("City is required"),

  body("password")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
validatorMiddleware
];

exports.loginValidation = [
  body("email")
    .isEmail()
    .normalizeEmail(),

  body("password")
    .notEmpty()
    .withMessage("Password is required"),
validatorMiddleware
];

exports.forgotPasswordValidation = [
  body("email")
    .isEmail()
    .normalizeEmail(),
validatorMiddleware
];

exports.resetPasswordValidation = [
  body("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
validatorMiddleware
];

