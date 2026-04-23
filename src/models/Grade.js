const mongoose = require("mongoose");

const gradeSchema = new mongoose.Schema(
  {
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

    // Assignment grades
    assignmentGrades: [
      {
        assignment: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Assignment",
        },
        submission: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Submission",
        },
        score: Number,
        maxScore: Number,
        percentage: Number,
        grade: String,
        weightage: Number,
        weightedScore: Number,
        submittedAt: Date,
        gradedAt: Date,
      },
    ],

    // Overall grade
    totalScore: {
      type: Number,
      default: 0,
    },
    totalMaxScore: {
      type: Number,
      default: 0,
    },
    overallPercentage: {
      type: Number,
      default: 0,
    },
    finalGrade: String,

    // Stats
    assignmentsCompleted: {
      type: Number,
      default: 0,
    },
    assignmentsTotal: {
      type: Number,
      default: 0,
    },
    averageScore: {
      type: Number,
      default: 0,
    },

    // Status
    isFinalized: {
      type: Boolean,
      default: false,
    },
    finalizedAt: Date,
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    // Metadata
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
gradeSchema.index({ student: 1, batch: 1 }, { unique: true });
gradeSchema.index({ batch: 1, overallPercentage: -1 });

// Virtual for completion percentage
gradeSchema.virtual("completionPercentage").get(function () {
  if (this.assignmentsTotal === 0) return 0;
  return (this.assignmentsCompleted / this.assignmentsTotal) * 100;
});

// Calculate overall grade
gradeSchema.methods.calculateOverallGrade = function () {
  // If no assignment grades, set defaults
  if (!this.assignmentGrades || this.assignmentGrades.length === 0) {
    this.overallPercentage = 0;
    this.finalGrade = "F";
    return;
  }

  let totalWeightedScore = 0;
  let totalWeight = 0;
  let hasWeightage = false;

  this.assignmentGrades.forEach((ag) => {
    if (ag && ag.percentage !== undefined && ag.percentage !== null) {
      if (ag.weightage && ag.weightage > 0) {
        hasWeightage = true;
        totalWeightedScore += (ag.percentage * ag.weightage) / 100;
        totalWeight += ag.weightage;
      }
    }
  });

  if (hasWeightage && totalWeight > 0) {
    this.overallPercentage = (totalWeightedScore / totalWeight) * 100;
  } else {
    // Simple average if no weightage or no valid grades
    const validGrades = this.assignmentGrades.filter(
      (ag) => ag && ag.percentage !== undefined && ag.percentage !== null,
    );

    if (validGrades.length > 0) {
      const totalPercentage = validGrades.reduce((sum, ag) => sum + ag.percentage, 0);
      this.overallPercentage = totalPercentage / validGrades.length;
    } else {
      this.overallPercentage = 0;
    }
  }

  // Round to 2 decimal places
  this.overallPercentage = Math.round(this.overallPercentage * 100) / 100;

  // Determine final grade
  if (this.overallPercentage >= 90) this.finalGrade = "A";
  else if (this.overallPercentage >= 80) this.finalGrade = "B";
  else if (this.overallPercentage >= 70) this.finalGrade = "C";
  else if (this.overallPercentage >= 60) this.finalGrade = "D";
  else this.finalGrade = "F";
};

// Update timestamp
gradeSchema.pre("save", function () {
  this.updatedAt = Date.now();
});

module.exports = mongoose.model("Grade", gradeSchema);
