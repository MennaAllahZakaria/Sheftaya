const express = require("express");
const router = express.Router();

const {
    createJob,
    getOpenJobs,
    getJobDetails,
    getMyJobs,
    updateJob,
    cancelJob,
    confirmCompletion,
    getRecommendedJobs,

}= require("../services/jobService");

//upload controller
const {uploadImagesAndFiles , attachUploadedLinks} = require("../middleware/uploadFileMiddleware");

// Validation

const {
    createJobValidator,
    idValidator,
    updateJobValidator, 
} = require("../utils/validators/jobValidator");

// Auth & Authorization
const { protect, allowedTo } = require("../middleware/authMiddleware");

const parseFormDataMiddleware = require("../middleware/parseFormDataMiddleware")

/* =====================================================
   JOB ROUTES
===================================================== */
// Create Job - Employer
router.post(
    "/",
    protect,
    allowedTo("employer"),
    uploadImagesAndFiles , attachUploadedLinks,
    parseFormDataMiddleware,
    createJobValidator,
    createJob
);
// Get Recommended Jobs - Worker
router.get(
    "/recommendations",
    protect,
    allowedTo("worker"),
    getRecommendedJobs
);
// Get Open Jobs - Worker
router.get(
    "/open",
    protect,
    allowedTo("worker"),
    getOpenJobs
);
// Get My Jobs - Worker & Employer
router.get(
    "/my-jobs",
    protect,
    allowedTo("worker", "employer"),
    getMyJobs
);
// Get Job Details - Worker & Employer
router.get(
    "/:id",
    protect,
    allowedTo("worker", "employer"),
    idValidator,
    getJobDetails
);

// Update Job - Employer
router.put(
    "/:id",
    protect,
    allowedTo("employer"),
    idValidator,
    updateJobValidator,
    updateJob
);
// Cancel Job - Employer
router.put(
    "/:id/cancel",
    protect,
    allowedTo("employer"),
    idValidator,
    cancelJob
);
// Confirm Job Completion - Employer
router.put(
    "/:id/confirm-completion",
    protect,
    allowedTo("employer"),
    idValidator,
    confirmCompletion
);



module.exports = router;