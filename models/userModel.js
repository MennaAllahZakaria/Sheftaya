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
      default: "ar",
    },

    city: {
      type: String,
      required: true,
      index: true,
    },
    phone :{
      type: String,
    },

    birthDate: {
      type: Date,
    },

    imageProfile: String,

    fcmToken: {
      type: String,
      default: null,
    },


    discipline: {
      warnings: { type: Number, default: 0 },
      cancellations: { type: Number, default: 0 },
      noShows: { type: Number, default: 0 },
      blockedUntil: { type: Date }
    },

    status: {
      type: String,
      enum: ["pending", "active", "suspended"], 
      default: "pending",
    },
    rating: {
      type: Number,
      default: 0,
    },
    ratingAverage: {
      type: Number,
      default: 0,
    },

    /* ============ Payment & Payout Details ============ */
    paymentPreferences: {
      method: {
        type: String,
        enum: ["card", "wallet"],
        default: "card",
      },
    },

    workerPayoutDetails: {
      method: {
        type: String,
        enum: ["mobile_wallet", "bank_card", "aman"],
      },
      // For mobile wallets
      mobileWalletNumber: String, // e.g., 01020304050 (without +2)
      walletIssuer: {
        type: String,
        enum: ["vodafone", "etisalat", "orange", "bank_wallet"],
      },
      // For bank accounts
      bankCardNumber: String, // IBAN or card number
      bankCode: String,
      bankName: String,
      bankTransactionType: {
        type: String,
        enum: ["salary", "credit_card", "prepaid_card", "cash_transfer"],
        default: "salary",
      },
      fullName: String,
      // For Aman
      firstName: String,
      lastName: String,
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

//@ dec remove "password" &"__v" from the output
userSchema.set("toJSON", {
  transform: function (doc, ret, options) {
    delete ret.password; // remove "password" from the output
    delete ret.__v; // remove "__v" from the output
    return ret;
  },
});

module.exports = mongoose.model("User", userSchema);