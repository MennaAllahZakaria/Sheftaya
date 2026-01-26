const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    jobId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Job",
      required: true,
      index: true,
    },

    workerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    status: {
      type: String,
      enum: [
        "pending",     // لسه مستني رد
        "accepted",    // اتقبل
        "rejected",    // اترفض
        "cancelled",   // العامل انسحب
      ],
      default: "pending",
      index: true,
    },

    arrivalStatus: {
      type: String,
      enum: ["not_arrived", "arrived", "no_show"],
      default: "not_arrived",
      index: true,
    },

    acceptedByEmployerAt: Date,

    cancelledAt: Date,

    cancelReason: String,

    employerAccepted: {
      type: Boolean,
      default: false,
    },

    workerConfirmedCompletion: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

/* ============ Indexes ============ */

// منع التقديم المكرر على نفس الشغل
applicationSchema.index(
  { jobId: 1, workerId: 1 },
  { unique: true }
);

// تسريع queries زي:
// كل التقديمات لشغل معين
applicationSchema.index({ jobId: 1, status: 1 });

// كل شغل عامل معين
applicationSchema.index({ workerId: 1, status: 1 });

module.exports = mongoose.model("Application", applicationSchema);
