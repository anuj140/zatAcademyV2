const express = require("express");
const router = express.Router();
const {
  submitAssignment,
  getMySubmission,
  getStudentSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
  downloadSubmissionFile,
  previewSubmissionFile,
} = require("../controllers/Submission.controller");
const { protect, requirePhoneVerifiedForWrites } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { canSubmitAssignment } = require("../middleware/accessControl");
const { uploadSubmissionFiles, handleUploadError } = require("../middleware/uploads");

// All routes protected
router.use(protect);
// Block unverified-phone users from all writes (submit, update, delete assignment)
router.use(requirePhoneVerifiedForWrites);

// Student submissions
router.post(
  "/:assignmentId/submit",
  authorize("student"),
  canSubmitAssignment,
  uploadSubmissionFiles, // ✅ fixed: was multer.memoryStorage() — files now go to Cloudinary
  handleUploadError,
  submitAssignment,
);

router.get(
  "/:assignmentId/my-submission",
  authorize("student"),
  getMySubmission,
);
router.get("/student/submissions", authorize("student"), getStudentSubmissions);

// Submission CRUD
router.get("/:id", getSubmission);
router.put(
  "/:id",
  authorize("student"),
  uploadSubmissionFiles,
  handleUploadError,
  updateSubmission,
);
router.delete("/:id", authorize("student"), deleteSubmission);

// ── Download & Preview ─────────────────────────────────────────────────────────
// fileIndex = 0-based index into submission.files[]
// @access  Private — student (own submission) or instructor/admin
router.get("/:submissionId/files/:fileIndex/download", downloadSubmissionFile);
router.get("/:submissionId/files/:fileIndex/preview", previewSubmissionFile);

module.exports = router;
