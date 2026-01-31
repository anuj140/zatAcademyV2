const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  enrollment: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Enrollment',
    required: true
  },
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
  amount: {
    type: Number,
    required: true,
    min: [0, 'Amount cannot be negative']
  },
  paymentType: {
    type: String,
    enum: ['full', 'emi', 'refund', 'late_fee'],
    required: true
  },
  paymentMethod: {
    type: String,
    enum: ['razorpay', 'stripe', 'bank_transfer', 'cash', 'other'],
    default: 'razorpay'
  },
  emiNumber: {
    type: Number,
    min: [1, 'EMI number must be at least 1']
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending'
  },
  razorpayOrderId: String,
  razorpayPaymentId: String,
  razorpaySignature: String,
  paymentDate: {
    type: Date,
    default: Date.now
  },
  dueDate: Date,
  lateFeeApplied: {
    type: Number,
    default: 0
  },
  notes: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Update timestamp
paymentSchema.pre('findOneAndUpdate', function(next) {
  this.set({ updatedAt: Date.now() });
  next();
});

module.exports = mongoose.model('Payment', paymentSchema);