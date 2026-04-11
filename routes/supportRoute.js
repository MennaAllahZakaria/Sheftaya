const express = require("express");

const {
    createSupportRequest,
    getAllSupportRequests,
    getSupportRequest,
    updateSupportRequest,
    getMySupportRequests,
    closeSupportRequest,
    reopenSupportRequest,
} = require("../services/supportService");

const { protect, allowedTo } = require("../middleware/authMiddleware");

const {uploadImagesAndFiles, attachUploadedLinks} = require("../middleware/uploadFileMiddleware");

const router = express.Router();

// ================= USER - CREATE SUPPORT REQUEST =================
router.post(
    "/",
    protect,
    allowedTo("employer", "worker", "admin"),
    uploadImagesAndFiles, attachUploadedLinks,
    createSupportRequest
);
// ================= ALL USERS - GET ALL SUPPORT REQUESTS =================
router.get(
    "/",
    protect,
    allowedTo("admin"),
    getAllSupportRequests
);
// ================= ALL USERS - GET MY SUPPORT REQUESTS =================
router.get(
    "/my-requests",
    protect,
    allowedTo("employer", "worker"),
    getMySupportRequests
);
// ================= ALL USERS - GET A SUPPORT REQUEST =================
router.get(
    "/:id",
    protect,
    allowedTo( "admin"),
    getSupportRequest
);
// ================= USER - UPDATE SUPPORT REQUEST =================
router.put(
    "/:id",
    protect,
    allowedTo("admin" , "employer", "worker"),
    uploadImagesAndFiles, attachUploadedLinks,
    updateSupportRequest
);

// ================= USER - CLOSE SUPPORT REQUEST =================
router.put(
    "/:id/close",
    protect,
    allowedTo("admin"),
    closeSupportRequest
);
// ================= USER - REOPEN SUPPORT REQUEST =================
router.put(
    "/:id/reopen",
    protect,
    allowedTo("admin"),
    reopenSupportRequest
);

module.exports = router;