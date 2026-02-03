const mongoose = require('mongoose');

const learningMaterialSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide material title'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    maxlength: [1000, 'Description cannot exceed 1000 characters']
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
  // Organization by week/module
  week: {
    type: Number,
    required: true,
    min: [1, 'Week must be at least 1']
  },
  module: {
    type: String,
    trim: true
  },
  moduleOrder: {
    type: Number,
    default: 0
  },
  materialType: {
    type: String,
    enum: ['video', 'pdf', 'article', 'quiz', 'assignment', 'code', 'presentation', 'other'],
    required: true
  },
  contentType: {
    type: String,
    enum: ['lesson', 'reference', 'exercise', 'project', 'assessment'],
    default: 'lesson'
  },
  // For file uploads
  file: {
    url: String,
    public_id: String,
    originalName: String,
    size: Number,
    mimeType: String,
    duration: Number // for videos in seconds
  },
  // For external links
  externalUrl: String,
  externalProvider: String, // youtube, vimeo, etc
  
  // For quizzes
  quizQuestions: [{
    question: String,
    options: [String],
    correctAnswer: String,
    points: Number
  }],
  
  // Content details
  estimatedTime: Number, // in minutes
  difficulty: {
    type: String,
    enum: ['beginner', 'intermediate', 'advanced'],
    default: 'beginner'
  },
  
  // Access control
  isPublished: {
    type: Boolean,
    default: false
  },
  publishDate: {
    type: Date,
    default: Date.now
  },
  availableFrom: Date,
  availableUntil: Date,
  prerequisites: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LearningMaterial'
  }],
  
  // Progress tracking
  completionRequired: {
    type: Boolean,
    default: true
  },
  minScore: {
    type: Number,
    min: [0, 'Minimum score cannot be negative'],
    max: [100, 'Maximum score is 100']
  },
  
  // Stats
  viewCount: {
    type: Number,
    default: 0
  },
  completionCount: {
    type: Number,
    default: 0
  },
  averageTimeSpent: {
    type: Number,
    default: 0
  },
  
  // Metadata
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
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
learningMaterialSchema.index({ batch: 1, week: 1, moduleOrder: 1 });
learningMaterialSchema.index({ course: 1, materialType: 1 });
learningMaterialSchema.index({ isPublished: 1, availableFrom: 1 });

// Virtual for checking availability
learningMaterialSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  if (!this.isPublished) return false;
  if (this.availableFrom && now < this.availableFrom) return false;
  if (this.availableUntil && now > this.availableUntil) return false;
  return true;
});

// Virtual for total quiz points
learningMaterialSchema.virtual('totalPoints').get(function() {
  if (this.materialType !== 'quiz') return 0;
  return this.quizQuestions.reduce((sum, question) => sum + (question.points || 1), 0);
});

// Update timestamp
learningMaterialSchema.pre('save', async function() {
  this.updatedAt = Date.now();
});

// Update related batch's material count
learningMaterialSchema.post('save', async function() {
  const Batch = mongoose.model('Batch');
  const materialCount = await mongoose.model('LearningMaterial').countDocuments({
    batch: this.batch,
    isPublished: true
  });
  
  await Batch.findByIdAndUpdate(this.batch, {
    $set: { materialCount }
  });
});

// Update related batch's material count on delete
learningMaterialSchema.post('findOneAndDelete', async function(doc) {
  if (doc) {
    const Batch = mongoose.model('Batch');
    const materialCount = await mongoose.model('LearningMaterial').countDocuments({
      batch: doc.batch,
      isPublished: true
    });
    
    await Batch.findByIdAndUpdate(doc.batch, {
      $set: { materialCount }
    });
  }
});

module.exports = mongoose.model('LearningMaterial', learningMaterialSchema);