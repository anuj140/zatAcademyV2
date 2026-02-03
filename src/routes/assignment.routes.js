const express = require('express');
const router = express.Router();
const {
  createAssignment,
  getBatchAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  togglePublish,
  getAssignmentSubmissions
} = require('../controllers/assignment.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { canAccessBatchMaterials, canManageBatchContent } = require('../middleware/accessControl');

// All routes protected
router.use(protect);

// Batch assignments
router.get('/batches/:batchId/assignments', canAccessBatchMaterials, getBatchAssignments);
router.post('/batches/:batchId/assignments', 
  authorize('instructor', 'admin', 'superAdmin'),
  canManageBatchContent,
  createAssignment
);

// Assignment CRUD
router.get('/:id', getAssignment);
router.put('/:id', authorize('instructor', 'admin', 'superAdmin'), updateAssignment);
router.delete('/:id', authorize('instructor', 'admin', 'superAdmin'), deleteAssignment);
router.put('/:id/publish', authorize('instructor', 'admin', 'superAdmin'), togglePublish);

// Instructor only - submissions
router.get('/assignments/:id/submissions', authorize('instructor', 'admin', 'superAdmin'), getAssignmentSubmissions);

module.exports = router;