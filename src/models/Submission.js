const mongoose = require('mongoose');

const submissionFileSchema = new mongoose.Schema({
  url: String,
  public_id: String,
  originalName: String,
  size: Number,
  mimeType: String,
  uploadedAt: {
    type: Date,
    default: Date.now
  }
});

const submissionSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
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
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Submission content
  textContent: String,
  files: [submissionFileSchema],
  githubRepo: String,
  deploymentUrl: String,
  notes: String,
  
  // Submission details
  submittedAt: {
    type: Date,
    default: Date.now
  },
  submissionType: {
    type: String,
    enum: ['text', 'file', 'both', 'github', 'deployed'],
    default: 'file'
  },
  version: {
    type: Number,
    default: 1
  },
  isLate: {
    type: Boolean,
    default: false
  },
  lateByDays: Number,
  latePenaltyApplied: {
    type: Number,
    default: 0
  },
  
  // Grading
  isGraded: {
    type: Boolean,
    default: false
  },
  gradedAt: Date,
  gradedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  score: {
    type: Number,
    min: [0, 'Score cannot be negative'],
    max: function() {
      return this.assignment ? this.assignment.maxMarks : 100;
    }
  },
  marksObtained: {
    type: Number,
    min: [0, 'Marks cannot be negative']
  },
  percentage: {
    type: Number,
    min: [0, 'Percentage cannot be negative'],
    max: [100, 'Percentage cannot exceed 100']
  },
  grade: String,
  feedback: String,
  rubricScores: [{
    criteria: String,
    score: Number,
    feedback: String
  }],
  
  // Status
  status: {
    type: String,
    enum: ['draft', 'submitted', 'under_review', 'graded', 'needs_revision', 'resubmitted'],
    default: 'draft'
  },
  
  // Resubmission
  resubmissionCount: {
    type: Number,
    default: 0
  },
  previousSubmission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission'
  },
  
  // Plagiarism check
  plagiarismScore: Number,
  plagiarismReport: String,
  isOriginal: {
    type: Boolean,
    default: true
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

// Indexes - Ensure one submission per student per assignment
submissionSchema.index({ assignment: 1, student: 1 }, { unique: true });
submissionSchema.index({ batch: 1, submittedAt: -1 });
submissionSchema.index({ student: 1, status: 1 });

// Virtuals
submissionSchema.virtual('hasPassed').get(function() {
  if (!this.isGraded || !this.assignment) return false;
  return this.marksObtained >= this.assignment.passingMarks;
});

submissionSchema.virtual('finalMarks').get(function() {
  let marks = this.marksObtained || 0;
  if (this.isLate && this.latePenaltyApplied) {
    marks = marks * (1 - this.latePenaltyApplied / 100);
  }
  return Math.max(0, Math.round(marks));
});

// Calculate if submission is late
submissionSchema.pre('save', function(next) {
  if (this.isNew && this.submittedAt) {
    const Assignment = mongoose.model('Assignment');
    Assignment.findById(this.assignment).then(assignment => {
      if (assignment && this.submittedAt > assignment.deadline) {
        this.isLate = true;
        
        // Calculate days late
        const lateByMs = this.submittedAt - assignment.deadline;
        this.lateByDays = Math.ceil(lateByMs / (1000 * 60 * 60 * 24));
        
        // Apply late penalty if configured
        if (assignment.allowLateSubmission && assignment.lateSubmissionPenalty) {
          this.latePenaltyApplied = assignment.lateSubmissionPenalty;
        }
      }
      next();
    }).catch(next);
  } else {
    next();
  }
});

// Update timestamp
submissionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Update assignment submission count
submissionSchema.post('save', async function() {
  if (this.status === 'submitted' || this.status === 'graded') {
    const Assignment = mongoose.model('Assignment');
    const submissionCount = await mongoose.model('Submission').countDocuments({
      assignment: this.assignment,
      status: { $in: ['submitted', 'graded'] }
    });
    
    await Assignment.findByIdAndUpdate(this.assignment, {
      $set: { submissionCount }
    });
  }
});

// Calculate percentage and grade
submissionSchema.methods.calculateGrade = function(assignment) {
  if (!assignment) return;
  
  this.percentage = (this.marksObtained / assignment.maxMarks) * 100;
  
  // Simple grading scale (can be customized)
  if (this.percentage >= 90) this.grade = 'A';
  else if (this.percentage >= 80) this.grade = 'B';
  else if (this.percentage >= 70) this.grade = 'C';
  else if (this.percentage >= 60) this.grade = 'D';
  else this.grade = 'F';
};

module.exports = mongoose.model('Submission', submissionSchema);