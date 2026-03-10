const mongoose = require("mongoose");

const studentProfileSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student reference is required"],
      // unique: true,
      // sparse: true, // Remove spare index in production
    },
    // Basic Information (pre-filled from User)
    name: {
      type: String,
      required: [true, "Name is required"],
    },
    phone: {
      type: String,
      required: [true, "Phone number is required"],
      validate: {
        validator: function (v) {
          return /^[6-9]\d{9}$/.test(v);
        },
        message:
          "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
      },
    },
    // Family Information
    fathersName: {
      type: String,
      required: [true, "Father's name is required"],
      trim: true,
    },
    // Personal Details
    birthDate: {
      type: Date,
      required: [true, "Date of birth is required"],
      validate: {
        validator: function (v) {
          const age = new Date().getFullYear() - v.getFullYear();
          return age >= 16 && age <= 80;
        },
        message: "Age must be between 16 and 80 years",
      },
    },
    gender: {
      type: String,
      enum: {
        values: ["male", "female", "other"],
        message: "Gender must be one of: male, female, other",
      },
      required: [true, "Gender is required"],
    },
    qualification: {
      type: String,
      enum: {
        values: ["12th", "diploma", "bachelor's degree", "master's degree", "phd"],
        message:
          "Qualification must be one of: 12th, diploma, bachelor's degree, master's degree, phd",
      },
    },
    // Contact Information
    alternatePhone: {
      type: String,
      validate: {
        validator: function (v) {
          if (v) {
            return /^[6-9]\d{9}$/.test(v);
          }
          return true;
        },
        message:
          "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
      },
    },
    // Address Information
    city: {
      type: String,
      required: [true, "City is required"],
      trim: true,
    },
    state: {
      type: String,
      required: [true, "State is required"],
      trim: true,
    },
    country: {
      type: String,
      default: "India",
    },
    // Identification
    identificationType: {
      type: String,
      enum: {
        values: ["aadhar", "pan", "both"],
        message: "Identification type must be one of: aadhar, pan, both",
      },
      required: [true, "At least one identification type is required"],
    },
    aadharNumber: {
      type: String,
      validate: {
        validator: function (v) {
          if (v) {
            return /^\d{12}$/.test(v);
          }
          return true;
        },
        message: "Aadhar number must be 12 digits",
      },
    },
    panNumber: {
      type: String,
      validate: {
        validator: function (v) {
          if (v) {
            // PAN format: AAAAA0000A (10 characters)
            return /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(v);
          }
          return true;
        },
        message: "PAN number must be in format AAAAA0000A (10 characters)",
      },
    },
    // Terms & Conditions
    termsAccepted: {
      type: Boolean,
      required: [true, "Terms and conditions must be accepted"],
      default: false,
    },
    termsAcceptedAt: {
      type: Date,
    },
    privacyAccepted: {
      type: Boolean,
      required: [true, "Privacy policy must be accepted"],
      default: false,
    },
    privacyAcceptedAt: {
      type: Date,
    },
    // Profile Status
    profileStatus: {
      type: String,
      enum: ["incomplete", "complete", "verified"],
      default: "complete",
    },
    verifiedAt: {
      type: Date,
    },
    // System Fields
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Custom validation: At least one identification (Aadhar or PAN) required
studentProfileSchema.pre("validate", async function () {
  if (!this.aadharNumber && !this.panNumber) {
    const err = new Error("At least one identification (Aadhar or PAN) is required");
  }
});

// Pre-save hook to update timestamps
studentProfileSchema.pre("findOneAndUpdate", async function () {
  this.set({ updatedAt: Date.now() });
});

// Pre-save hook to record acceptance timestamps
studentProfileSchema.pre("save", async function () {
  if (this.isModified("termsAccepted") && this.termsAccepted) {
    this.termsAcceptedAt = Date.now();
  }
  if (this.isModified("privacyAccepted") && this.privacyAccepted) {
    this.privacyAcceptedAt = Date.now();
  }
});

// Index for faster lookups
studentProfileSchema.index({ student: 1 });
studentProfileSchema.index({ createdAt: -1 });

module.exports = mongoose.model("StudentProfile", studentProfileSchema);
