const mongoose = require("mongoose");

const instructorRatingSchema = new mongoose.Schema(
  {
    // References
    instructor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Instructor ID is required"],
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: [true, "Student ID is required"],
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: [true, "Batch ID is required"],
    },

    // Rating Fields (scale 1-5)
    communicationSkills: {
      type: Number,
      required: [true, "Communication skills rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    subjectKnowledge: {
      type: Number,
      required: [true, "Subject knowledge rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    teachingMethodology: {
      type: Number,
      required: [true, "Teaching methodology rating is required"],
      min: [1, "Rating must be at least 1"],
      max: [5, "Rating cannot exceed 5"],
    },
    responseToQuestions: {
      type: Number,
      required: [true, "Response to questions rating is required"],
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

    // Approval status
    isAnonymous: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["submitted", "reviewed", "archived"],
      default: "submitted",
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

// Compound index to prevent duplicate ratings from same student for same instructor in same batch
instructorRatingSchema.index({ instructor: 1, student: 1, batch: 1 }, { unique: true });

// Index for quick lookups
instructorRatingSchema.index({ instructor: 1 });
instructorRatingSchema.index({ student: 1 });
instructorRatingSchema.index({ batch: 1 });
instructorRatingSchema.index({ ratedAt: -1 });

module.exports = mongoose.model("InstructorRating", instructorRatingSchema);
