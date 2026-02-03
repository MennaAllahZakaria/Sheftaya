const mongoose = require("mongoose");

const workerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    education :{
      type: String,
      required: true,
    },

    professionalStatus: {
      type: String,
      enum: ["student", "full_time", "part_time", "unemployed", "other"],
      default: "student",
    },

    pastExperience: {
      type: [String],
      default: [],
    },

    jobsLookedFor: {
      type: [String],
      required: true,
      index: true,
    },

    experienceYears: {
      type: Number,
      min: 0,
      max: 50,
    },

    availability: [
      {
        day: {
          type: String,
          enum: ["sat", "sun", "mon", "tue", "wed", "thu", "fri"],
        },
        from: String,
        to: String,
      },
    ],

    expectedHourlyRate: {
      amount: {
        type: Number,
        min: 0,
      },
      currency: {
        type: String,
        default: "EGP",
      },
    },

    healthCertificate: {
      type: String,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WorkerProfile", workerProfileSchema);