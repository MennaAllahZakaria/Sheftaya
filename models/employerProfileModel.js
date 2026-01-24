const mongoose = require("mongoose");

const employerProfileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },

    companyName: {
      type: String,
      required: true,
      index: true,
    },

    companyType: {
      type: String,
      required: true,
      index: true,
    },

    companyAddress: {
      type: String,
      required: true,
    },

    city: {
      type: String,
      required: true,
      index: true,
    },

    taxNumber: {
      type: String,
    },

    commercialRegisterNumber: {
      type: String,
      unique: true,
      sparse: true,
    },

    contactPersonName: String,

    companyImages: {
      type: [String],
      default: [],
    },
  },
  { timestamps: true }
);

// شائع جدا في البحث
employerProfileSchema.index({ city: 1, companyType: 1 });

module.exports = mongoose.model("EmployerProfile", employerProfileSchema);

