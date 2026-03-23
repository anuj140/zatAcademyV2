const mongoose = require("mongoose");

// Retention (in days) per broadcast type
const RETENTION_DAYS = {
  reminder: 3,
  alert: 7,
  general: 14,
  announcement: 60,
};

const notificationSchema = new mongoose.Schema(
  {
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    broadcast: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Broadcast",
      required: true,
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    readAt: {
      type: Date,
      default: null,
    },
    // MongoDB TTL index lives on this field.
    // Set at creation time based on broadcast type.
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  { timestamps: true }
);

// TTL index — MongoDB automatically deletes the document when expiresAt is reached
notificationSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Compound indexes for efficient queries
notificationSchema.index({ recipient: 1, createdAt: -1 });
notificationSchema.index({ recipient: 1, isRead: 1 });
notificationSchema.index({ broadcast: 1 });

/**
 * Static helper — compute expiresAt from a broadcast type.
 * Exported so the controller can use it without instantiating a doc.
 */
notificationSchema.statics.computeExpiresAt = function (broadcastType) {
  const days = RETENTION_DAYS[broadcastType] ?? RETENTION_DAYS.general;
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
};

module.exports = mongoose.model("Notification", notificationSchema);
