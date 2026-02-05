const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
    },

    code: {
      type: String,
      required: true,
      select: false,
    },

    type: {
      type: String,
      enum: ["emailVerification", "passwordReset"],
      required: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    verifiedAt: Date,

    attempts: {
      type: Number,
      default: 0,
    },

    resendCount: {
      type: Number,
      default: 0,
    },

    lastSentAt: Date,

    /* ======================
       SIGNUP PAYLOAD
    ======================= */
    payload: {
      type: mongoose.Schema.Types.Mixed,
      select: false,
    },
  },
  { timestamps: true }
);

/* compound index */
verificationSchema.index({ email: 1, type: 1 });

/* auto delete expired */
verificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Verification", verificationSchema);