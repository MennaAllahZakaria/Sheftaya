const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      required: true,
    },

    lastName: {
      type: String,
      trim: true,
      required: true,
    },

    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      unique: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
      minlength: 8,
      select: false,
    },

    passwordChangedAt: Date,

    role: {
      type: String,
      enum: ["worker", "employer", "admin"],
      default: "worker",
      index: true,
    },

    preferredLang: {
      type: String,
      enum: ["en", "ar"],
      default: "en",
    },

    city: {
      type: String,
      required: true,
      index: true,
    },

    birthDate: {
      type: Date,
    },

    profileImage: String,

    fcmTokens: [
      {
        token: { type: String },
        platform: { type: String },
        lastUsedAt: { type: Date },
      },
    ],

    workerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WorkerProfile",
    },

    employerProfile: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "EmployerProfile",
    },

    identityVerification: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "IdentityVerification",
    },
  },
  { timestamps: true }
);

/* ===== Business Guards ===== */

// منع birthDate مستقبلية
userSchema.pre("save", function (next) {
  if (this.birthDate && this.birthDate > new Date()) {
    return next(new Error("Invalid birthDate"));
  }
});

module.exports = mongoose.model("User", userSchema);