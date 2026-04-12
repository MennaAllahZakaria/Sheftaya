const express = require("express");

const {
    createReview,
    getMyReviews,
    updateReview,
    deleteReview,
    getUserReviews,
    getAllReviews

} = require("../services/reviewService");

const { protect, allowedTo } = require("../middleware/authMiddleware");

const router = express.Router();

// ================= CREATE REVIEW =================
router.post(
    "/",
    protect,
    allowedTo("employer", "worker"),
    createReview
);
// ================= GET MY REVIEWS =================
router.get(
    "/my-reviews",
    protect,
    allowedTo("employer", "worker"),
    getMyReviews
);
// ================= UPDATE REVIEW =================
router.put(
    "/:id",
    protect,
    allowedTo("employer", "worker"),
    updateReview
);
// ================= DELETE REVIEW =================
router.delete(
    "/:id",
    protect,
    allowedTo("employer", "worker"),
    deleteReview
);

// ================= GET USER REVIEWS =================
router.get(
    "/user/:userId",
    getUserReviews
);

// ================= GET ALL REVIEWS (ADMIN) =================
router.get(
    "/",
    protect,
    allowedTo("admin"),
    getAllReviews
);

module.exports = router;