const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const validator = require("validator");

const refreshTokenSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
  },
  deviceId: {
    type: String,
    required: true,
  },
  deviceName: String,
  browser: String,
  os: String,
  ipAddress: String,
  userAgent: String,
  createdAt: {
    type: Date,
    default: Date.now,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  lastUsedAt: {
    type: Date,
    default: Date.now,
  },
  revokedAt: Date,
  revokedReason: String,
  isActive: {
    type: Boolean,
    default: true,
  },
});

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
  passwordResetToken: String,
  passwordResetExpires: Date,
  emailVerified: {
    type: Boolean,
    default: false,
  },

  // Refresh tokens management
  refreshTokens: [refreshTokenSchema],

  // Security settings
  lastPasswordChange: {
    type: Date,
    default: Date.now,
  },
  lastLogin: Date,
  loginAttempts: {
    type: Number,
    default: 0,
  },
  lockUntil: Date,

  // Device management
  trustedDevices: [
    {
      deviceId: String,
      deviceName: String,
      browser: String,
      os: String,
      addedAt: Date,
      lastUsed: Date,
    },
  ],

  // Audit trail
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
  if (!this.isModified("password")) return;

  this.password = await bcrypt.hash(this.password, 12);
  this.lastPasswordChange = new Date();
});

// Update timestamp on update
userSchema.pre("findOneAndUpdate", async function () {
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

// Check if user is locked
userSchema.methods.isLocked = function () {
  return this.lockUntil && this.lockUntil > Date.now();
};

// Increment login attempts
userSchema.methods.incrementLoginAttempts = function () {
  // If lock has expired, reset attempts
  if (this.lockUntil && this.lockUntil < Date.now()) {
    this.loginAttempts = 1;
    this.lockUntil = undefined;
  } else {
    this.loginAttempts += 1;
  }

  // Lock account after 5 failed attempts for 30 minutes
  if (this.loginAttempts >= 5) {
    this.lockUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
  }
};

// Reset login attempts on successful login
userSchema.methods.resetLoginAttempts = function () {
  this.loginAttempts = 0;
  this.lockUntil = undefined;
  this.lastLogin = new Date();
};

// Add trusted device
userSchema.methods.addTrustedDevice = function (deviceInfo) {
  const existingDevice = this.trustedDevices.find(
    (device) => device.deviceId === deviceInfo.deviceId,
  );

  if (existingDevice) {
    existingDevice.lastUsed = new Date();
  } else {
    this.trustedDevices.push({
      ...deviceInfo,
      addedAt: new Date(),
      lastUsed: new Date(),
    });
  }
};

// Remove trusted device
userSchema.methods.removeTrustedDevice = function (deviceId) {
  this.trustedDevices = this.trustedDevices.filter(
    (device) => device.deviceId !== deviceId,
  );
};

// Check if device is trusted
userSchema.methods.isDeviceTrusted = function (deviceId) {
  return this.trustedDevices.some((device) => device.deviceId === deviceId);
};

module.exports = mongoose.model("User", userSchema);
