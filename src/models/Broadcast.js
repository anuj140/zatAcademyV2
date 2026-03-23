const mongoose = require("mongoose");

const broadcastSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Broadcast title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    message: {
      type: String,
      required: [true, "Broadcast message is required"],
      trim: true,
      maxlength: [2000, "Message cannot exceed 2000 characters"],
    },
    // Type determines how urgent/important the broadcast is
    // Also drives notification retention period via TTL
    type: {
      type: String,
      enum: ["general", "announcement", "alert", "reminder"],
      default: "general",
    },
    // Who receives this broadcast
    targetAudience: {
      type: String,
      enum: ["all", "students", "instructors", "admins", "batch", "custom"],
      default: "all",
    },
    // Only used when targetAudience === "batch"
    targetBatch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    // [NEW] Dynamic filters for "custom" audience
    // Example: { paymentMethod: "emi" }, or { course: "<id>" }
    targetFilters: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for efficient querying
broadcastSchema.index({ createdBy: 1, createdAt: -1 });
broadcastSchema.index({ targetAudience: 1, isActive: 1 });
broadcastSchema.index({ targetBatch: 1, isActive: 1 });

module.exports = mongoose.model("Broadcast", broadcastSchema);
