const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      lowercase: true,
      index: true,
    },

    code: {
      type: String, // hashed
      required: true,
      select: false,
    },

    type: {
      type: String,
      enum: ["emailVerification", "passwordReset"],
      required: true,
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
    },

    verifiedAt: {
      type: Date,
    },

    attempts: {
      type: Number,
      default: 0,
      max: 5,
    },

    resendCount: {
      type: Number,
      default: 0,
      max: 3,
    },

    lastSentAt: {
      type: Date,
    },

    tempUserData: {
      type: Object,
      select: false,
    },
  },
  { timestamps: true }
);

/* Auto delete expired records */
verificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model("Verification", verificationSchema);
