const express = require("express");
const router = express.Router();
const {
  getAvailableBatchesForEnrollment,
  enrollInBatch,
  paymentCallback,
  razorpayWebhook,
  payEMI,
  getMyEnrollments,
  getBatchEnrollments,
  getEnrollment,
  getPaymentHistory,
  cancelEnrollment,
  getRevenueStats,
  getEnrollmentStats,
  getAdminStudentList,
  getStudentPaymentHistory,
} = require("../controllers/enrollment.controller");
const { protect, requirePhoneVerifiedForWrites } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// ─── Public Routes ─────────────────────────────────────────────────────────────

// Razorpay webhook — must use raw body for HMAC verification
// Must be before express.json() is applied to this route
router.post(
  "/webhook",
  express.raw({ type: "application/json" }),
  (req, res, next) => {
    // Make raw body available for signature verification
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString("utf8");
      req.body = JSON.parse(req.rawBody);
    }
    next();
  },
  razorpayWebhook,
);

// ─── Protected Routes ──────────────────────────────────────────────────────────
router.use(protect);
// Block unverified-phone users from all writes (enroll, pay-EMI, cancel, etc.)
router.use(requirePhoneVerifiedForWrites);

// Frontend payment callback (student-authenticated, after Razorpay checkout)
router.post("/payment-callback", paymentCallback);

// ─── Static/Named Routes (must come before /:id wildcards) ────────────────────

// Student enrollment
router.get(
  "/batches/course/:courseId",
  authorize("student"),
  getAvailableBatchesForEnrollment,
);
router.post("/", authorize("student"), enrollInBatch);
router.get("/my-enrollments", authorize("student"), getMyEnrollments);

// Admin / SuperAdmin revenue stats
router.get("/stats/revenue", authorize("admin", "superAdmin"), getRevenueStats);

// Admin dashboard — enrollment summary stats (total enrolled, active, fees completed, outstanding)
router.get("/admin/stats", authorize("admin", "superAdmin"), getEnrollmentStats);

// Admin dashboard — full student list (filterable by status & batch, paginated)
router.get("/admin/students", authorize("admin", "superAdmin"), getAdminStudentList);

// Admin dashboard — full payment history for an individual student (all enrollments)
router.get(
  "/admin/students/:studentId/payments",
  authorize("admin", "superAdmin"),
  getStudentPaymentHistory,
);

// Admin/Instructor — enrollments for a specific batch
router.get(
  "/batches/:batchId/enrollments",
  authorize("admin", "superAdmin", "instructor"),
  getBatchEnrollments,
);

// ─── Wildcard Routes (/:id and /:enrollmentId) — keep last ────────────────────

// Pay next EMI
router.post("/:enrollmentId/pay-emi", authorize("student"), payEMI);

// Payment history for an enrollment
router.get("/:enrollmentId/payments", getPaymentHistory);

// Single enrollment detail
router.get("/:id", getEnrollment);

// Cancel enrollment
router.put("/:id/cancel", cancelEnrollment);

module.exports = router;
