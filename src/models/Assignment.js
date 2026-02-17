const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Please provide assignment title"],
      trim: true,
      maxlength: [200, "Title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      required: [true, "Please provide assignment description"],
      maxlength: [5000, "Description cannot exceed 5000 characters"],
    },
    instructions: {
      type: String,
      maxlength: [10000, "Instructions cannot exceed 10000 characters"],
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
    // Organization
    week: {
      type: Number,
    },
    module: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Module",
    },
    // Grading
    maxMarks: {
      type: Number,
      required: [true, "Please provide maximum marks"],
      min: [1, "Maximum marks must be at least 1"],
      max: [1000, "Maximum marks cannot exceed 1000"],
    },
    passingMarks: {
      type: Number,
      min: [0, "Passing marks cannot be negative"],
      validate: {
        validator: function (value) {
          return value <= this.maxMarks;
        },
        message: "Passing marks cannot exceed maximum marks",
      },
    },
    weightage: {
      type: Number,
      min: [0, "Weightage cannot be negative"],
      max: [100, "Weightage cannot exceed 100"],
      default: 0,
    },

    // Submission details
    submissionType: {
      type: String,
      enum: ["text", "file", "both", "quiz", "code"],
      default: "file",
    },
    allowedFileTypes: [String],
    maxFileSize: Number, // in MB
    maxFileCount: {
      type: Number,
      min: [1, "Maximum file count must be at least 1"],
      default: 1,
    },

    // Timeline
    publishDate: {
      type: Date,
      default: Date.now,
    },
    startDate: {
      type: Date,
      default: Date.now,
    },
    deadline: {
      type: Date,
      required: [true, "Please provide assignment deadline"],
    },
    allowLateSubmission: {
      type: Boolean,
      default: false,
    },
    lateSubmissionPenalty: {
      type: Number,
      min: [0, "Penalty cannot be negative"],
      max: [100, "Penalty cannot exceed 100%"],
      default: 0,
    },
    lateSubmissionDeadline: Date,

    // Reference materials
    referenceMaterials: [
      {
        title: String,
        url: String,
        type: String,
      },
    ],

    // Grading rubric
    rubric: [
      {
        criteria: String,
        description: String,
        maxScore: Number,
        weight: Number,
      },
    ],

    // Stats
    submissionCount: {
      type: Number,
      default: 0,
    },
    gradedCount: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },

    // Status
    isPublished: {
      type: Boolean,
      default: false,
    },
    isActive: {
      type: Boolean,
      default: true,
    },

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
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

// Indexes
assignmentSchema.index({ batch: 1, deadline: 1 });
assignmentSchema.index({ course: 1, week: 1 });
assignmentSchema.index({ isPublished: 1, isActive: 1 });

// Virtuals
assignmentSchema.virtual("isOpen").get(function () {
  const now = new Date();
  return (
    this.isPublished &&
    this.isActive &&
    now >= this.startDate &&
    (now <= this.deadline ||
      (this.allowLateSubmission && now <= this.lateSubmissionDeadline))
  );
});

assignmentSchema.virtual("isOverdue").get(function () {
  const now = new Date();
  if (!this.allowLateSubmission) {
    return now > this.deadline;
  }
  return now > this.lateSubmissionDeadline;
});

assignmentSchema.virtual("status").get(function () {
  const now = new Date();
  if (!this.isPublished || !this.isActive) return "draft";
  if (now < this.startDate) return "upcoming";
  if (now <= this.deadline) return "open";
  if (this.allowLateSubmission && now <= this.lateSubmissionDeadline)
    return "late_submission";
  return "closed";
});

assignmentSchema.virtual("totalRubricWeight").get(function () {
  if (!this.rubric || this.rubric.length === 0) return 0;
  return this.rubric.reduce((sum, item) => sum + (item.weight || 0), 0);
});

// Update timestamp
assignmentSchema.pre("save", async function () {
  this.updatedAt = Date.now();
});

// Auto-calculate late submission deadline if not set
assignmentSchema.pre("save", async function () {
  if (this.allowLateSubmission && !this.lateSubmissionDeadline) {
    // Default: 7 days after deadline
    this.lateSubmissionDeadline = new Date(this.deadline);
    this.lateSubmissionDeadline.setDate(this.lateSubmissionDeadline.getDate() + 7);
  }
});

// Update batch assignment count
assignmentSchema.post("save", async function () {
  const Batch = mongoose.model("Batch");
  const assignmentCount = await mongoose.model("Assignment").countDocuments({
    batch: this.batch,
    isPublished: true,
  });

  await Batch.findByIdAndUpdate(this.batch, {
    $set: { assignmentCount },
  });

  if (this.module) {
    const Module = mongoose.model("Module");
    const module = await Module.findById(this.module);

    if (module) {
      const itemIndex = module.items.findIndex(
        (item) => item.itemId.toString() === this._id.toString(),
      );

      if (itemIndex !== -1) {
        module.items[itemIndex].title = this.title;
        module.items[itemIndex].dueDate = this.deadline;
        module.items[itemIndex].metadata = {
          originalTitle: this.title,
          maxMarks: this.maxMarks,
          isPublished: this.isPublished,
        };
        await module.save();
      }
    }
  }
});

module.exports = mongoose.model("Assignment", assignmentSchema);
