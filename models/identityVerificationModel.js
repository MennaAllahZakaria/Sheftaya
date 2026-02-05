const mongoose = require("mongoose");

const identityVerificationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    frontIdImage: {
      type: String,
      required: true,
    },

    backIdImage: {
      type: String,
      required: true,
    },

    selfieImage: {
      type: String,
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
      index: true,
    },

    rejectionReason: {
      type: String,
    },

    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    verifiedAt: Date,
  },
  { timestamps: true }
);

/* ===== Business Validation ===== */

identityVerificationSchema.pre("save" , function () {
  if (this.status === "rejected" && !this.rejectionReason) {
    return (new Error("Rejection reason required"));
  }

  if (this.status === "approved" && !this.selfieImage) {
    return (new Error("Selfie image required for approval"));
  }

  return;
});

module.exports = mongoose.model("IdentityVerification", identityVerificationSchema);
