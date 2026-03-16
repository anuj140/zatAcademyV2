const mongoose = require('mongoose');

const emailTemplateSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: [true, 'Template slug is required'],
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^[a-z0-9_]+$/, 'Slug can only contain lowercase letters, numbers, and underscores'],
    },
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: [100, 'Name cannot exceed 100 characters'],
    },
    subject: {
      type: String,
      required: [true, 'Email subject is required'],
      trim: true,
      maxlength: [255, 'Subject cannot exceed 255 characters'],
    },
    htmlBody: {
      type: String,
      required: [true, 'HTML body is required'],
    },
    // Documents the supported {{variable}} placeholders for this template
    variables: {
      type: [String],
      default: [],
    },
    category: {
      type: String,
      enum: ['enrollment', 'payment', 'auth', 'grade', 'assignment', 'doubt', 'session', 'other'],
      required: [true, 'Category is required'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // Audit trail
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
  },
  { timestamps: true }
);

// Index for fast slug lookup
emailTemplateSchema.index({ slug: 1 });
emailTemplateSchema.index({ category: 1 });

module.exports = mongoose.model('EmailTemplate', emailTemplateSchema);
