const mongoose = require("mongoose");

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide module title"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Module must be associated with a course"],
    },
    // Module sequencing
    sequence: {
      type: Number,
      required: [true, "Please provide module sequence"],
      min: [1, "Sequence must be at least 1"],
    },
    // Duration details
    estimatedDuration: {
      type: Number,
      default: 0, // in minutes
    },
    durationUnit: {
      type: String,
      enum: ["minutes", "hours"],
      default: "hours",
    },
    // Status tracking
    status: {
      type: String,
      enum: ["draft", "published", "archived"],
      default: "draft",
    },
    // Scheduled dates for live lectures in this module
    startDate: {
      type: Date,
      required: [true, "Please provide module start date"],
    },
    endDate: {
      type: Date,
      required: [true, "Please provide module end date"],
      validate: {
        validator: function (value) {
          return value > this.startDate;
        },
        message: "End date must be after start date",
      },
    },
    // Learning objectives
    learningObjectives: [
      {
        type: String,
        maxlength: [500, "Learning objective cannot exceed 500 characters"],
      },
    ],
    // Content references (these are populated with actual content)
    liveSessions: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LiveSession",
      },
    ],
    learningMaterials: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "LearningMaterial",
      },
    ],
    assignments: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Assignment",
      },
    ],
    // Content counts
    contentCount: {
      liveSessions: {
        type: Number,
        default: 0,
      },
      learningMaterials: {
        type: Number,
        default: 0,
      },
      assignments: {
        type: Number,
        default: 0,
      },
    },
    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedAt: Date,
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true },
);

// Update timestamp
moduleSchema.pre("findOneAndUpdate", async function () {
  this.set({ updatedAt: Date.now() });
});

// Ensure sequence is unique per course
moduleSchema.index({ course: 1, sequence: 1 }, { unique: true });

// Index for search
moduleSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Module", moduleSchema);
