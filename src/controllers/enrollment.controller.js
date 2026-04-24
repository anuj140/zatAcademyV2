const crypto = require("crypto");
const Enrollment = require("../models/Enrollment");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const Payment = require("../models/Payment");
const User = require("../models/User");
const StudentProfile = require("../models/StudentProfile");
const paymentService = require("../utils/paymentService");
const { sendEmail } = require("../utils/emailService");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Build a payment-success HTML email body
 */
function buildPaymentSuccessEmail({
  userName,
  courseTitle,
  amount,
  paidAmount,
  totalAmount,
  dashboardUrl,
}) {
  const isFullyPaid = paidAmount >= totalAmount;
  return `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Payment Successful! 🎉</h2>
      <p>Hello ${userName},</p>
      <p>Your payment of <strong>₹${amount}</strong> for <strong>${courseTitle}</strong> has been processed successfully.</p>
      ${
        isFullyPaid
          ? `<p>Your course fee is now <strong>fully paid</strong>. Enjoy your learning journey!</p>`
          : `<p>Total paid so far: <strong>₹${paidAmount} / ₹${totalAmount}</strong>. Your next EMI will be due in 30 days.</p>`
      }
      <a href="${dashboardUrl}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
        Go to Dashboard
      </a>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
    </div>
  `;
}

// ─── Controllers ──────────────────────────────────────────────────────────────

// @desc    Get available batches for a course (for enrollment form)
// @route   GET /api/v1/enrollments/batches/course/:courseId
// @access  Private/Student
exports.getAvailableBatchesForEnrollment = async (req, res) => {
  try {
    const { courseId } = req.params;

    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({ success: false, message: "Course not found" });
    }

    const batches = await Batch.find({
      course: courseId,
      isActive: true,
      isFull: false,
      startDate: { $gt: new Date() },
    })
      .populate("instructor", "name email")
      .select(
        "name startDate endDate schedule maxStudents currentStudents isActive isFull instructor",
      )
      .sort("startDate");

    const studentEnrollments = await Enrollment.find({
      student: req.user.id,
      course: courseId,
    }).select("batch");

    const enrolledBatchIds = studentEnrollments.map((e) => e.batch.toString());

    const formattedBatches = batches.map((batch) => ({
      id: batch._id,
      name: batch.name,
      startDate: batch.startDate,
      endDate: batch.endDate,
      schedule: batch.schedule,
      instructor: batch.instructor,
      maxStudents: batch.maxStudents,
      currentStudents: batch.currentStudents,
      availableSeats: batch.maxStudents - batch.currentStudents,
      isEnrolled: enrolledBatchIds.includes(batch._id.toString()),
    }));

    res.status(200).json({
      success: true,
      count: formattedBatches.length,
      data: {
        course: {
          id: course._id,
          title: course.title,
          description: course.description,
          fee: course.fee,
          emiAmount: course.emiAmount,
          thumbnail: course.thumbnail,
        },
        batches: formattedBatches,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Enroll in a batch and create Razorpay order for first payment
// @route   POST /api/v1/enrollments
// @access  Private/Student
exports.enrollInBatch = async (req, res) => {
  try {
    const { batchId, paymentMethod } = req.body;

    if (req.user.role !== "student") {
      return res
        .status(403)
        .json({ success: false, message: "Only students can enroll in batches" });
    }

    // KYC: student profile must exist
    const studentProfile = await StudentProfile.findOne({ student: req.user.id });
    if (!studentProfile) {
      return res.status(400).json({
        success: false,
        message: "Please complete your profile before enrolling in a batch",
        requiresProfileCompletion: true,
        redirectTo: "/profiles/create",
      });
    }

    const batch = await Batch.findById(batchId).populate("course");
    if (!batch || !batch.isActive) {
      return res
        .status(404)
        .json({ success: false, message: "Batch not found or not active" });
    }
    
    if (!batch.course) {
      return res
        .status(500)
        .json({ success: false, message: "Batch course reference not found" });
    }
    
    if (batch.isFull) {
      return res.status(400).json({ success: false, message: "Batch is already full" });
    }
    if (batch.startDate <= new Date()) {
      return res
        .status(400)
        .json({ success: false, message: "Batch has already started" });
    }

    // Prevent duplicate enrollment — but allow retry if prior enrollment never had a successful payment
    const existingEnrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: batchId,
    });
    if (existingEnrollment) {
      const isRecoverable =
        existingEnrollment.enrollmentStatus === "pending" ||
        existingEnrollment.enrollmentStatus === "failed";

      if (!isRecoverable) {
        // Already active, completed, suspended, or cancelled by admin — deny
        return res
          .status(400)
          .json({ success: false, message: "Already enrolled in this batch" });
      }

      // Check if any payment for this enrollment actually succeeded
      const successfulPayment = await Payment.findOne({
        enrollment: existingEnrollment._id,
        status: "completed",
      });

      if (successfulPayment) {
        // A payment did go through — the enrollment should have activated; deny re-enrollment
        return res
          .status(400)
          .json({ success: false, message: "Already enrolled in this batch" });
      }

      // Payment never completed — clean up the stale enrollment and its pending payments so the student can retry
      await Payment.deleteMany({ enrollment: existingEnrollment._id });
      await existingEnrollment.deleteOne();
    }

    const course = batch.course;
    const totalAmount = course.fee;
    let emiAmount = course.emiAmount;
    let emiMonths = Math.ceil(totalAmount / emiAmount);

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
        message: "Invalid payment method. Use 'fullPayment' or 'emi'",
      });
    }

    // Create enrollment in pending state
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
        paymentMethod === "emi" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) : null,
    });

    // Create Razorpay order
    const order = await paymentService.createOrder(
      firstPaymentAmount,
      "INR",
      `enrollment_${enrollment._id}`,
    );

    // Record the pending payment
    await Payment.create({
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

    // Send enrollment initiation email (non-blocking)
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Enrollment Initiated</h2>
        <p>Hello ${req.user.name},</p>
        <p>Your enrollment in <strong>${course.title}</strong> — batch <strong>${batch.name}</strong> has been initiated.</p>
        <p><strong>Payment Details:</strong></p>
        <ul>
          <li>Total Amount: ₹${totalAmount}</li>
          <li>Payment Method: ${paymentMethod === "fullPayment" ? "Full Payment" : "EMI"}</li>
          <li>First Payment Due: ₹${firstPaymentAmount}</li>
        </ul>
        <p>Please complete your payment to activate your enrollment.</p>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
      </div>
    `;
    sendEmail({
      email: req.user.email,
      subject: "Enrollment Initiated - ZatAcademy",
      html: emailHtml,
    }).catch((err) =>
      console.error("[Email] Failed to send enrollment email:", err.message),
    );

    res.status(201).json({
      success: true,
      message: "Enrollment created. Please complete payment via Razorpay.",
      data: {
        enrollment: {
          id: enrollment._id,
          enrollmentStatus: enrollment.enrollmentStatus,
          paymentMethod: enrollment.paymentMethod,
          totalAmount,
          emiAmount,
          emiMonths,
          nextPaymentDue: enrollment.nextPaymentDue,
        },
        razorpay: {
          orderId: order.id,
          amount: order.amount, // In paise
          amountInINR: firstPaymentAmount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
      },
    });
  } catch (error) {
    console.error("[enrollInBatch]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Verify Razorpay payment after frontend checkout completes
// @route   POST /api/v1/enrollments/payment-callback
// @access  Private/Student (called by frontend after Razorpay checkout)
exports.paymentCallback = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message:
          "Missing Razorpay payment fields: razorpay_order_id, razorpay_payment_id, razorpay_signature",
      });
    }

    // Verify signature
    const verification = paymentService.verifyPayment(
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
    );

    if (!verification.success) {
      return res
        .status(400)
        .json({ success: false, message: "Payment signature verification failed" });
    }

    // Find the pending payment record
    const payment = await Payment.findOne({ razorpayOrderId: razorpay_order_id });
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment record not found" });
    }

    // Idempotency: skip if already processed
    if (payment.status === "completed") {
      return res
        .status(200)
        .json({ success: true, message: "Payment already processed" });
    }

    // Update payment
    payment.status = "completed";
    payment.razorpayPaymentId = razorpay_payment_id;
    payment.razorpaySignature = razorpay_signature;
    payment.paymentDate = new Date();
    await payment.save();

    // Update enrollment
    const enrollment = await Enrollment.findById(payment.enrollment);
    const wasAlreadyActive = enrollment.enrollmentStatus === "active";

    enrollment.paidAmount += payment.amount;
    // Update next EMI due date if still partially paid
    if (enrollment.paidAmount < enrollment.totalAmount) {
      enrollment.nextPaymentDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    } else {
      enrollment.nextPaymentDue = null;
    }
    await enrollment.save(); // pre-save hook updates paymentStatus & enrollmentStatus

    // Increment batch count only when enrollment first becomes active
    if (!wasAlreadyActive && enrollment.enrollmentStatus === "active") {
      await Batch.findByIdAndUpdate(enrollment.batch, { $inc: { currentStudents: 1 } });
    }

    // Send success email
    const course = await Course.findById(enrollment.course);
    const emailHtml = buildPaymentSuccessEmail({
      userName: req.user.name,
      courseTitle: course?.title || "your course",
      amount: payment.amount,
      paidAmount: enrollment.paidAmount,
      totalAmount: enrollment.totalAmount,
      dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
    });

    sendEmail({
      email: req.user.email,
      subject: "Payment Successful - ZatAcademy",
      html: emailHtml,
    }).catch((err) =>
      console.error("[Email] Failed to send payment success email:", err.message),
    );

    res.status(200).json({
      success: true,
      message: "Payment verified and enrollment activated",
      data: {
        payment: {
          id: payment._id,
          amount: payment.amount,
          status: payment.status,
          razorpayPaymentId: payment.razorpayPaymentId,
        },
        enrollment: {
          id: enrollment._id,
          enrollmentStatus: enrollment.enrollmentStatus,
          paymentStatus: enrollment.paymentStatus,
          paidAmount: enrollment.paidAmount,
          remainingAmount: enrollment.remainingAmount,
          nextPaymentDue: enrollment.nextPaymentDue,
        },
      },
    });
  } catch (error) {
    console.error("[paymentCallback]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Pay next EMI installment (creates a new Razorpay order)
// @route   POST /api/v1/enrollments/:enrollmentId/pay-emi
// @access  Private/Student
exports.payEMI = async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const enrollment = await Enrollment.findById(enrollmentId).populate("course");
    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment not found" });
    }

    // Authorization
    if (enrollment.student.toString() !== req.user.id) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to pay for this enrollment" });
    }

    if (enrollment.paymentMethod !== "emi") {
      return res.status(400).json({ success: false, message: "Not an EMI enrollment" });
    }

    if (enrollment.remainingAmount <= 0) {
      return res.status(400).json({ success: false, message: "All EMIs have been paid" });
    }

    if (enrollment.enrollmentStatus === "cancelled") {
      return res
        .status(400)
        .json({ success: false, message: "Enrollment has been cancelled" });
    }

    // Find the last paid EMI number
    const lastPaidPayment = await Payment.findOne({
      enrollment: enrollment._id,
      status: "completed",
    }).sort("-emiNumber");

    const nextEmiNumber = lastPaidPayment ? lastPaidPayment.emiNumber + 1 : 1;

    // Calculate this EMI's amount (last EMI may differ)
    const remainingAmount = enrollment.remainingAmount;
    const emiAmount = Math.min(enrollment.emiAmount, remainingAmount);

    // Create new Razorpay order
    const order = await paymentService.createOrder(
      emiAmount,
      "INR",
      `emi_${enrollment._id}_${nextEmiNumber}`,
    );

    // Record pending payment
    const payment = await Payment.create({
      enrollment: enrollment._id,
      student: req.user.id,
      batch: enrollment.batch,
      course: enrollment.course._id,
      amount: emiAmount,
      paymentType: "emi",
      emiNumber: nextEmiNumber,
      status: "pending",
      razorpayOrderId: order.id,
      dueDate: new Date(),
    });

    res.status(201).json({
      success: true,
      message: `EMI #${nextEmiNumber} order created. Please complete payment via Razorpay.`,
      data: {
        emiNumber: nextEmiNumber,
        totalEMIs: enrollment.emiMonths,
        paymentRecord: payment._id,
        razorpay: {
          orderId: order.id,
          amount: order.amount, // In paise
          amountInINR: emiAmount,
          currency: order.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
        },
        enrollment: {
          paidAmount: enrollment.paidAmount,
          remainingAmount: enrollment.remainingAmount,
          nextPaymentDue: enrollment.nextPaymentDue,
        },
      },
    });
  } catch (error) {
    console.error("[payEMI]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Razorpay webhook handler (server-to-server, more reliable)
// @route   POST /api/v1/enrollments/webhook
// @access  Public (Razorpay servers only) — signature verified
exports.razorpayWebhook = async (req, res) => {
  try {
    const signature = req.headers["x-razorpay-signature"];
    if (!signature) {
      return res
        .status(400)
        .json({ success: false, message: "Missing webhook signature" });
    }

    // Verify webhook signature using raw body
    const rawBody = req.rawBody || JSON.stringify(req.body);
    const isValid = paymentService.verifyWebhookSignature(rawBody, signature);
    if (!isValid) {
      console.warn("[Webhook] Invalid signature received");
      return res
        .status(400)
        .json({ success: false, message: "Invalid webhook signature" });
    }

    const event = req.body;
    const eventType = event.event;
    console.log(`[Webhook] Received event: ${eventType}`);

    if (eventType === "payment.captured") {
      const razorpayPayment = event.payload.payment.entity;
      const { order_id, id: paymentId, amount } = razorpayPayment;

      const payment = await Payment.findOne({ razorpayOrderId: order_id });
      if (!payment) {
        console.warn(`[Webhook] No payment record for order ${order_id}`);
        return res.status(200).json({ success: true, message: "Order not tracked" });
      }

      // Idempotency
      if (payment.status === "completed") {
        return res.status(200).json({ success: true, message: "Already processed" });
      }

      payment.status = "completed";
      payment.razorpayPaymentId = paymentId;
      payment.paymentDate = new Date();
      await payment.save();

      const enrollment = await Enrollment.findById(payment.enrollment);
      const wasAlreadyActive = enrollment.enrollmentStatus === "active";

      enrollment.paidAmount += payment.amount;
      if (enrollment.paidAmount < enrollment.totalAmount) {
        enrollment.nextPaymentDue = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      } else {
        enrollment.nextPaymentDue = null;
      }
      await enrollment.save();

      if (!wasAlreadyActive && enrollment.enrollmentStatus === "active") {
        await Batch.findByIdAndUpdate(enrollment.batch, { $inc: { currentStudents: 1 } });
      }

      // Send email via student user record
      const student = await User.findById(payment.student).select("name email");
      const course = await Course.findById(enrollment.course).select("title");
      if (student && course) {
        const emailHtml = buildPaymentSuccessEmail({
          userName: student.name,
          courseTitle: course.title,
          amount: payment.amount,
          paidAmount: enrollment.paidAmount,
          totalAmount: enrollment.totalAmount,
          dashboardUrl: `${process.env.FRONTEND_URL}/dashboard`,
        });
        sendEmail({
          email: student.email,
          subject: "Payment Confirmed - ZatAcademy",
          html: emailHtml,
        }).catch((err) => console.error("[Email] Failed:", err.message));
      }
    } else if (eventType === "payment.failed") {
      const razorpayPayment = event.payload.payment.entity;
      const { order_id, id: paymentId } = razorpayPayment;

      const failedPayment = await Payment.findOneAndUpdate(
        { razorpayOrderId: order_id },
        { status: "failed", razorpayPaymentId: paymentId },
        { new: true },
      );

      // Mark the enrollment as 'failed' so the student is allowed to retry enrollment
      if (failedPayment) {
        const enrollmentToFail = await Enrollment.findById(failedPayment.enrollment);
        if (enrollmentToFail && enrollmentToFail.enrollmentStatus === "pending") {
          enrollmentToFail.enrollmentStatus = "failed";
          await enrollmentToFail.save();
        }
      }

      console.log(`[Webhook] Payment failed for order ${order_id}`);
    }

    // Always respond 200 to Razorpay quickly
    res.status(200).json({ success: true });
  } catch (error) {
    console.error("[razorpayWebhook]", error);
    // Still return 200 so Razorpay doesn't retry endlessly
    res.status(200).json({ success: true });
  }
};

// @desc    Get payment history for an enrollment
// @route   GET /api/v1/enrollments/:enrollmentId/payments
// @access  Private (student own, admin all)
exports.getPaymentHistory = async (req, res) => {
  try {
    const { enrollmentId } = req.params;

    const enrollment = await Enrollment.findById(enrollmentId)
      .populate("course", "title fee emiAmount")
      .populate("batch", "name startDate endDate");

    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment not found" });
    }

    // Authorization
    if (req.user.role === "student" && enrollment.student.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this enrollment's payments",
      });
    }

    const payments = await Payment.find({ enrollment: enrollmentId }).sort(
      "emiNumber paymentDate",
    );

    res.status(200).json({
      success: true,
      data: {
        enrollment: {
          id: enrollment._id,
          paymentMethod: enrollment.paymentMethod,
          totalAmount: enrollment.totalAmount,
          paidAmount: enrollment.paidAmount,
          remainingAmount: enrollment.remainingAmount,
          emiMonths: enrollment.emiMonths,
          paymentStatus: enrollment.paymentStatus,
          enrollmentStatus: enrollment.enrollmentStatus,
          nextPaymentDue: enrollment.nextPaymentDue,
          course: enrollment.course,
          batch: enrollment.batch,
        },
        payments,
        summary: {
          totalPayments: payments.length,
          completedPayments: payments.filter((p) => p.status === "completed").length,
          pendingPayments: payments.filter((p) => p.status === "pending").length,
          failedPayments: payments.filter((p) => p.status === "failed").length,
        },
      },
    });
  } catch (error) {
    console.error("[getPaymentHistory]", error);
    res.status(500).json({ success: false, message: error.message });
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

    res.status(200).json({
      success: true,
      count: enrollments.length,
      data: enrollments,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get batch enrollments (for admin/instructor)
// @route   GET /api/v1/batches/:batchId/enrollments
// @access  Private/Admin/Instructor
exports.getBatchEnrollments = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.batchId);
    if (!batch) {
      return res.status(404).json({ success: false, message: "Batch not found" });
    }

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
      data: { batch, enrollments },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
      return res.status(404).json({ success: false, message: "Enrollment not found" });
    }

    if (
      req.user.role === "student" &&
      enrollment.student._id.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to view this enrollment" });
    }

    const payments = await Payment.find({ enrollment: enrollment._id }).sort(
      "emiNumber paymentDate",
    );

    res.status(200).json({
      success: true,
      data: { enrollment, payments },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Cancel enrollment
// @route   PUT /api/v1/enrollments/:id/cancel
// @access  Private/Student or Admin
exports.cancelEnrollment = async (req, res) => {
  try {
    const enrollment = await Enrollment.findById(req.params.id);
    if (!enrollment) {
      return res.status(404).json({ success: false, message: "Enrollment not found" });
    }

    if (
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin" &&
      enrollment.student.toString() !== req.user.id
    ) {
      return res
        .status(403)
        .json({ success: false, message: "Not authorized to cancel this enrollment" });
    }

    const batch = await Batch.findById(enrollment.batch);
    if (batch.startDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel enrollment after batch has started",
      });
    }

    const wasActive = enrollment.enrollmentStatus === "active";
    enrollment.enrollmentStatus = "cancelled";
    enrollment.paymentStatus = "cancelled";
    await enrollment.save();

    // Decrement student count only if enrollment was active
    if (wasActive) {
      batch.currentStudents = Math.max(0, batch.currentStudents - 1);
      await batch.save();
    }

    res.status(200).json({
      success: true,
      message: "Enrollment cancelled successfully",
      data: enrollment,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get full payment history for a student (all enrollments) — admin view
// @route   GET /api/v1/enrollments/admin/students/:studentId/payments
// @access  Private/Admin/SuperAdmin
exports.getStudentPaymentHistory = async (req, res) => {
  try {
    const { studentId } = req.params;

    // Validate the student exists and is actually a student
    const student = await User.findById(studentId).select("name email role");
    if (!student) {
      return res.status(404).json({ success: false, message: "Student not found" });
    }
    if (student.role !== "student") {
      return res
        .status(400)
        .json({ success: false, message: "Provided ID does not belong to a student" });
    }

    // Fetch all enrollments for this student
    const enrollments = await Enrollment.find({ student: studentId })
      .populate("batch", "name startDate endDate")
      .populate("course", "title fee")
      .sort("-enrollmentDate");

    if (enrollments.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          student: { id: student._id, name: student.name, email: student.email },
          enrollments: [],
          summary: {
            totalEnrollments: 0,
            totalFees: 0,
            totalPaid: 0,
            totalOutstanding: 0,
            totalPaymentTransactions: 0,
          },
        },
      });
    }

    const enrollmentIds = enrollments.map((e) => e._id);

    // Fetch all payments across all enrollments in one query
    const allPayments = await Payment.find({ enrollment: { $in: enrollmentIds } }).sort(
      "enrollment emiNumber paymentDate"
    );

    // Group payments by enrollmentId for fast lookup
    const paymentsByEnrollment = {};
    allPayments.forEach((p) => {
      const key = p.enrollment.toString();
      if (!paymentsByEnrollment[key]) paymentsByEnrollment[key] = [];
      paymentsByEnrollment[key].push(p);
    });

    // Build per-enrollment breakdown
    const enrollmentBreakdowns = enrollments.map((e) => {
      const payments = paymentsByEnrollment[e._id.toString()] || [];
      const completedPayments = payments.filter((p) => p.status === "completed");
      const pendingPayments = payments.filter((p) => p.status === "pending");
      const failedPayments = payments.filter((p) => p.status === "failed");

      return {
        enrollmentId: e._id,
        batch: { id: e.batch?._id, name: e.batch?.name },
        course: { id: e.course?._id, title: e.course?.title },
        enrollmentStatus: e.enrollmentStatus,
        paymentStatus: e.paymentStatus,
        paymentMethod: e.paymentMethod,
        totalFees: e.totalAmount,
        feesPaid: e.paidAmount,
        feesOutstanding: e.remainingAmount,
        emiMonths: e.emiMonths,
        nextPaymentDue: e.nextPaymentDue,
        enrollmentDate: e.enrollmentDate,
        paymentTransactions: payments,
        transactionSummary: {
          total: payments.length,
          completed: completedPayments.length,
          pending: pendingPayments.length,
          failed: failedPayments.length,
        },
      };
    });

    // Overall summary across all enrollments
    const summary = enrollments.reduce(
      (acc, e) => {
        acc.totalFees += e.totalAmount;
        acc.totalPaid += e.paidAmount;
        acc.totalOutstanding += e.remainingAmount;
        return acc;
      },
      { totalEnrollments: enrollments.length, totalFees: 0, totalPaid: 0, totalOutstanding: 0 }
    );
    summary.totalPaymentTransactions = allPayments.length;

    res.status(200).json({
      success: true,
      data: {
        student: { id: student._id, name: student.name, email: student.email },
        enrollments: enrollmentBreakdowns,
        summary,
      },
    });
  } catch (error) {
    console.error("[getStudentPaymentHistory]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get enrollment summary stats for the admin dashboard
// @route   GET /api/v1/enrollments/admin/stats
// @access  Private/Admin/SuperAdmin
exports.getEnrollmentStats = async (req, res) => {
  try {
    const [totalEnrolled, activeStudents, feesCompleted, outstandingAgg] = await Promise.all([
      // All enrollments that are not in a pre-payment/failed state
      Enrollment.countDocuments({
        enrollmentStatus: { $in: ["active", "completed", "suspended", "cancelled"] },
      }),

      // Currently active students
      Enrollment.countDocuments({ enrollmentStatus: "active" }),

      // Students whose fees are fully paid
      Enrollment.countDocuments({ paymentStatus: "paid" }),

      // Sum of outstanding (remaining) fees across all active/partially-paid enrollments
      Enrollment.aggregate([
        {
          $match: {
            enrollmentStatus: { $in: ["active", "completed"] },
            remainingAmount: { $gt: 0 },
          },
        },
        {
          $group: {
            _id: null,
            totalOutstanding: { $sum: "$remainingAmount" },
          },
        },
      ]),
    ]);

    const outstandingFees = outstandingAgg.length > 0 ? outstandingAgg[0].totalOutstanding : 0;

    res.status(200).json({
      success: true,
      data: {
        totalEnrolled,
        activeStudents,
        feesCompleted,
        outstandingFees,
      },
    });
  } catch (error) {
    console.error("[getEnrollmentStats]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get all enrolled students list (admin view) with filters
// @route   GET /api/v1/enrollments/admin/students
// @query   status=active|inactive   (optional)
// @query   batchId=<ObjectId>       (optional)
// @query   page=1 limit=20          (optional, defaults: page=1, limit=20)
// @access  Private/Admin/SuperAdmin
exports.getAdminStudentList = async (req, res) => {
  try {
    const { status, batchId, page = 1, limit = 20 } = req.query;

    // Build filter
    const filter = {
      // Exclude purely pre-payment enrollments (pending/failed with no payment)
      enrollmentStatus: { $in: ["active", "completed", "suspended", "cancelled"] },
    };

    if (status === "active") {
      filter.enrollmentStatus = "active";
    } else if (status === "inactive") {
      // Everything except active
      filter.enrollmentStatus = { $in: ["completed", "suspended", "cancelled"] };
    }

    if (batchId) {
      filter.batch = batchId;
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);

    const [enrollments, total] = await Promise.all([
      Enrollment.find(filter)
        .populate("student", "name email")
        .populate("batch", "name")
        .populate("course", "title")
        .sort("-enrollmentDate")
        .skip(skip)
        .limit(parseInt(limit)),
      Enrollment.countDocuments(filter),
    ]);

    const data = enrollments.map((e) => ({
      enrollmentId: e._id,
      student: {
        id: e.student?._id,
        name: e.student?.name,
        email: e.student?.email,
      },
      batch: {
        id: e.batch?._id,
        name: e.batch?.name,
      },
      course: {
        id: e.course?._id,
        title: e.course?.title,
      },
      feesPaid: e.paidAmount,
      feesOutstanding: e.remainingAmount,
      totalFees: e.totalAmount,
      paymentMethod: e.paymentMethod,
      paymentStatus: e.paymentStatus,
      enrollmentStatus: e.enrollmentStatus,
      enrollmentDate: e.enrollmentDate,
    }));

    res.status(200).json({
      success: true,
      count: data.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
      data,
    });
  } catch (error) {
    console.error("[getAdminStudentList]", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get revenue stats (total, collected, outstanding, efficiency, and batch-wise)
// @route   GET /api/v1/enrollments/stats/revenue
// @access  Private/Admin/SuperAdmin
exports.getRevenueStats = async (req, res) => {
  try {
    // Only include non-cancelled/suspended enrollments for revenue expectation
    // If you want to include all, remove the $in filter.
    const enrollments = await Enrollment.find({
      enrollmentStatus: { $in: ["active", "completed"] },
    })
      .populate("batch", "name")
      .populate("course", "title");

    let totalRevenue = 0;
    let totalCollected = 0;
    let totalOutstanding = 0;
    const batchStats = {};

    enrollments.forEach((enrollment) => {
      const batchId = enrollment.batch._id.toString();
      const batchName = enrollment.batch.name;
      const courseName = enrollment.course.title;

      totalRevenue += enrollment.totalAmount;
      totalCollected += enrollment.paidAmount;
      totalOutstanding += enrollment.remainingAmount;

      if (!batchStats[batchId]) {
        batchStats[batchId] = {
          batchId,
          batchName,
          courseName,
          enrolledStudents: 0,
          totalExpectedRevenue: 0,
          totalCollectedAmount: 0,
          totalOutstandingFee: 0,
        };
      }

      batchStats[batchId].enrolledStudents += 1;
      batchStats[batchId].totalExpectedRevenue += enrollment.totalAmount;
      batchStats[batchId].totalCollectedAmount += enrollment.paidAmount;
      batchStats[batchId].totalOutstandingFee += enrollment.remainingAmount;
    });

    const efficiency =
      totalRevenue > 0 ? ((totalCollected / totalRevenue) * 100).toFixed(2) : 0;

    // Calculate efficiency per batch
    const batchWiseDetails = Object.values(batchStats).map((batch) => ({
      ...batch,
      efficiency:
        batch.totalExpectedRevenue > 0
          ? parseFloat(
              ((batch.totalCollectedAmount / batch.totalExpectedRevenue) * 100).toFixed(
                2,
              ),
            )
          : 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        overall: {
          totalRevenue,
          totalCollected,
          totalOutstanding,
          efficiency: parseFloat(efficiency),
        },
        batchWise: batchWiseDetails,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
