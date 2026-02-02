const mongoose = require('mongoose');

const sessionMaterialSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide material title'],
    trim: true,
    maxlength: [200, 'Title cannot exceed 200 characters']
  },
  description: {
    type: String,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  liveSession: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LiveSession',
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
  materialType: {
    type: String,
    enum: ['pre_session', 'post_session', 'recording', 'reference', 'assignment'],
    required: true
  },
  fileType: {
    type: String,
    enum: ['pdf', 'video', 'image', 'link', 'document', 'presentation', 'other'],
    required: true
  },
  // For file uploads
  file: {
    url: String,
    public_id: String,
    originalName: String,
    size: Number, // in bytes
    mimeType: String
  },
  // For links
  linkUrl: String,
  linkTitle: String,
  
  // Access control
  isPublic: {
    type: Boolean,
    default: true
  },
  availableFrom: {
    type: Date,
    default: Date.now
  },
  availableUntil: Date,
  
  // Stats
  downloadCount: {
    type: Number,
    default: 0
  },
  viewCount: {
    type: Number,
    default: 0
  },
  
  // Metadata
  uploadedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Indexes
sessionMaterialSchema.index({ liveSession: 1, materialType: 1 });
sessionMaterialSchema.index({ batch: 1, createdAt: -1 });
sessionMaterialSchema.index({ availableFrom: 1, availableUntil: 1 });

// Update timestamp
sessionMaterialSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

// Virtual for checking availability
sessionMaterialSchema.virtual('isAvailable').get(function() {
  const now = new Date();
  if (this.availableFrom && now < this.availableFrom) return false;
  if (this.availableUntil && now > this.availableUntil) return false;
  return true;
});

module.exports = mongoose.model('SessionMaterial', sessionMaterialSchema);