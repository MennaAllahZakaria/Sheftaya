const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    type: {
      type: String,
      enum: [
        "job_applied",
        "job_accepted",
        "job_reminder_24h",
        "job_reminder_2h",
        "job_started",
        "job_completed",
        "worker_no_show",
        "new_application",
        "job_rejected",
        "worker_withdrew",
        "no_show_recorded",
        "job_cancelled",
        "payment_success",
        "payout_initiated",
        "refund_processed",
      ],
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    relatedJobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
    },

    isSent: {
      type: Boolean,
      default: false,
      index: true,
    },

    scheduledAt: {
      type: Date,
      index: true,
    },

    sentAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

notificationSchema.index({ scheduledAt: 1, isSent: 1 });

module.exports = mongoose.model("Notification", notificationSchema);
