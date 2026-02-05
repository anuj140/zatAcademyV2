const mongoose = require("mongoose");

const doubtReplySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  content: {
    type: String,
    required: [true, "Reply content is required"],
    maxlength: [5000, "Reply cannot exceed 5000 characters"],
  },
  attachments: [
    {
      url: String,
      public_id: String,
      originalName: String,
      mimeType: String,
    },
  ],
  isInstructorReply: {
    type: Boolean,
    default: false,
  },
  upvotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  ],
  downvotes: [
    {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: [],
    },
  ],
  isSolution: {
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

const doubtSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Doubt title is required"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Doubt description is required"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },

    // Context
    contextType: {
      type: String,
      enum: ["batch", "lesson", "assignment", "live_session", "material", "general"],
      default: "batch",
    },
    contextId: mongoose.Schema.Types.ObjectId, // Lesson, Assignment, etc.
    contextTitle: String,

    // Categories and tags
    category: {
      type: String,
      enum: ["conceptual", "technical", "assignment", "project", "logical", "other"],
      default: "conceptual",
    },
    tags: [String],

    // Status and priority
    status: {
      type: String,
      enum: ["open", "answered", "resolved", "closed", "escalated"],
      default: "open",
    },
    priority: {
      type: String,
      enum: ["low", "medium", "high", "urgent"],
      default: "medium",
    },

    // Engagement metrics
    views: {
      type: Number,
      default: 0,
    },
    upvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    downvotes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    followers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // Replies
    replies: [doubtReplySchema],
    replyCount: {
      type: Number,
      default: 0,
    },
    instructorReplyCount: {
      type: Number,
      default: 0,
    },

    // Resolution
    resolvedAt: Date,
    resolvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    solutionReply: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "doubtReplySchema",
    },

    // Time tracking
    firstReplyTime: Date, // Time when first reply was posted
    resolutionTime: Date, // Time when marked as resolved
    timeToFirstReply: Number, // in minutes
    timeToResolution: Number, // in minutes

    // Metadata
    attachments: [
      {
        url: String,
        public_id: String,
        originalName: String,
        mimeType: String,
      },
    ],
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    isPinned: {
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
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes for performance
doubtSchema.index({ batch: 1, status: 1, createdAt: -1 });
doubtSchema.index({ student: 1, createdAt: -1 });
doubtSchema.index({ course: 1, category: 1 });
doubtSchema.index({ status: 1, priority: 1 });
doubtSchema.index({ title: "text", description: "text", tags: "text" });

// Virtuals
doubtSchema.virtual("isActive").get(function () {
  return ["open", "answered"].includes(this.status);
});

doubtSchema.virtual("upvoteCount").get(function () {
  return this.upvotes.length;
});

doubtSchema.virtual("followerCount").get(function () {
  return this.followers.length;
});

doubtSchema.virtual("hasInstructorReply").get(function () {
  return this.instructorReplyCount > 0;
});

// Update timestamps and counters
doubtSchema.pre("save", async function () {
  this.updatedAt = Date.now();

  // Update reply counts
  this.replyCount = this.replies.length;
  this.instructorReplyCount = this.replies.filter((r) => r.isInstructorReply).length;

  // Auto-calculate priority based on time
  if (this.status === "open") {
    const hoursOpen = (Date.now() - this.createdAt) / (1000 * 60 * 60);
    if (hoursOpen > 48) {
      this.priority = "urgent";
    } else if (hoursOpen > 24) {
      this.priority = "high";
    } else if (hoursOpen > 12) {
      this.priority = "medium";
    }
  }

  // Calculate time metrics
  if (this.replies.length > 0 && !this.firstReplyTime) {
    const firstReply = this.replies.reduce(
      (earliest, reply) => (reply.createdAt < earliest ? reply.createdAt : earliest),
      this.replies[0].createdAt,
    );
    this.firstReplyTime = firstReply;
    this.timeToFirstReply = (firstReply - this.createdAt) / (1000 * 60); // minutes
  }

  if (this.status === "resolved" && !this.resolutionTime) {
    this.resolutionTime = new Date();
    this.timeToResolution = (this.resolutionTime - this.createdAt) / (1000 * 60); // minutes
  }
});

// Update batch doubt count
doubtSchema.post("save", async function () {
  const Batch = mongoose.model("Batch");
  const doubtCount = await mongoose.model("Doubt").countDocuments({
    batch: this.batch,
    status: { $in: ["open", "answered"] },
  });

  await Batch.findByIdAndUpdate(this.batch, {
    $set: { activeDoubtCount: doubtCount },
  });
});

// Auto-close old doubts (via scheduled job)
doubtSchema.statics.autoCloseOldDoubts = async function (days = 30) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - days);

  return this.updateMany(
    {
      status: { $in: ["answered"] },
      updatedAt: { $lt: cutoffDate },
      resolvedAt: { $exists: false },
    },
    {
      $set: { status: "closed" },
    },
  );
};

module.exports = mongoose.model("Doubt", doubtSchema);
