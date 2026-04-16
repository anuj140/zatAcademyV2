const express = require('express');
const router = express.Router();
const {
  createAssignment,
  getBatchAssignments,
  getAssignment,
  updateAssignment,
  deleteAssignment,
  togglePublish,
  getAssignmentSubmissions,
  downloadAssignmentFile,
  previewAssignmentFile,
} = require('../controllers/assignment.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');
const { canAccessBatchMaterials, canManageBatchContent } = require('../middleware/accessControl');
const { uploadSessionMaterial, handleUploadError } = require('../middleware/uploads');

// All routes protected
router.use(protect);

// Batch assignments
router.get('/batches/:batchId/assignments', canAccessBatchMaterials, getBatchAssignments);
router.post('/batches/:batchId/assignments', 
  authorize('instructor', 'admin', 'superAdmin'),
  canManageBatchContent,
  uploadSessionMaterial,
  handleUploadError,
  createAssignment
);

// Assignment CRUD
router.get('/:id', getAssignment);
router.put('/:id', 
  authorize('instructor', 'admin', 'superAdmin'),
  uploadSessionMaterial,
  handleUploadError,
  updateAssignment
);
router.delete('/:id', authorize('instructor', 'admin', 'superAdmin'), deleteAssignment);
router.put('/:id/publish', authorize('instructor', 'admin', 'superAdmin'), togglePublish);

// ── Download & Preview ─────────────────────────────────────────────────────────
// @access  Private — any authenticated user who can reach the assignment
router.get('/:id/download', downloadAssignmentFile);
router.get('/:id/preview', previewAssignmentFile);

// Instructor only - submissions
router.get('/assignments/:id/submissions', authorize('instructor', 'admin', 'superAdmin'), getAssignmentSubmissions);

module.exports = router;