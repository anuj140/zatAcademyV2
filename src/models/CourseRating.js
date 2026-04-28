const mongoose = require("mongoose");

const courseRatingSchema = new mongoose.Schema(
  {
    // References
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student ID is required"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: [true, "Course ID is required"],
    },

    // Rating Fields (scale 1-5)
    contentQuality: {
      type: Number,
      required: [true, "Content quality rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    relevance: {
      type: Number,
      required: [true, "Relevance rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    difficultyLevel: {
      type: Number,
      required: [true, "Difficulty level rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    valueForMoney: {
      type: Number,
      required: [true, "Value for money rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    overallRating: {
      type: Number,
      required: [true, "Overall rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },

    // Feedback
    feedback: {
      type: String,
      trim: true,
      maxlength: [1000, "Feedback cannot exceed 1000 characters"],
    },

    // Suggestions for improvement
    suggestions: {
      type: String,
      trim: true,
      maxlength: [1000, "Suggestions cannot exceed 1000 characters"],
    },

    // Moderation fields
    status: {
      type: String,
      enum: ["submitted", "reviewed", "flagged", "archived"],
      default: "submitted",
    },
    adminNote: {
      type: String,
      trim: true,
      maxlength: [500, "Admin note cannot exceed 500 characters"],
    },

    // Metadata
    ratedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Compound index to prevent duplicate ratings from same student for same course
// This ensures one student can only rate a course once, regardless of batch
courseRatingSchema.index({ student: 1, course: 1 }, { unique: true });

// Index for quick lookups
courseRatingSchema.index({ course: 1 });
courseRatingSchema.index({ student: 1 });
courseRatingSchema.index({ status: 1 });
courseRatingSchema.index({ ratedAt: -1 });
courseRatingSchema.index({ course: 1, status: 1 });

module.exports = mongoose.model("CourseRating", courseRatingSchema);
