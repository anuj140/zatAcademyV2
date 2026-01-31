const express = require('express');
const router = express.Router();
const {
  createBatch,
  getBatches,
  getBatch,
  updateBatch,
  deleteBatch,
  toggleActive,
  getBatchesByCourse
} = require('../controllers/batch.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

// All routes protected
router.use(protect);

// Admin only routes
router.post('/', authorize('admin', 'superAdmin'), createBatch);
router.put('/:id', authorize('admin', 'superAdmin'), updateBatch);
router.delete('/:id', authorize('admin', 'superAdmin'), deleteBatch);
router.put('/:id/toggle-active', authorize('admin', 'superAdmin'), toggleActive);

// Admin, instructor, student routes
router.get('/', getBatches);
router.get('/:id', getBatch);

// Public route for course batches (with auth)
router.get('/courses/:courseId/batches', protect, getBatchesByCourse);

module.exports = router;