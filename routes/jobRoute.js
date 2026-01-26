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

}= require("../services/jobService");
// Validation

const {
    createJobValidator,
    idValidator,
    updateJobValidator, 
} = require("../utils/validators/jobValidator");

// Auth & Authorization
const { protect, allowedTo } = require("../middleware/authMiddleware");

/* =====================================================
   JOB ROUTES
===================================================== */
// Create Job - Employer
router.post(
    "/",
    protect,
    allowedTo("employer"),
    createJobValidator,
    createJob
);
// Get Open Jobs - Worker
router.get(
    "/open",
    protect,
    allowedTo("worker"),
    getOpenJobs
);
// Get Job Details - Worker & Employer
router.get(
    "/:id",
    protect,
    allowedTo("worker", "employer"),
    idValidator,
    getJobDetails
);
// Get My Jobs - Worker & Employer
router.get(
    "/my-jobs",
    protect,
    allowedTo("worker", "employer"),
    getMyJobs
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