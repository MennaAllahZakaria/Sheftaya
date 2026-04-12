const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema(
    {
        jobId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Job",
            required: true,
        },
        reviewerId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        revieweeId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
        },
        rating: {
            type: Number,
            required: true,
            min: 1,
            max: 5,
        },
        comment: {
            type: String,
            default: "",
        },
    },
    { timestamps: true }
);

reviewSchema.index({ reviewerId: 1, revieweeId: 1 }, { unique: true });

const Review = mongoose.model("Review", reviewSchema);


module.exports = Review;