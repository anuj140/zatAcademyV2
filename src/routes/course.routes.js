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
const { protect,optionalProtect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { uploadThumbnail, handleUploadError } = require("../middleware/uploads");

// Admin only routes
router.post(
  "/",
  protect,
  authorize("admin", "superAdmin"),
  uploadThumbnail,
  handleUploadError,
  createCourse,
);
router.put(
  "/:id",
  protect,
  authorize("admin", "superAdmin"),
  uploadThumbnail,
  handleUploadError,
  updateCourse,
);
router.delete("/:id", protect, authorize("admin", "superAdmin"), deleteCourse);
router.put("/:id/publish", protect, authorize("admin", "superAdmin"), togglePublish);
router.get("/stats", protect, authorize("admin", "superAdmin"), getCourseStats);

// Public routes (with authentication)
router.get("/",optionalProtect, getCourses);
router.get("/:id", getCourse);

module.exports = router;
