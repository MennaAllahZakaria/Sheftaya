const validatorMiddleware = require("../../middleware/validatorMiddleware");

// validations/authValidation.js
const { check,body, param } = require("express-validator");

exports.createJobValidator = [
    check("title")
        .trim()
        .notEmpty()
        .withMessage("Job title is required"),
    check("place")
        .trim()
        .notEmpty()
        .withMessage("Job place is required"),
    check("startDateTime")
        .isISO8601()
        .withMessage("Invalid start date and time"),
    check("endDateTime")
        .isISO8601()
        .withMessage("Invalid end date and time")
        .custom((value, { req }) => {
            if (new Date(value) <= new Date(req.body.startDateTime)) {
                throw new Error("End date and time must be after start date and time");
            }
            return true;
        }),
    check("dailyWorkHours")
        .isInt({ min: 1, max: 24 })
        .withMessage("Daily work hours must be between 1 and 24"),
    check("pricePerHour.amount")
        .isFloat({ gt: 0 })
        .withMessage("Price per hour must be a positive number"),

    
    check("requiredWorkers")
        .isInt({ min: 1 })
        .withMessage("At least one worker is required"),
    check("details")
        .trim()
        .notEmpty()
        .withMessage("Job details are required"),
    check("experienceLevel")
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
    check("title")   
        .optional()
        .trim(),
    check("place")
        .optional() 
        .trim(),
    check("location")
        .optional() 
        .trim(),
    check("startDateTime")
        .optional() 
        .isISO8601()
        .withMessage("Invalid start date and time"),
    check("endDateTime")
        .optional() 
        .isISO8601()
        .withMessage("Invalid end date and time")
        .custom((value, { req }) => {
            if (req.check.startDateTime && new Date(value) <= new Date(req.check.startDateTime)) {
                throw new Error("End date and time must be after start date and time");
            }
            return true;
        }),
    check("dailyWorkHours")
        .optional()
        .isInt({ min: 1, max: 24 })
        .withMessage("Daily work hours must be between 1 and 24"),
    check("requiredWorkers") 
        .optional()
        .isInt({ min: 1 })
        .withMessage("At least one worker is required")
        .isInt({ max: 1000 })
        .withMessage("Required workers must be less than 1000"),
    check("details")
        .optional()
        .trim()
        .notEmpty()
        .withMessage("Job details are required"),
    check("experienceLevel")
        .optional()
        .isIn(["none", "junior", "mid", "senior"])
        .withMessage("Invalid experience level"),
    validatorMiddleware
];
