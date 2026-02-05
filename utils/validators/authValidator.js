const validatorMiddleware = require("../../middleware/validatorMiddleware");

// validations/authValidation.js
const { check } = require("express-validator");

exports.signupRequestValidation = [
  check("email")
    .isEmail()
    .withMessage("Invalid email format")
    .normalizeEmail(),

  check("password")
    .notEmpty()
    .withMessage("Password is required")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),

  check("confirmPassword")
    .notEmpty()
    .withMessage("Confirm Password is required")
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error("Password confirmation does not match password");
      }
      return true;
    }),

  // check("role")
  //   .isIn(["worker", "employer"])
  //   .withMessage("Role must be either 'worker' or 'employer'"),

  
  // check("employerProfile.companyName")
  //   .if(check("role").equals("employer"))
  //   .notEmpty()
  //   .withMessage("Company name is required for employer"),
  // check("employerProfile.companyType")
  //   .if(check("role").equals("employer"))
  //   .notEmpty()
  //   .withMessage("Company type is required for employer"),
  // check("employerProfile.companyAddress")
  //   .if(check("role").equals("employer"))
  //   .notEmpty()
  //   .withMessage("Company address is required for employer"),
  // check("employerProfile.city")
  //   .if(check("role").equals("employer"))
  //   .notEmpty()
  //   .withMessage("City is required for employer"),

  // check("workerProfile.education")
  //   .if(check("role").equals("worker"))
  //   .notEmpty()
  //   .withMessage("Education is required for worker"),
  // check("workerProfile.professionalStatus")
  //   .if(check("role").equals("worker"))
  //   .optional()
  //   .isIn(["student", "full_time", "part_time", "unemployed", "other"])
  //   .withMessage("Invalid professional status for worker"),
  // check("workerProfile.pastExperience")
  //   .if(check("role").equals("worker"))
  //   .optional()
  //   .isArray()
  //   .withMessage("Past experience must be an array for worker"),
  // check("workerProfile.jobsLookedFor")
  //   .if(check("role").equals("worker"))
  //   .notEmpty()
  //   .withMessage("Jobs looked for is required for worker")
  //   .isArray({ min: 1 })
  //   .withMessage("Jobs looked for must be an array with at least one job for worker"),


validatorMiddleware
];

exports.verifyOtpValidation = [
  check("email")
    .isEmail()
    .withMessage("Invalid email"),

  check("code")
    .isLength({ min: 6, max: 6 })
    .isNumeric()
    .withMessage("OTP must be 6 digits"),
validatorMiddleware
];

exports.completeSignupValidation = [
  check("firstName")
    .trim()
    .notEmpty()
    .withMessage("First name required"),

  check("lastName")
    .trim()
    .notEmpty()
    .withMessage("Last name required"),

  check("role")
    .isIn(["worker", "employer"])
    .withMessage("Invalid role"),

  check("city")
    .notEmpty()
    .withMessage("City is required"),

    validatorMiddleware
];

exports.loginValidation = [
  check("email")
    .isEmail()
    .normalizeEmail(),

  check("password")
    .notEmpty()
    .withMessage("Password is required"),
validatorMiddleware
];

exports.forgotPasswordValidation = [
  check("email")
    .isEmail()
    .normalizeEmail(),
validatorMiddleware
];

exports.resetPasswordValidation = [
  check("newPassword")
    .isLength({ min: 8 })
    .withMessage("Password must be at least 8 characters"),
validatorMiddleware
];

