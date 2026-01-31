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

// Public routes (with authentication)
router.get("/", getCourses);
router.get("/:id", getCourse);

module.exports = router;
