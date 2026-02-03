const mongoose = require('mongoose');

const gradeSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  batch: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Batch',
    required: true
  },
  course: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Course',
    required: true
  },
  
  // Assignment grades
  assignmentGrades: [{
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Assignment'
    },
    submission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Submission'
    },
    score: Number,
    maxScore: Number,
    percentage: Number,
    grade: String,
    weightage: Number,
    weightedScore: Number,
    submittedAt: Date,
    gradedAt: Date
  }],
  
  // Overall grade
  totalScore: {
    type: Number,
    default: 0
  },
  totalMaxScore: {
    type: Number,
    default: 0
  },
  overallPercentage: {
    type: Number,
    default: 0
  },
  finalGrade: String,
  
  // Stats
  assignmentsCompleted: {
    type: Number,
    default: 0
  },
  assignmentsTotal: {
    type: Number,
    default: 0
  },
  averageScore: {
    type: Number,
    default: 0
  },
  
  // Status
  isFinalized: {
    type: Boolean,
    default: false
  },
  finalizedAt: Date,
  finalizedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Metadata
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
gradeSchema.index({ student: 1, batch: 1 }, { unique: true });
gradeSchema.index({ batch: 1, overallPercentage: -1 });

// Virtual for completion percentage
gradeSchema.virtual('completionPercentage').get(function() {
  if (this.assignmentsTotal === 0) return 0;
  return (this.assignmentsCompleted / this.assignmentsTotal) * 100;
});

// Calculate overall grade
gradeSchema.methods.calculateOverallGrade = function() {
  let totalWeightedScore = 0;
  let totalWeight = 0;
  
  this.assignmentGrades.forEach(ag => {
    if (ag.weightage && ag.percentage) {
      totalWeightedScore += (ag.percentage * ag.weightage) / 100;
      totalWeight += ag.weightage;
    }
  });
  
  if (totalWeight > 0) {
    this.overallPercentage = (totalWeightedScore / totalWeight) * 100;
  } else {
    // Simple average if no weightage
    const totalPercentage = this.assignmentGrades.reduce((sum, ag) => sum + (ag.percentage || 0), 0);
    const count = this.assignmentGrades.filter(ag => ag.percentage).length;
    this.overallPercentage = count > 0 ? totalPercentage / count : 0;
  }
  
  // Determine final grade
  if (this.overallPercentage >= 90) this.finalGrade = 'A';
  else if (this.overallPercentage >= 80) this.finalGrade = 'B';
  else if (this.overallPercentage >= 70) this.finalGrade = 'C';
  else if (this.overallPercentage >= 60) this.finalGrade = 'D';
  else this.finalGrade = 'F';
};

// Update timestamp
gradeSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model('Grade', gradeSchema);