const validatorMiddleware = require("../../middleware/validatorMiddleware");

// validations/authValidation.js
const { body, param } = require("express-validator");

exports.createJobValidator = [
    body("title")
        .trim()
        .notEmpty()
        .withMessage("Job title is required"),
    body("place")
        .trim()
        .notEmpty()
        .withMessage("Job place is required"),
    body("location")
        .trim()
        .notEmpty()
        .withMessage("Job location is required"),
    body("startDateTime")
        .isISO8601()
        .withMessage("Invalid start date and time"),
    body("endDateTime")
        .isISO8601()
        .withMessage("Invalid end date and time")
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startDateTime)) {
                throw new Error("End date and time must be after start date and time");
            }
            return true;
        }),
    body("dailyWorkHours")
        .isInt({ min: 1, max: 24 })
        .withMessage("Daily work hours must be between 1 and 24"),
    body("pricePerHour.amount")
        .isFloat({ gt: 0 })
        .withMessage("Price per hour must be a positive number"),
    body("pricePerHour.currency")
        .isCurrency()
        .withMessage("Invalid currency format"),
    
    body("requiredWorkers")
        .isInt({ min: 1 })
        .withMessage("At least one worker is required"),
    body("details")
        .trim()
        .notEmpty()
        .withMessage("Job details are required"),
    body("experienceLevel")
        .isIn(["none", "junior", "mid", "senior"])
        .withMessage("Invalid experience level"),
    validatorMiddleware
];

exports.idValidator = [
    param("id")
        .notEmpty()
        .withMessage("Job ID is required")
        .isMongoId()
        .withMessage("Invalid job ID"),
    validatorMiddleware
];

exports.updateJobValidator=[
    param("id")
        .notEmpty()
        .withMessage("Job ID is required")
        .isMongoId()
        .withMessage("Invalid job ID"),
    body("title")   
        .optional()
        .trim(),
    body("place")
        .optional() 
        .trim(),
    body("location")
        .optional() 
        .trim(),
    body("startDateTime")
        .optional() 
        .isISO8601()
        .withMessage("Invalid start date and time"),
    body("endDateTime")
        .optional() 
        .isISO8601()
        .withMessage("Invalid end date and time")
        .custom((value, { req }) => {
            if (req.body.startDateTime && new Date(value) <= new Date(req.body.startDateTime)) {
                throw new Error("End date and time must be after start date and time");
            }
            return true;
        }),
    body("dailyWorkHours")
        .optional()
        .isInt({ min: 1, max: 24 })
        .withMessage("Daily work hours must be between 1 and 24"),
    body("requiredWorkers") 
        .optional()
        .isInt({ min: 1 })
        .withMessage("At least one worker is required"),
    body("details")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Job details are required"),
    body("experienceLevel")
        .optional()
        .isIn(["none", "junior", "mid", "senior"])
        .withMessage("Invalid experience level"),
    validatorMiddleware
];
