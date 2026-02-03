const express = require("express");
const router = express.Router();
const {
  submitAssignment,
  getMySubmission,
  getStudentSubmissions,
  getSubmission,
  updateSubmission,
  deleteSubmission,
} = require("../controllers/Submission.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { canSubmitAssignment } = require("../middleware/accessControl");
const multer = require("multer");
const { handleUploadError } = require("../middleware/uploads");

// Configure multer for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB
  },
});

// All routes protected
router.use(protect);

// Student submissions
router.post(
  "/:assignmentId/submit",
  authorize("student"),
  canSubmitAssignment,
  upload.array("files", 5), // Max 5 files
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
  upload.array("files", 5),
  handleUploadError,
  updateSubmission,
);
router.delete("/:id", authorize("student"), deleteSubmission);

module.exports = router;
