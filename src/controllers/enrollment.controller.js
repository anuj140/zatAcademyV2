const Enrollment = require("../models/Enrollment");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const Payment = require("../models/Payment");
const paymentService = require("../utils/paymentService");
const { sendEmail } = require("../utils/emailService");

// @desc    Enroll in a batch
// @route   POST /api/v1/enrollments
// @access  Private/Student
exports.enrollInBatch = async (req, res) => {
  try {
    const { batchId, paymentMethod } = req.body;

    // Check if user is a student
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can enroll in batches",
      });
    }

    // Get batch details
    const batch = await Batch.findById(batchId).populate("course");

    if (!batch || !batch.isActive) {
      return res.status(404).json({
        success: false,
        message: "Batch not found or not active",
      });
    }

    if (batch.isFull) {
      return res.status(400).json({
        success: false,
        message: "Batch is already full",
      });
    }

    if (batch.startDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Batch has already started",
      });
    }

    // Check if already enrolled
    const existingEnrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: batchId,
    });

    if (existingEnrollment) {
      return res.status(400).json({
        success: false,
        message: "Already enrolled in this batch",
      });
    }

    // Get course fee details
    const course = batch.course;
    const totalAmount = course.fee;
    let emiAmount = course.emiAmount;
    let emiMonths = Math.ceil(totalAmount / emiAmount);

    // Calculate first payment
    let firstPaymentAmount;
    if (paymentMethod === "fullPayment") {
      firstPaymentAmount = totalAmount;
      emiAmount = totalAmount;
      emiMonths = 1;
    } else if (paymentMethod === "emi") {
      firstPaymentAmount = emiAmount;
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid payment method",
      });
    }

    // Create enrollment
    //! Hide 'nextPaymentDue' if no payment is done
    const enrollment = await Enrollment.create({
      student: req.user.id,
      batch: batchId,
      course: course._id,
      paymentMethod,
      totalAmount,
      emiAmount,
      emiMonths,
      enrollmentStatus: "pending",
      paymentStatus: "pending",
      paidAmount: 0,
      nextPaymentDue:
        paymentMethod === "emi" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null, // 30 days from now
    });

    // Create payment order
    const order = await paymentService.createOrder(
      firstPaymentAmount,
      "INR",
      `enrollment_${enrollment._id}`,
    );

    // Create payment record
    const payment = await Payment.create({
      enrollment: enrollment._id,
      student: req.user.id,
      batch: batchId,
      course: course._id,
      amount: firstPaymentAmount,
      paymentType: paymentMethod === "fullPayment" ? "full" : "emi",
      emiNumber: 1,
      status: "pending",
      razorpayOrderId: order.id,
      dueDate: new Date(),
    });

    // Send enrollment confirmation email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Enrollment Confirmation</h2>
        <p>Hello ${req.user.name},</p>
        <p>Your enrollment in <strong>${course.title}</strong> batch <strong>${batch.name}</strong> has been initiated.</p>
        <p><strong>Payment Details:</strong></p>
        <ul>
          <li>Total Amount: ₹${totalAmount}</li>
          <li>Payment Method: ${paymentMethod}</li>
          <li>First Payment Due: ₹${firstPaymentAmount}</li>
        </ul>
        <p>Please complete your payment to activate your enrollment.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
      </div>
    `;

    await sendEmail({
      email: req.user.email,
      subject: "Enrollment Confirmation - AlmaBetter Clone",
      html: emailHtml,
    });

    res.status(201).json({
      success: true,
      message: "Enrollment created successfully. Please complete payment.",
      data: {
        enrollment,
        payment: {
          orderId: order.id,
          amount: firstPaymentAmount,
          currency: "INR",
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Process payment callback (stub)
// @route   POST /api/v1/enrollments/payment-callback
// @access  Public (called by payment gateway)
exports.paymentCallback = async (req, res) => {
  try {
    // In Phase 1, this is a stub. Will be implemented with webhooks in Phase 5
    const { orderId, paymentId, signature, status } = req.body;

    // Verify payment
    const paymentVerification = await paymentService.verifyPayment(
      orderId,
      paymentId,
      signature,
    );

    if (!paymentVerification.success) {
      return res.status(400).json({
        success: false,
        message: "Payment verification failed",
      });
    }

    // Find payment record
    const payment = await Payment.findOne({ razorpayOrderId: orderId });

    if (!payment) {
      return res.status(404).json({
        success: false,
        message: "Payment record not found",
      });
    }

    // Update payment status
    payment.status = status === "captured" ? "completed" : "failed";
    payment.razorpayPaymentId = paymentId;
    payment.razorpaySignature = signature;
    payment.paymentDate = new Date();
    await payment.save();

    // Update enrollment
    const enrollment = await Enrollment.findById(payment.enrollment);

    if (payment.status === "completed") {
      enrollment.paidAmount += payment.amount;
      enrollment.paymentStatus =
        enrollment.paidAmount >= enrollment.totalAmount ? "paid" : "partially_paid";
      enrollment.enrollmentStatus = "active";

      // Update batch student count
      const batch = await Batch.findById(enrollment.batch);
      batch.currentStudents += 1;
      await batch.save();

      // Send success email
      const course = await Course.findById(enrollment.course);
      const emailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">Payment Successful!</h2>
          <p>Hello ${req.user.name},</p>
          <p>Your payment of ₹${payment.amount} for <strong>${course.title}</strong> has been completed successfully.</p>
          <p>Your enrollment is now active. You can access the course materials from your dashboard.</p>
          <a href="${process.env.FRONTEND_URL}/dashboard" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
            Go to Dashboard
          </a>
          <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
        </div>
      `;

      await sendEmail({
        email: req.user.email,
        subject: "Payment Successful - AlmaBetter Clone",
        html: emailHtml,
      });
    }

    await enrollment.save();

    res.status(200).json({
      success: true,
      message: "Payment processed successfully",
      data: {
        payment,
        enrollment,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get student enrollments
// @route   GET /api/v1/enrollments/my-enrollments
// @access  Private/Student
exports.getMyEnrollments = async (req, res) => {
  try {
    const enrollments = await Enrollment.find({ student: req.user.id })
      .populate("batch", "name startDate endDate schedule")
      .populate("course", "title description thumbnail")
      .sort("-enrollmentDate");

    //! Hide 'nextPaymentDue' if no payment is done
    res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get batch enrollments (for admin/instructor)
// @route   GET /api/v1/batches/:batchId/enrollments
// @access  Private/Admin/Instructor
exports.getBatchEnrollments = async (req, res) => {
  try {
    // Check if user has access to this batch
    const batch = await Batch.findById(req.params.batchId);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Authorization
    if (req.user.role === "instructor" && batch.instructor.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view enrollments for this batch",
      });
    }

    const enrollments = await Enrollment.find({ batch: req.params.batchId })
      .populate("student", "name email")
      .populate("course", "title")
      .sort("-enrollmentDate");

    res.status(200).json({
      success: true,
      count: enrollments.length,
      data: {
        batch,
        enrollments,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get enrollment details
// @route   GET /api/v1/enrollments/:id
// @access  Private (student own enrollment, admin all)
exports.getEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id)
      .populate("batch", "name startDate endDate schedule instructor")
      .populate("course", "title description thumbnail fee emiAmount")
      .populate("student", "name email");

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found",
      });
    }

    // Authorization
    if (
      req.user.role === "student" &&
      enrollment.student._id.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this enrollment",
      });
    }

    // Get payment history
    const payments = await Payment.find({ enrollment: enrollment._id }).sort(
      "paymentDate",
    );

    res.status(200).json({
      success: true,
      data: {
        enrollment,
        payments,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Cancel enrollment
// @route   PUT /api/v1/enrollments/:id/cancel
// @access  Private/Student
exports.cancelEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);

    if (!enrollment) {
      return res.status(404).json({
        success: false,
        message: "Enrollment not found",
      });
    }

    // Check authorization
    if (
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin" &&
      enrollment.student.toString() !== req.user.id
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this enrollment",
      });
    }

    // Check if batch has started
    const batch = await Batch.findById(enrollment.batch);
    if (batch.startDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel enrollment after batch has started",
      });
    }

    enrollment.enrollmentStatus = "cancelled";
    enrollment.paymentStatus = "cancelled";
    await enrollment.save();

    // Update batch student count
    batch.currentStudents = Math.max(0, batch.currentStudents - 1);
    await batch.save();

    res.status(200).json({
      success: true,
      message: "Enrollment cancelled successfully",
      data: enrollment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
