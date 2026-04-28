const CourseRating = require("../models/CourseRating");
const Course = require("../models/Course");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");

// @desc    Submit a course rating and feedback
// @route   POST /api/v1/course-ratings
// @access  Private/Student
exports.submitCourseRating = async (req, res) => {
  try {
    const {
      course,
      contentQuality,
      relevance,
      difficultyLevel,
      valueForMoney,
      overallRating,
      feedback,
      suggestions,
    } = req.body;

    // Validate required fields
    if (
      !course ||
      !contentQuality ||
      !relevance ||
      !difficultyLevel ||
      !valueForMoney ||
      !overallRating
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required rating fields (course and all rating categories)",
      });
    }

    // Check if user is a student
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can rate courses",
      });
    }

    // Verify course exists
    const courseDoc = await Course.findById(course);
    if (!courseDoc) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Verify student is enrolled in this course (regardless of batch)
    // Check if student has active enrollment in any batch for this course
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      course: course,
      enrollmentStatus: "active",
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message:
          "You are not enrolled in this course. Only enrolled students can rate courses.",
      });
    }

    // Check if student has already rated this course
    const existingRating = await CourseRating.findOne({
      student: req.user.id,
      course: course,
    });

    if (existingRating) {
      return res.status(409).json({
        success: false,
        message:
          "You have already rated this course. You can only rate each course once.",
      });
    }

    // Create new rating
    const newRating = await CourseRating.create({
      student: req.user.id,
      course: course,
      contentQuality,
      relevance,
      difficultyLevel,
      valueForMoney,
      overallRating,
      feedback: feedback || "",
      suggestions: suggestions || "",
    });

    // Populate references
    await newRating.populate("student", "name email picture");
    await newRating.populate("course", "name");

    res.status(201).json({
      success: true,
      message: "Course rating submitted successfully",
      data: newRating,
    });
  } catch (error) {
    console.error("Error submitting course rating:", error);

    // Handle duplicate key error
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message:
          "You have already rated this course. You can only rate each course once.",
      });
    }

    res.status(500).json({
      success: false,
      message: "Error submitting rating",
      error: error.message,
    });
  }
};

// @desc    Update a course rating and feedback
// @route   PUT /api/v1/course-ratings/:id
// @access  Private/Student (own rating) or Admin/SuperAdmin
exports.updateCourseRating = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      contentQuality,
      relevance,
      difficultyLevel,
      valueForMoney,
      overallRating,
      feedback,
      suggestions,
    } = req.body;

    // Find the rating
    const rating = await CourseRating.findById(id);
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    // Check authorization - only the student who submitted or admins can update
    if (
      rating.student.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this rating",
      });
    }

    // Update fields
    if (contentQuality) rating.contentQuality = contentQuality;
    if (relevance) rating.relevance = relevance;
    if (difficultyLevel) rating.difficultyLevel = difficultyLevel;
    if (valueForMoney) rating.valueForMoney = valueForMoney;
    if (overallRating) rating.overallRating = overallRating;
    if (feedback !== undefined) rating.feedback = feedback;
    if (suggestions !== undefined) rating.suggestions = suggestions;

    await rating.save();

    // Populate references
    await rating.populate("student", "name email picture");
    await rating.populate("course", "name");

    res.status(200).json({
      success: true,
      message: "Rating updated successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error updating course rating:", error);
    res.status(500).json({
      success: false,
      message: "Error updating rating",
      error: error.message,
    });
  }
};

// @desc    Delete a course rating
// @route   DELETE /api/v1/course-ratings/:id
// @access  Private/Student (own) or Admin/SuperAdmin
exports.deleteCourseRating = async (req, res) => {
  try {
    const { id } = req.params;

    const rating = await CourseRating.findById(id);
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    // Check authorization
    if (
      rating.student.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this rating",
      });
    }

    await CourseRating.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Rating deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting course rating:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting rating",
      error: error.message,
    });
  }
};

// @desc    Get all ratings for a specific course (Admin only)
// @route   GET /api/v1/course-ratings/course/:courseId
// @access  Private/Admin/SuperAdmin
exports.getCourseRatings = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { status, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization - only admin/superAdmin
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view course ratings",
      });
    }

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Build query - filter by status if provided
    let query = { course: courseId };
    if (status) {
      query.status = status;
    }

    // Get ratings with pagination
    const ratings = await CourseRating.find(query)
      .populate("student", "name email")
      .populate("course", "name")
      .sort({ ratedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await CourseRating.countDocuments(query);

    // Calculate statistics
    const stats = await CourseRating.aggregate([
      { $match: { course: new (require("mongoose").Types.ObjectId)(courseId) } },
      {
        $group: {
          _id: null,
          avgContentQuality: { $avg: "$contentQuality" },
          avgRelevance: { $avg: "$relevance" },
          avgDifficultyLevel: { $avg: "$difficultyLevel" },
          avgValueForMoney: { $avg: "$valueForMoney" },
          avgOverallRating: { $avg: "$overallRating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Course ratings retrieved successfully",
      data: {
        ratings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
        statistics: stats.length > 0 ? stats[0] : null,
      },
    });
  } catch (error) {
    console.error("Error fetching course ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ratings",
      error: error.message,
    });
  }
};

// @desc    Get all ratings given by a specific student
// @route   GET /api/v1/course-ratings/my-ratings
// @access  Private/Student
exports.getStudentCourseRatings = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get ratings for the logged-in student
    const ratings = await CourseRating.find({ student: req.user.id })
      .populate("course", "name")
      .sort({ ratedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await CourseRating.countDocuments({ student: req.user.id });

    res.status(200).json({
      success: true,
      message: "Your course ratings retrieved successfully",
      data: {
        ratings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching student course ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ratings",
      error: error.message,
    });
  }
};

// @desc    Manage course rating status (flag, review, archive) - Admin only
// @route   PATCH /api/v1/course-ratings/:id/status
// @access  Private/Admin/SuperAdmin
exports.manageCourseRatingStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminNote } = req.body;

    // Check authorization - only admin/superAdmin
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to manage course ratings",
      });
    }

    // Find the rating
    const rating = await CourseRating.findById(id);
    if (!rating) {
      return res.status(404).json({
        success: false,
        message: "Rating not found",
      });
    }

    // Validate status value
    const validStatuses = ["submitted", "reviewed", "flagged", "archived"];
    if (status && !validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
      });
    }

    // Update fields
    if (status) rating.status = status;
    if (adminNote) rating.adminNote = adminNote;

    await rating.save();

    // Populate references
    await rating.populate("student", "name email");
    await rating.populate("course", "name");

    res.status(200).json({
      success: true,
      message: "Rating status updated successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error managing course rating status:", error);
    res.status(500).json({
      success: false,
      message: "Error updating rating status",
      error: error.message,
    });
  }
};

// @desc    Get course rating statistics and summary - Admin only
// @route   GET /api/v1/course-ratings/stats/course/:courseId
// @access  Private/Admin/SuperAdmin
exports.getCourseRatingStats = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization - only admin/superAdmin
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view course statistics",
      });
    }

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    const ObjectId = require("mongoose").Types.ObjectId;

    // Get comprehensive statistics using aggregation pipeline
    const stats = await CourseRating.aggregate([
      { $match: { course: new ObjectId(courseId) } },
      {
        $facet: {
          overallStats: [
            {
              $group: {
                _id: null,
                avgContentQuality: { $avg: "$contentQuality" },
                avgRelevance: { $avg: "$relevance" },
                avgDifficultyLevel: { $avg: "$difficultyLevel" },
                avgValueForMoney: { $avg: "$valueForMoney" },
                avgOverallRating: { $avg: "$overallRating" },
                totalRatings: { $sum: 1 },
                minRating: { $min: "$overallRating" },
                maxRating: { $max: "$overallRating" },
              },
            },
          ],
          ratingDistribution: [
            {
              $group: {
                _id: "$overallRating",
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
          statusDistribution: [
            {
              $group: {
                _id: "$status",
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    // Get recent feedback with pagination
    const recentFeedback = await CourseRating.find({
      course: courseId,
      feedback: { $ne: "" },
    })
      .select("feedback suggestions overallRating ratedAt status")
      .populate("student", "name")
      .sort({ ratedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count of feedback items for pagination
    const totalFeedback = await CourseRating.countDocuments({
      course: courseId,
      feedback: { $ne: "" },
    });

    res.status(200).json({
      success: true,
      message: "Course statistics retrieved successfully",
      data: {
        stats: stats[0],
        recentFeedback,
        feedbackPagination: {
          total: totalFeedback,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(totalFeedback / limit),
        },
      },
    });
  } catch (error) {
    console.error("Error fetching course statistics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
};

// @desc    Get public course ratings visible to all enrolled students
// @route   GET /api/v1/course-ratings/public/:courseId
// @access  Private (any authenticated user)
exports.getPublicCourseRatings = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Only show publicly acceptable statuses — hide flagged/archived ratings
    const publicQuery = {
      course: courseId,
      status: { $in: ["submitted", "reviewed"] },
    };

    // Fetch paginated ratings — expose student name only (not email)
    const ratings = await CourseRating.find(publicQuery)
      .populate("student", "name picture")
      .populate("course", "name")
      .select("-adminNote") // never expose admin notes publicly
      .sort({ ratedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await CourseRating.countDocuments(publicQuery);

    // Aggregate stats across ALL public ratings for this course
    const ObjectId = require("mongoose").Types.ObjectId;
    const stats = await CourseRating.aggregate([
      {
        $match: {
          course: new ObjectId(courseId),
          status: { $in: ["submitted", "reviewed"] },
        },
      },
      {
        $facet: {
          averages: [
            {
              $group: {
                _id: null,
                avgContentQuality: { $avg: "$contentQuality" },
                avgRelevance: { $avg: "$relevance" },
                avgDifficultyLevel: { $avg: "$difficultyLevel" },
                avgValueForMoney: { $avg: "$valueForMoney" },
                avgOverallRating: { $avg: "$overallRating" },
                totalRatings: { $sum: 1 },
              },
            },
          ],
          ratingDistribution: [
            {
              $group: {
                _id: "$overallRating",
                count: { $sum: 1 },
              },
            },
            { $sort: { _id: 1 } },
          ],
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Public course ratings retrieved successfully",
      data: {
        ratings,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / parseInt(limit)),
        },
        statistics: stats[0]?.averages[0] || null,
        ratingDistribution: stats[0]?.ratingDistribution || [],
      },
    });
  } catch (error) {
    console.error("Error fetching public course ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching public ratings",
      error: error.message,
    });
  }
};

// @desc    Check if student has already rated a course
// @route   GET /api/v1/course-ratings/check/:courseId
// @access  Private/Student
exports.checkIfRated = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Check if user is a student
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can check ratings",
      });
    }

    const existingRating = await CourseRating.findOne({
      student: req.user.id,
      course: courseId,
    });

    res.status(200).json({
      success: true,
      hasRated: !!existingRating,
      rating: existingRating || null,
    });
  } catch (error) {
    console.error("Error checking rating:", error);
    res.status(500).json({
      success: false,
      message: "Error checking rating",
      error: error.message,
    });
  }
};
