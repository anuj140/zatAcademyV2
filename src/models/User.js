const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const crypto = require("crypto");

const userSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, "Please provide your name"],
    trim: true,
    maxlength: [50, "Name cannot exceed 50 characters"],
  },
  email: {
    type: String,
    required: [true, "Please provide your email"],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, "Please provide a valid email"],
  },
  password: {
    type: String,
    required: [true, "Please provide a password"],
    minlength: [8, "Password must be at least 8 characters"],
    select: false,
  },
  role: {
    type: String,
    enum: ["student", "instructor", "admin", "superAdmin"],
    default: "student",
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  // Student-specific fields
  phone: {
    type: String,
    validate: {
      validator: function (v) {
        // Only validate phone if user is a student
        if (this.role === "student" && v) {
          return /^[6-9]\d{9}$/.test(v); // Indian phone number validation
        }
        return true;
      },
      message: "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
    },
  },
  interestedCourse: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Course",
  },
  yearOfPassout: {
    type: Number,
    validate: {
      validator: function (v) {
        // Only validate if provided
        if (v) {
          return v >= 2012 && v <= 2029;
        }
        return true;
      },
      message: "Year of passout must be between 2012 and 2029",
    },
  },
  highestQualification: {
    type: String,
    enum: {
      values: ["12th", "diploma", "bachelor's degree", "master's degree", "phd"],
      message:
        "Highest qualification must be one of: 12th, diploma, bachelor's degree, master's degree, phd",
    },
  },
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerified: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Encrypt password before saving
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return;

  return (this.password = await bcrypt.hash(this.password, 12));
});

// Update timestamp on update
userSchema.pre("findOneAndUpdate", async function (next) {
  this.set({ updatedAt: Date.now() });
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");

  this.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");

  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes

  return resetToken;
};

module.exports = mongoose.model("User", userSchema);
