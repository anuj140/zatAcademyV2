const mongoose = require("mongoose");

const tokenBlacklistSchema = new mongoose.Schema({
  token: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 },
  },
  reason: {
    type: String,
    enum: [
      "logout",
      "security_breach",
      "password_change",
      "suspicious_activity",
      "admin_action",
      "other",
    ],
    default: "logout",
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 86400, // 24 hours
  },
});

// Pre-save hook to hash token
tokenBlacklistSchema.pre("save", async function () {
  // Token is already hashed before being passed to this model
  return;
});

module.exports = mongoose.model("TokenBlacklist", tokenBlacklistSchema);
