const express = require("express");
const router = express.Router();
const {
  gradeSubmission,
  bulkGradeSubmissions,
  getBatchGrades,
  getStudentGrades,
  finalizeBatchGrades,
} = require("../controllers/grade.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// All routes protected
router.use(protect);

// Grading
router.put(
  "/submissions/:id/grade",
  authorize("instructor", "admin", "superAdmin"),
  gradeSubmission,
);
router.post(
  "/assignments/:assignmentId/bulk-grade",
  authorize("instructor", "admin", "superAdmin"),
  bulkGradeSubmissions,
);

// Grade viewing
router.get("/batches/:batchId/grades", getBatchGrades);
router.get("/student/grades", authorize("student"), getStudentGrades);

// Grade finalization
router.put(
  "/batches/:batchId/grades/finalize",
  authorize("instructor", "admin", "superAdmin"),
  finalizeBatchGrades,
);

module.exports = router;
