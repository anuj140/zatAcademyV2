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
    required: function () {
      // Password not required for Google-only users or users mid-invite-setup
      if (this.authProvider === "google") return false;
      return this.isSetupComplete !== false;
    },
    minlength: [8, "Password must be at least 8 characters"],
    select: false,
  },
  // ── Google OAuth ────────────────────────────────────────────────────────────
  googleId: {
    type: String,
    sparse: true,   // allows multiple null values while still enforcing uniqueness
    unique: true,
    select: false,
  },
  authProvider: {
    type: String,
    enum: ["local", "google"],
    default: "local",
  },
  picture: { type: String }, // Google profile photo URL
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
        if (v) {
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

  // ── Instructor/Admin Account Setup ───────────────────────────────────────────
  specialization: { type: String },
  contract: { type: String },
  isSetupComplete: { type: Boolean, default: true },
  inviteToken: { type: String },
  inviteTokenExpires: { type: Date },

  // ── Email verification ───────────────────────────────────────────────────────
  emailVerified: {
    type: Boolean,
    default: false,
  },
  emailOtp: { type: String, select: false },
  emailOtpExpires: { type: Date, select: false },

  // ── Phone verification ───────────────────────────────────────────────────────
  phoneVerified: {
    type: Boolean,
    default: false,
  },

  // ── Pending email change ─────────────────────────────────────────────────────
  pendingEmail: { type: String, select: false },
  pendingEmailOtp: { type: String, select: false },
  pendingEmailOtpExpires: { type: Date, select: false },

  // ── Pending phone change ─────────────────────────────────────────────────────
  pendingPhone: { type: String, select: false },

  // ── Refresh token (access-token / refresh-token auth) ─────────────────────────
  refreshToken: { type: String, select: false },
  refreshTokenExpires: { type: Date, select: false },

  // ── Password reset ───────────────────────────────────────────────────────────
  passwordResetToken: String,
  passwordResetExpires: Date,

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
userSchema.pre("save", async function () {
  if (!this.isModified("password")) return 
  this.password = await bcrypt.hash(this.password, 12);
});

// Update timestamp on update
userSchema.pre("findOneAndUpdate", async function () {
  this.set({ updatedAt: Date.now() });
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Generate a secure opaque refresh token (plain returned, SHA-256 hash stored)
userSchema.methods.createRefreshToken = function () {
  const rawToken = require("crypto").randomBytes(40).toString("hex");
  this.refreshToken = require("crypto").createHash("sha256").update(rawToken).digest("hex");
  this.refreshTokenExpires = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  return rawToken;
};

// Generate password reset token
userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString("hex");
  this.passwordResetToken = crypto.createHash("sha256").update(resetToken).digest("hex");
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 minutes
  return resetToken;
};

// Generate account setup invite token
userSchema.methods.createInviteToken = function () {
  const token = crypto.randomBytes(32).toString("hex");
  this.inviteToken = crypto.createHash("sha256").update(token).digest("hex");
  this.inviteTokenExpires = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days
  return token;
};

/**
 * Generate a 6-digit numeric OTP and return it.
 * The hashed version is stored in `otpField` and the expiry in `expiresField`.
 */
userSchema.methods.generateOtp = function (otpField, expiresField) {
  const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digits
  this[otpField] = crypto.createHash("sha256").update(otp).digest("hex");
  this[expiresField] = Date.now() + 10 * 60 * 1000; // 10 minutes
  return otp;
};

/**
 * Verify a plain OTP against a stored hashed OTP field.
 * Returns true if valid and not expired.
 */
userSchema.methods.verifyOtp = function (otp, otpField, expiresField) {
  const hashed = crypto.createHash("sha256").update(otp).digest("hex");
  return (
    this[otpField] === hashed &&
    this[expiresField] &&
    this[expiresField] > Date.now()
  );
};

module.exports = mongoose.model("User", userSchema);
