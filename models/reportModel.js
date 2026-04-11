const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    applicationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Application",
        required: [true, "Report must have an application"],
    },
    reporter: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Report must have a reporter"],
    },
    reportedUser: {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
        required: [true, "Report must have a reported user"],
    },
    reason: {
        type: String,
        required: [true, "Report must have a reason"],
        trim: true,
        maxlength: 1000,
    },
    reportImage: {
        type: String,
    },
    status: {
        type: String,
        enum: ["under_review", "in_progress", "resolved", "rejected"],
        default: "under_review",
    },
  },
  { timestamps: true }
);
reportSchema.index({ applicationId: 1 });
reportSchema.index({ reporter: 1 });
reportSchema.index({ reportedUser: 1 });
module.exports = mongoose.model("Report", reportSchema);