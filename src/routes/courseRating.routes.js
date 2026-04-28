const express = require("express");
const router = express.Router();
const {
  submitCourseRating,
  updateCourseRating,
  deleteCourseRating,
  getCourseRatings,
  getStudentCourseRatings,
  manageCourseRatingStatus,
  getCourseRatingStats,
  checkIfRated,
  getPublicCourseRatings,
} = require("../controllers/courseRating.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// ─── Public routes (no token required) ───────────────────────────────────────

// @route   GET /api/v1/course-ratings/public/:courseId
// @desc    Get public course ratings (submitted + reviewed only) with aggregate stats
// @query   page (optional, default: 1), limit (optional, default: 10)
// @access  Public — no authentication required
router.get("/public/:courseId", getPublicCourseRatings);

// ─── Protected routes (token required) ───────────────────────────────────────
router.use(protect);

// @route   POST /api/v1/course-ratings
// @desc    Submit a course rating and feedback
// @access  Private/Student
router.post("/", authorize("student"), submitCourseRating);

// @route   PUT /api/v1/course-ratings/:id
// @desc    Update a course rating
// @access  Private/Student (own) or Admin/SuperAdmin
router.put("/:id", updateCourseRating);

// @route   DELETE /api/v1/course-ratings/:id
// @desc    Delete a course rating
// @access  Private/Student (own) or Admin/SuperAdmin
router.delete("/:id", deleteCourseRating);

// @route   PATCH /api/v1/course-ratings/:id/status
// @desc    Manage course rating status (flag, review, archive)
// @access  Private/Admin/SuperAdmin
router.patch("/:id/status", authorize("admin", "superAdmin"), manageCourseRatingStatus);

// @route   GET /api/v1/course-ratings/stats/course/:courseId
// @desc    Get course rating statistics
// @query   page (optional, default: 1), limit (optional, default: 5) - for feedback pagination
// @access  Private/Admin/SuperAdmin
router.get(
  "/stats/course/:courseId",
  authorize("admin", "superAdmin"),
  getCourseRatingStats, 
);

// @route   GET /api/v1/course-ratings/check/:courseId
// @desc    Check if student has already rated a course
// @access  Private/Student
router.get("/check/:courseId", authorize("student"), checkIfRated);

// @route   GET /api/v1/course-ratings/my-ratings
// @desc    Get all ratings given by the logged-in student
// @query   page (optional, default: 1), limit (optional, default: 10)
// @access  Private/Student
router.get("/my-ratings", authorize("student"), getStudentCourseRatings);

// @route   GET /api/v1/course-ratings/course/:courseId
// @desc    Get all ratings for a specific course
// @query   status (optional), page (optional, default: 1), limit (optional, default: 10)
// @access  Private/Admin/SuperAdmin
router.get("/course/:courseId", authorize("admin", "superAdmin"), getCourseRatings);

module.exports = router;
