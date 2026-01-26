const validatorMiddleware = require("../../middleware/validatorMiddleware");

// validations/authValidation.js
const { body, param } = require("express-validator");

exports.idValidator = [
    param("id")
        .notEmpty()
        .withMessage("Application ID is required")
        .isMongoId()
        .withMessage("Invalid application ID"),
    validatorMiddleware
];

exports.acceptWorkerValidator = [
    param("jobId")
        .notEmpty()
        .withMessage("Job ID is required")
        .isMongoId()
        .withMessage("Invalid job ID"),
    param("applicationId")
        .notEmpty()
        .withMessage("Application ID is required")
        .isMongoId()
        .withMessage("Invalid application ID"),
    validatorMiddleware
];

exports.rejectWorkerValidator = [
    param("jobId")
        .notEmpty()
        .withMessage("Job ID is required")
        .isMongoId()
        .withMessage("Invalid job ID"),
    param("applicationId")
        .notEmpty()
        .withMessage("Application ID is required")
        .isMongoId()
        .withMessage("Invalid application ID"),
    validatorMiddleware
];

