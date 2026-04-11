const express = require("express");
 
const {
    createReport,
    getMyReports,
    getAllReports,
    updateReportStatus,
    resolveReport,
    rejectReport
} = require("../services/reportService");

const { protect, allowedTo } = require("../middleware/authMiddleware");

const {uploadImagesAndFiles, attachUploadedLinks} = require("../middleware/uploadFileMiddleware");

const router = express.Router();

// ================= CREATE REPORT =================
router.post(
    "/",
    protect,
    allowedTo("employer", "worker"),
    uploadImagesAndFiles, attachUploadedLinks,
    createReport
);
// ================= GET MY REPORTS =================
router.get(
    "/my-reports",
    protect,
    allowedTo("employer", "worker"),
    getMyReports
);

// ================= GET ALL REPORTS =================
router.get(
    "/",
    protect,
    allowedTo("admin"),
    getAllReports
);
// ================= UPDATE REPORT STATUS =================
router.put(
    "/:id/status",
    protect,
    allowedTo("admin"),
    updateReportStatus
);

// ================= RESOLVE REPORT =================
router.put(
    "/:id/resolve",
    protect,
    allowedTo("admin"),
    resolveReport
);

// ================= REJECT REPORT =================
router.put(
    "/:id/reject",
    protect,
    allowedTo("admin"),
    rejectReport
);

module.exports = router;