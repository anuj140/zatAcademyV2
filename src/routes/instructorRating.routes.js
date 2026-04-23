const express = require("express");
const router = express.Router();
const {
  addInstructorRating,
  updateInstructorRating,
  getInstructorRatings,
  getStudentRatings,
  deleteInstructorRating,
  getInstructorStats,
  getBatchRatings,
} = require("../controllers/instructorRating.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// All routes protected
router.use(protect);

// @route   POST /api/v1/instructor-ratings
// @desc    Add a rating and feedback for an instructor
// @access  Private/Student
router.post("/", authorize("student"), addInstructorRating);

// @route   PUT /api/v1/instructor-ratings/:id
// @desc    Update a rating
// @access  Private/Student (own) or Admin/SuperAdmin
router.put("/:id", updateInstructorRating);

// @route   DELETE /api/v1/instructor-ratings/:id
// @desc    Delete a rating
// @access  Private/Student (own) or Admin/SuperAdmin
router.delete("/:id", deleteInstructorRating);

// @route   GET /api/v1/instructor-ratings/instructor/:instructorId
// @desc    Get all ratings for a specific instructor
// @query   batch (optional), page (optional, default: 1), limit (optional, default: 10)
// @access  Private/Instructor (own) or Admin/SuperAdmin
router.get(
  "/instructor/:instructorId",
  authorize("instructor", "admin", "superAdmin"),
  getInstructorRatings,
);

// @route   GET /api/v1/instructor-ratings/stats/instructor/:instructorId
// @desc    Get instructor statistics and ratings summary
// @query   page (optional, default: 1), limit (optional, default: 5) - for feedback pagination
// @access  Private/Instructor (own) or Admin/SuperAdmin
router.get(
  "/stats/instructor/:instructorId",
  authorize("instructor", "admin", "superAdmin"),
  getInstructorStats,
);

// @route   GET /api/v1/instructor-ratings/student/:studentId
// @desc    Get all ratings given by a specific student
// @query   page (optional, default: 1), limit (optional, default: 10)
// @access  Private/Student (own) or Admin/SuperAdmin
router.get(
  "/student/:studentId",
  authorize("student", "admin", "superAdmin"),
  getStudentRatings,
);

// @route   GET /api/v1/instructor-ratings/batch/:batchId
// @desc    Get all ratings for batch (admin view)
// @query   page (optional, default: 1), limit (optional, default: 20)
// @access  Private/Admin/SuperAdmin
router.get("/batch/:batchId", authorize("admin", "superAdmin"), getBatchRatings);

module.exports = router;
