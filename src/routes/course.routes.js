const express = require("express");
const router = express.Router();
const {
  createCourse,
  getCourses,
  getCourse,
  updateCourse,
  deleteCourse,
  togglePublish,
  getCourseStats,
  getCourseLearningPath,
  getCourseModuleStatus,
  publishCourseWithModules,
} = require("../controllers/course.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { uploadThumbnail, handleUploadError } = require("../middleware/uploads");

// All routes protected
router.use(protect);

// Admin only routes
router.post(
  "/",
  authorize("admin", "superAdmin"),
  uploadThumbnail,
  handleUploadError,
  createCourse,
);
router.put(
  "/:id",
  authorize("admin", "superAdmin"),
  uploadThumbnail,
  handleUploadError,
  updateCourse,
);
router.delete("/:id", authorize("admin", "superAdmin"), deleteCourse);
router.put("/:id/publish", authorize("admin", "superAdmin"), togglePublish);
router.get("/stats", authorize("admin", "superAdmin"), getCourseStats);

// Module-related routes
router.get("/:id/learning-path", getCourseLearningPath);
router.get("/:id/module-status", authorize("admin", "superAdmin"), getCourseModuleStatus);
router.put(
  "/:id/publish-with-modules",
  authorize("admin", "superAdmin"),
  publishCourseWithModules,
);

// Public routes (with authentication)
router.get("/", getCourses);
router.get("/:id", getCourse);

module.exports = router;
