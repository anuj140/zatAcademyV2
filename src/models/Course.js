const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide course title"],
      trim: true,
      maxlength: [100, "Title cannot exceed 100 characters"],
    },
    description: {
      type: String,
      required: [true, "Please provide course description"],
      maxlength: [2000, "Description cannot exceed 2000 characters"],
    },
    shortDescription: {
      type: String,
      maxlength: [200, "Short description cannot exceed 200 characters"],
    },
    fee: {
      type: Number,
      required: [true, "Please provide course fee"],
      min: [0, "Fee cannot be negative"],
    },
    emiAmount: {
      type: Number,
      required: [true, "Please provide EMI amount per month"],
      min: [0, "EMI amount cannot be negative"],
    },
    duration: {
      type: Number,
      required: [true, "Please provide course duration"],
      min: [1, "Duration must be at least 1 week"],
    },
    durationUnit: {
      type: String,
      enum: ["weeks", "months"],
      default: "months",
    },
    thumbnail: {
      url: String,
      public_id: String,
    },
    isPublished: {
      type: Boolean,
      default: false,
    },
    category: {
      type: String,
      enum: ["web-dev", "data-science", "android", "ios", "devops", "design", "other"],
      default: "other",
    },
    tags: [String],
    prerequisites: [String],
    learningOutcomes: [String],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
  { timestamps: true },
);

// Update timestamp
courseSchema.pre("findOneAndUpdate", async function () {
  this.set({ updatedAt: Date.now() });
});

// Index for search
courseSchema.index({ title: "text", description: "text", tags: "text" });

module.exports = mongoose.model("Course", courseSchema);
