const mongoose = require("mongoose");

const enrollmentSchema = new mongoose.Schema(
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
    paymentMethod: {
      type: String,
      enum: ["fullPayment", "emi"],
      required: true,
    },
    totalAmount: {
      type: Number,
      required: true,
      min: [0, "Amount cannot be negative"],
    },
    emiAmount: {
      type: Number,
      min: [0, "EMI amount cannot be negative"],
    },
    emiMonths: {
      type: Number,
      min: [0, "EMI months cannot be negative"],
    },
    enrollmentDate: {
      type: Date,
      default: Date.now,
    },
    enrollmentStatus: {
      type: String,
      enum: ["pending", "active", "completed", "cancelled", "suspended"],
      default: "pending",
    },
    paymentStatus: {
      type: String,
      enum: ["pending", "paid", "partially_paid", "overdue", "cancelled"],
      default: "pending",
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: function () {
        return this.totalAmount;
      },
    },
    nextPaymentDue: Date,
    accessRevoked: {
      type: Boolean,
      default: false,
    },
    revokedReason: String,
    enrollmentNotes: String,
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

// // Update timestamp
// enrollmentSchema.pre('findOneAndUpdate', function(next) {
//   this.set({ updatedAt: Date.now() });
//   next();
// });

// Ensure one student can't enroll in same batch multiple times
enrollmentSchema.index({ student: 1, batch: 1 }, { unique: true });

// Update remaining amount based on paid amount
enrollmentSchema.pre("save", async function () {
  this.remainingAmount = this.totalAmount - this.paidAmount;

  // Update payment status based on amounts
  if (this.paidAmount === 0) {
    this.paymentStatus = "pending";
  } else if (this.paidAmount >= this.totalAmount) {
    this.paymentStatus = "paid";
  } else if (this.paidAmount > 0) {
    this.paymentStatus = "partially_paid";
  }

  // Update enrollment status based on payment
  if (this.paymentStatus === "paid" || this.paymentStatus === "partially_paid") {
    this.enrollmentStatus = "active";
  }
});

module.exports = mongoose.model("Enrollment", enrollmentSchema);
