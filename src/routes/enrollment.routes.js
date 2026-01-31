const express = require('express');
const router = express.Router();
const {
  enrollInBatch,
  paymentCallback,
  getMyEnrollments,
  getBatchEnrollments,
  getEnrollment,
  cancelEnrollment
} = require('../controllers/enrollment.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

// Payment callback (public for webhook)
router.post('/payment-callback', paymentCallback);

// All other routes protected
router.use(protect);

// Student enrollment
router.post('/', authorize('student'), enrollInBatch);
router.get('/my-enrollments', authorize('student'), getMyEnrollments);
router.get('/:id', getEnrollment); // Student can see own, admin/instructor can see all
router.put('/:id/cancel', cancelEnrollment); // Student can cancel own, admin can cancel any

// Admin/Instructor routes
router.get('/batches/:batchId/enrollments', authorize('admin', 'superAdmin', 'instructor'), getBatchEnrollments);

module.exports = router;