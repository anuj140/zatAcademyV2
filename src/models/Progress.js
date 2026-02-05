const mongoose = require('mongoose');

const materialProgressSchema = new mongoose.Schema({
  material: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LearningMaterial',
    required: true
  },
  status: {
    type: String,
    enum: ['not_started', 'started', 'completed', 'reviewed'],
    default: 'not_started'
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  timeSpent: {
    type: Number, // in seconds
    default: 0
  },
  lastAccessed: Date,
  completedAt: Date,
  notes: String,
  quizScore: Number // if material is a quiz
});

const sessionAttendanceSchema = new mongoose.Schema({
  session: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveSession',
    required: true
  },
  status: {
    type: String,
    enum: ['absent', 'present', 'late', 'excused'],
    default: 'absent'
  },
  joinedAt: Date,
  leftAt: Date,
  duration: Number, // in minutes
  participationScore: Number // 0-100
});

const assignmentProgressSchema = new mongoose.Schema({
  assignment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Assignment',
    required: true
  },
  submission: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Submission'
  },
  status: {
    type: String,
    enum: ['not_started', 'in_progress', 'submitted', 'graded', 'late'],
    default: 'not_started'
  },
  submittedAt: Date,
  gradedAt: Date,
  score: Number,
  maxScore: Number,
  percentage: Number,
  grade: String
});

const progressSchema = new mongoose.Schema({
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
  },
  
  // Progress tracking
  materialProgress: [materialProgressSchema],
  sessionAttendance: [sessionAttendanceSchema],
  assignmentProgress: [assignmentProgressSchema],
  
  // Overall metrics
  totalMaterials: {
    type: Number,
    default: 0
  },
  completedMaterials: {
    type: Number,
    default: 0
  },
  materialCompletionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  totalSessions: {
    type: Number,
    default: 0
  },
  attendedSessions: {
    type: Number,
    default: 0
  },
  attendancePercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  totalAssignments: {
    type: Number,
    default: 0
  },
  submittedAssignments: {
    type: Number,
    default: 0
  },
  gradedAssignments: {
    type: Number,
    default: 0
  },
  assignmentCompletionPercentage: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Overall progress
  overallProgress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Time tracking
  totalTimeSpent: {
    type: Number, // in seconds
    default: 0
  },
  averageDailyTime: {
    type: Number, // in minutes
    default: 0
  },
  lastActive: Date,
  
  // Performance metrics
  averageQuizScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  averageAssignmentScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  consistencyScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  
  // Risk assessment
  isAtRisk: {
    type: Boolean,
    default: false
  },
  riskFactors: [{
    factor: String,
    severity: {
      type: String,
      enum: ['low', 'medium', 'high']
    },
    detectedAt: Date
  }],
  lastRiskAssessment: Date,
  
  // Streaks and motivation
  currentStreak: {
    type: Number,
    default: 0
  },
  longestStreak: {
    type: Number,
    default: 0
  },
  streakUpdatedAt: Date,
  
  // Goals and targets
  weeklyTarget: {
    type: Number,
    min: 0,
    max: 100,
    default: 70
  },
  isOnTrack: {
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
  },
  lastCalculated: Date
}, {
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes
progressSchema.index({ student: 1, batch: 1 }, { unique: true });
progressSchema.index({ batch: 1, overallProgress: 1 });
progressSchema.index({ isAtRisk: 1, batch: 1 });
progressSchema.index({ student: 1, lastActive: -1 });

// Virtuals
progressSchema.virtual('daysSinceLastActive').get(function() {
  if (!this.lastActive) return 999;
  const diff = Date.now() - this.lastActive.getTime();
  return Math.floor(diff / (1000 * 60 * 60 * 24));
});

progressSchema.virtual('engagementScore').get(function() {
  // Weighted average of different engagement metrics
  const weights = {
    attendance: 0.3,
    materialCompletion: 0.3,
    assignmentCompletion: 0.4
  };
  
  return (
    this.attendancePercentage * weights.attendance +
    this.materialCompletionPercentage * weights.materialCompletion +
    this.assignmentCompletionPercentage * weights.assignmentCompletion
  );
});

// Pre-save hooks
progressSchema.pre('save', async function() {
  this.updatedAt = Date.now();
  
  // Calculate percentages
  if (this.totalMaterials > 0) {
    this.materialCompletionPercentage = (this.completedMaterials / this.totalMaterials) * 100;
  }
  
  if (this.totalSessions > 0) {
    this.attendancePercentage = (this.attendedSessions / this.totalSessions) * 100;
  }
  
  if (this.totalAssignments > 0) {
    this.assignmentCompletionPercentage = (this.submittedAssignments / this.totalAssignments) * 100;
  }
  
  // Calculate overall progress (weighted average)
  const weights = {
    materials: 0.4,
    attendance: 0.2,
    assignments: 0.4
  };
  
  this.overallProgress = (
    this.materialCompletionPercentage * weights.materials +
    this.attendancePercentage * weights.attendance +
    this.assignmentCompletionPercentage * weights.assignments
  );
  
  // Update risk status
  this.updateRiskAssessment();
  
});

// Methods
progressSchema.methods.updateRiskAssessment = function() {
  const riskFactors = [];
  
  // Check attendance
  if (this.attendancePercentage < 70) {
    riskFactors.push({
      factor: 'low_attendance',
      severity: this.attendancePercentage < 50 ? 'high' : 'medium',
      detectedAt: new Date()
    });
  }
  
  // Check material completion
  if (this.materialCompletionPercentage < 60) {
    riskFactors.push({
      factor: 'low_material_completion',
      severity: this.materialCompletionPercentage < 40 ? 'high' : 'medium',
      detectedAt: new Date()
    });
  }
  
  // Check assignment submission
  if (this.assignmentCompletionPercentage < 50) {
    riskFactors.push({
      factor: 'low_assignment_submission',
      severity: this.assignmentCompletionPercentage < 30 ? 'high' : 'medium',
      detectedAt: new Date()
    });
  }
  
  // Check inactivity
  if (this.daysSinceLastActive > 7) {
    riskFactors.push({
      factor: 'inactive_for_7_days',
      severity: 'high',
      detectedAt: new Date()
    });
  }
  
  // Check if student is at risk
  this.isAtRisk = riskFactors.length > 0;
  this.riskFactors = riskFactors;
  this.lastRiskAssessment = new Date();
};

progressSchema.methods.updateStreak = function() {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const lastActiveDate = this.lastActive ? 
    new Date(this.lastActive.getFullYear(), this.lastActive.getMonth(), this.lastActive.getDate()) : 
    null;
  
  if (!lastActiveDate) {
    // First activity
    this.currentStreak = 1;
    this.longestStreak = 1;
  } else {
    const daysDifference = Math.floor((today - lastActiveDate) / (1000 * 60 * 60 * 24));
    
    if (daysDifference === 0) {
      // Same day, streak continues
      // No change needed
    } else if (daysDifference === 1) {
      // Consecutive day
      this.currentStreak += 1;
    } else if (daysDifference > 1) {
      // Streak broken
      this.currentStreak = 1;
    }
  }
  
  // Update longest streak
  if (this.currentStreak > this.longestStreak) {
    this.longestStreak = this.currentStreak;
  }
  
  this.streakUpdatedAt = now;
  this.lastActive = now;
};

// Static methods
progressSchema.statics.calculateForStudent = async function(studentId, batchId) {
  const Progress = this;
  const LearningMaterial = mongoose.model('LearningMaterial');
  const LiveSession = mongoose.model('LiveSession');
  const Assignment = mongoose.model('Assignment');
  const Submission = mongoose.model('Submission');
  
  // Get batch materials
  const materials = await LearningMaterial.find({
    batch: batchId,
    isPublished: true
  });
  
  // Get batch sessions
  const sessions = await LiveSession.find({
    batch: batchId,
    status: { $in: ['completed', 'ongoing'] }
  });
  
  // Get batch assignments
  const assignments = await Assignment.find({
    batch: batchId,
    isPublished: true
  });
  
  // Get student submissions
  const submissions = await Submission.find({
    student: studentId,
    batch: batchId
  }).populate('assignment');
  
  // Calculate progress
  const materialProgress = materials.map(material => ({
    material: material._id,
    status: 'not_started', // Would come from actual tracking
    progress: 0,
    timeSpent: 0
  }));
  
  const assignmentProgress = assignments.map(assignment => {
    const submission = submissions.find(s => s.assignment._id.equals(assignment._id));
    
    return {
      assignment: assignment._id,
      submission: submission?._id,
      status: submission ? (submission.isGraded ? 'graded' : 'submitted') : 'not_started',
      submittedAt: submission?.submittedAt,
      gradedAt: submission?.gradedAt,
      score: submission?.marksObtained,
      maxScore: assignment.maxMarks,
      percentage: submission?.percentage,
      grade: submission?.grade
    };
  });
  
  // Calculate totals
  const completedMaterials = 0; // Would come from actual tracking
  const attendedSessions = 0; // Would come from attendance tracking
  const submittedAssignments = assignmentProgress.filter(ap => ap.status !== 'not_started').length;
  const gradedAssignments = assignmentProgress.filter(ap => ap.status === 'graded').length;
  
  // Create or update progress record
  let progress = await Progress.findOne({ student: studentId, batch: batchId });
  
  if (!progress) {
    progress = new Progress({
      student: studentId,
      batch: batchId,
      course: materials[0]?.course || assignments[0]?.course,
      materialProgress,
      assignmentProgress,
      totalMaterials: materials.length,
      completedMaterials,
      totalSessions: sessions.length,
      attendedSessions,
      totalAssignments: assignments.length,
      submittedAssignments,
      gradedAssignments,
      lastCalculated: new Date()
    });
  } else {
    progress.materialProgress = materialProgress;
    progress.assignmentProgress = assignmentProgress;
    progress.totalMaterials = materials.length;
    progress.completedMaterials = completedMaterials;
    progress.totalSessions = sessions.length;
    progress.attendedSessions = attendedSessions;
    progress.totalAssignments = assignments.length;
    progress.submittedAssignments = submittedAssignments;
    progress.gradedAssignments = gradedAssignments;
    progress.lastCalculated = new Date();
  }
  
  await progress.save();
  return progress;
};

module.exports = mongoose.model('Progress', progressSchema);