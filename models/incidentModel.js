const mongoose = require("mongoose");

const incidentSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    index: true
  },

  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Job"
  },

  type: {
    type: String,
    enum: [
      "worker_cancelled",
      "worker_no_show",
      "employer_cancelled"
    ]
  },

  severity: {
    type: String,
    enum: ["low", "medium", "high"]
  },

  occurredAt: {
    type: Date,
    default: Date.now
  },

  penaltyApplied: {
    type: String
  }
});

module.exports = mongoose.model("Incident", incidentSchema);