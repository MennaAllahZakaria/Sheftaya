const express = require("express");
const router = express.Router();

const {
    applyForJob,
    acceptWorker,
    rejectWorker,
    withdrawApplication,
    markArrival,
    markNoShow,
    getApplicationsForJob,
    getMyApplications,

}=require("../services/applicationService");

const {
    idValidator,
    acceptWorkerValidator,
    rejectWorkerValidator,
} = require("../utils/validators/applicationValidator");

const { protect, allowedTo } = require("../middleware/authMiddleware");


// Apply for a job (Worker)
router.post(
    "/jobs/:id/apply",
    protect, allowedTo("worker"),
    idValidator, 
    applyForJob
);

// Accept a worker's application (Employer)
router.post(
    "/jobs/:jobId/applications/:applicationId/accept", 
    protect, allowedTo("employer"),
    acceptWorkerValidator, 
    acceptWorker
);
// Reject a worker's application (Employer)
router.post(
    "/jobs/:jobId/applications/:applicationId/reject",
    protect, allowedTo("employer"), 
    rejectWorkerValidator, 
    rejectWorker
);
// Withdraw an application (Worker)
router.put(
    "/:id/withdraw",
    protect, allowedTo("worker"), 
    idValidator, 
    withdrawApplication
);
// Mark arrival for a job (Worker)  
router.post(
    "/applications/:id/mark-arrival", 
    protect, allowedTo("worker"),
    idValidator, 
    markArrival
);
// Mark worker no-show for a job (Employer)  
router.post(
    "/:id/mark-no-show", 
    protect, allowedTo("employer"),
    idValidator, 
    markNoShow);
// Get all applications for a specific job (Employer)
router.get(
    "/jobs/:id", 
    protect, allowedTo("employer"),
    idValidator, 
    getApplicationsForJob
);
// Get all applications made by the logged-in worker
router.get(
    "/my-applications", 
    protect, allowedTo("worker"),
    getMyApplications
);
module.exports = router;

