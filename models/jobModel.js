const mongoose = require("mongoose");

const jobSchema = new mongoose.Schema(
  {
    employerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    title: {
      type: String,
      required: true,
      trim: true,
    },


    requiredSkills: {
      type: [String],
      index: true,
    },

    JobImages: {
      type: [String],
      default: [],
    },

    place: {
      type: String,
      required: true,
      trim: true,
    },

    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [longitude, latitude]
      mainPlace: String,
      address: String,
    },

    startDateTime: {
      type: Date,
      required: true,
    },

    endDateTime: {
      type: Date,
      required: true,
    },

    dailyWorkHours: {
      type: Number,
      min: 1,
      max: 24,
      required: true,
    },

    requiredWorkers: {
      type: Number,
      min: 1,
      required: true,
    },

    acceptedWorkersCount: {
      type: Number,
      default: 0,
    },

    pricePerHour: {
      amount: {
        type: Number,
        min: 0,
        required: true,
      },
      currency: {
        type: String,
        default: "EGP",
      },
    },

    experienceLevel: {
      type: String,
      default: "none",
      index: true,
    },

    details: {
      type: String,
      trim: true,
    },

    companyDetails: {
      companyName: { type: String },
      companyType: { type: String },
      companyAddress: { type: String },
      companyCity: { type: String },
      companyTaxNumber: { type: String },
      companyCommercialRegisterNumber: { type: String },
      companyContactPersonName: { type: String },
      companyImages: [String],
    },

    status: {
      type: String,
      enum: [
          "active",
          "completed",
          "rejected",
          "accepted",
          "reportResolved",
          "reportUnderReview",
      ],
      default: "active",
      index: true,
    },

    cancelReason: String,

    /* ============ Payment (Escrow) ============ */
    payment: {
      method: {
        type: String,
        enum: ["card", "wallet"],
        required: true,
      },

      status: {
        type: String,
        enum: ["pending", "held", "paid", "refunded"],
        default: "pending",
        index: true,
      },

      totalAmount: {
        type: Number,
        min: 0,
        required: true,
      },

      platformFee: {
        type: Number,
        min: 0,
        default: 0,
      },

      escrowId: String,
    },

    /* ============ Confirmation Flow ============ */
    confirmation: {
      employerConfirmed: {
        type: Boolean,
        default: false,
      },

      workersConfirmedCount: {
        type: Number,
        default: 0,
      },

      autoConfirmAt: Date,
    },

    /* ============ Cancellation Policy ============ */
    cancellationPolicy: {
      freeCancelUntil: Date,   // قبلها بدون عقوبة
      penaltyAfter: Date,      // بعدها عقوبة
    },
  },
  { timestamps: true }
);

/* ============ Indexes ============ */

jobSchema.index({ location: "2dsphere" }); 

jobSchema.index({ "location.city": 1, startDateTime: 1 });

// منع Jobs في الماضي تتساب مفتوحة
jobSchema.index(
  { startDateTime: 1 },
  { expireAfterSeconds: 60 * 60 * 24 * 7 } // أسبوع بعد الميعاد
);

module.exports = mongoose.model("Job", jobSchema);
