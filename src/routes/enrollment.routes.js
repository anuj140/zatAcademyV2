const express = require('express');
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
} = require('../controllers/enrollment.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

// ─── Public Routes ─────────────────────────────────────────────────────────────

// Razorpay webhook — must use raw body for HMAC verification
// Must be before express.json() is applied to this route
router.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  (req, res, next) => {
    // Make raw body available for signature verification
    if (Buffer.isBuffer(req.body)) {
      req.rawBody = req.body.toString('utf8');
      req.body = JSON.parse(req.rawBody);
    }
    next();
  },
  razorpayWebhook
);

// ─── Protected Routes ──────────────────────────────────────────────────────────
router.use(protect);

// Frontend payment callback (student-authenticated, after Razorpay checkout)
router.post('/payment-callback', paymentCallback);

// Student enrollment
router.get('/batches/course/:courseId', authorize('student'), getAvailableBatchesForEnrollment);
router.post('/', authorize('student'), enrollInBatch);
router.get('/my-enrollments', authorize('student'), getMyEnrollments);

// Pay next EMI
router.post('/:enrollmentId/pay-emi', authorize('student'), payEMI);

// Payment history for an enrollment
router.get('/:enrollmentId/payments', getPaymentHistory);

// Single enrollment detail
router.get('/:id', getEnrollment);

// Cancel enrollment
router.put('/:id/cancel', cancelEnrollment);

// Admin / SuperAdmin revenue stats (must be placed before /:id to avoid matching :id)
router.get(
  '/stats/revenue',
  authorize('admin', 'superAdmin'),
  getRevenueStats
);

// Admin/Instructor routes
router.get(
  '/batches/:batchId/enrollments',
  authorize('admin', 'superAdmin', 'instructor'),
  getBatchEnrollments
);

module.exports = router;