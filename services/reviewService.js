const Review = require("../models/reviewModel");
const Job = require("../models/jobModel");
const Application = require("../models/applicationModel");
const User = require("../models/userModel");
const ApiError = require("../utils/apiError");
const asyncHandler = require("express-async-handler");
const mongoose = require("mongoose");

/* ================= HELPER ================= */
const REVIEW_WINDOW_DAYS = 7;
const REVIEW_EDIT_HOURS = 24;

const updateUserRating = async (userId) => {
  const stats = await Review.aggregate([
    { $match: { revieweeId: userId } },
    {
      $group: {
        _id: "$revieweeId",
        avgRating: { $avg: "$rating" },
        totalReviews: { $sum: 1 },
      },
    },
  ]);

  const avg = stats[0]?.avgRating
    ? Number(stats[0].avgRating.toFixed(2))
    : 0;

  const count = stats[0]?.totalReviews || 0;

  await User.findByIdAndUpdate(userId, {
    ratingAverage: avg,
    rating: count,
  });
};

const isWithinReviewWindow = (jobDate) => {
  const now = new Date();
  const diffDays = (now - new Date(jobDate)) / (1000 * 60 * 60 * 24);
  return diffDays <= REVIEW_WINDOW_DAYS;
};

const isEditable = (createdAt) => {
  const now = new Date();
  const diffHours = (now - new Date(createdAt)) / (1000 * 60 * 60);
  return diffHours <= REVIEW_EDIT_HOURS;
};

/* ================= CREATE REVIEW ================= */


exports.createReview = asyncHandler(async (req, res, next) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const reviewerId = req.user._id;
    const { jobId, rating, comment, revieweeId } = req.body;

    if (!jobId || !rating) {
      throw new ApiError("jobId and rating are required", 400);
    }

    if (rating < 1 || rating > 5) {
      throw new ApiError("Rating must be between 1 and 5", 400);
    }

    const job = await Job.findById(jobId)
      .select("status employerId endDateTime")
      .session(session);

    if (!job) {
      throw new ApiError("Job not found", 404);
    }

    if (job.status !== "completed") {
      throw new ApiError("You can review only after job is completed", 400);
    }

    //  REVIEW WINDOW CHECK
    if (!isWithinReviewWindow(job.endDateTime)) {
      throw new ApiError("Review period expired", 400);
    }

    let finalRevieweeId;

    if (req.user.role === "worker") {
      const application = await Application.findOne({
        jobId,
        workerId: reviewerId,
        status: "accepted",
      }).session(session);

      if (!application) {
        throw new ApiError("You didn't participate in this job", 403);
      }

      finalRevieweeId = job.employerId;
    }

    else if (req.user.role === "employer") {
      if (!revieweeId) {
        throw new ApiError("revieweeId is required", 400);
      }

      const isWorkerInJob = await Application.findOne({
        jobId,
        workerId: revieweeId,
        status: "accepted",
      }).session(session);

      if (!isWorkerInJob) {
        throw new ApiError("Worker not part of this job", 403);
      }

      finalRevieweeId = revieweeId;
    }

    else {
      throw new ApiError("Invalid role", 400);
    }

    let review;

    try {
      review = await Review.create(
        [{
          jobId,
          reviewerId,
          revieweeId: finalRevieweeId,
          rating,
          comment,
        }],
        { session }
      );
    } catch (err) {
      if (err.code === 11000) {
        throw new ApiError("You already reviewed this job", 400);
      }
      throw err;
    }

    await updateUserRating(finalRevieweeId);

    await session.commitTransaction();
    session.endSession();

    res.status(201).json({
      status: "success",
      data: review[0],
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/* ================= GET MY REVIEWS ================= */

exports.getMyReviews = asyncHandler(async (req, res) => {
  const userId = req.user._id;

  const reviews = await Review.find({ reviewerId: userId })
    .populate("revieweeId", "firstName lastName imageProfile")
    .populate("jobId", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: reviews.length,
    data: reviews,
  });
});

/* ================= UPDATE REVIEW ================= */

exports.updateReview = asyncHandler(async (req, res, next) => {
  const reviewerId = req.user._id;
  const reviewId = req.params.id;

  const review = await Review.findOne({
    _id: reviewId,
    reviewerId,
  });

  if (!review) {
    throw new ApiError("Review not found", 404);
  }

  // LOCK AFTER TIME
  if (!isEditable(review.createdAt)) {
    throw new ApiError("Review can no longer be edited", 400);
  }

  review.rating = req.body.rating ?? review.rating;
  review.comment = req.body.comment ?? review.comment;

  await review.save();

  await updateUserRating(review.revieweeId);

  res.status(200).json({
    status: "success",
    data: review,
  });
});

/* ================= DELETE REVIEW ================= */

exports.deleteReview = asyncHandler(async (req, res, next) => {
  const reviewerId = req.user._id;
  const reviewId = req.params.id;

  const review = await Review.findOne({
    _id: reviewId,
    reviewerId,
  });

  if (!review) {
    throw new ApiError("Review not found", 404);
  }

  // LOCK
  if (!isEditable(review.createdAt)) {
    throw new ApiError("Review can no longer be deleted", 400);
  }

  await review.deleteOne();

  await updateUserRating(review.revieweeId);

  res.status(204).json({
    status: "success",
  });
});

/* ================= GET USER REVIEWS ================= */

exports.getUserReviews = asyncHandler(async (req, res) => {
  const userId = req.params.userId;

  const reviews = await Review.find({ revieweeId: userId })
    .populate("reviewerId", "firstName lastName imageProfile")
    .populate("jobId", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: reviews.length,
    data: reviews,
  });
});

/* ================= ADMIN ================= */

exports.getAllReviews = asyncHandler(async (req, res) => {
  const reviews = await Review.find()
    .populate("reviewerId", "firstName lastName imageProfile")
    .populate("revieweeId", "firstName lastName imageProfile")
    .populate("jobId", "title")
    .sort({ createdAt: -1 });

  res.status(200).json({
    status: "success",
    results: reviews.length,
    data: reviews,
  });
});