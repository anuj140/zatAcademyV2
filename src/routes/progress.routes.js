const express = require("express");
const router = express.Router();
const {
  getStudentProgressDashboard,
  getBatchProgress,
  updateMaterialProgress,
  getAtRiskStudents,
  calculateBatchProgress,
  getProgressTrend,
  getInstructorProgressOverview,
} = require("../controllers/progress.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { cacheResponse } = require("../middleware/cache");

// All routes protected
router.use(protect);

// Student routes
router.get(
  "/student/progress/dashboard",
  authorize("student"),
  getStudentProgressDashboard,
);
router.get("/student/progress/trend", authorize("student"), getProgressTrend);

// Batch progress
router.get("/batches/:batchId/progress", getBatchProgress);
router.put(
  "/materials/:materialId",
  authorize("student"),
  updateMaterialProgress,
);

// Instructor routes
router.get(
  "/batches/:batchId/at-risk-students",
  authorize("instructor", "admin", "superAdmin"),
  getAtRiskStudents,
);
router.post(
  "/batches/:batchId/progress/calculate",
  authorize("instructor", "admin", "superAdmin"),
  calculateBatchProgress,
);
router.get(
  "/instructor/progress/overview",
  authorize("instructor", "admin", "superAdmin"),
  getInstructorProgressOverview,
);

module.exports = router;
