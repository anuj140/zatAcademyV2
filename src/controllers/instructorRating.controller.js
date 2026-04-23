const InstructorRating = require("../models/InstructorRating");
const User = require("../models/User");
const Batch = require("../models/Batch");
const Enrollment = require("../models/Enrollment");

// @desc    Add a rating and feedback for an instructor
// @route   POST /api/v1/instructor-ratings
// @access  Private/Student
exports.addInstructorRating = async (req, res) => {
  try {
    const {
      instructor,
      batch,
      communicationSkills,
      subjectKnowledge,
      teachingMethodology,
      responseToQuestions,
      overallRating,
      feedback,
      suggestions,
      isAnonymous,
    } = req.body;

    // Validate required fields
    if (
      !instructor ||
      !batch ||
      !communicationSkills ||
      !subjectKnowledge ||
      !teachingMethodology ||
      !responseToQuestions ||
      !overallRating
    ) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required rating fields (instructor, batch, and all rating categories)",
      });
    }

    // Check if user is a student
    if (req.user.role !== "student") {
      return res.status(403).json({
        success: false,
        message: "Only students can rate instructors",
      });
    }

    // Verify instructor exists and has instructor role
    const instructorUser = await User.findById(instructor);
    if (!instructorUser || instructorUser.role !== "instructor") {
      return res.status(404).json({
        success: false,
        message: "Instructor not found",
      });
    }

    // Verify batch exists and verify the student is enrolled in this batch
    const batchDoc = await Batch.findById(batch);
    if (!batchDoc) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Verify student is enrolled in the batch
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: batch,
    });
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "You are not enrolled in this batch",
      });
    }

    // Verify the instructor teaches this batch
    if (batchDoc.instructor.toString() !== instructor) {
      return res.status(403).json({
        success: false,
        message: "This instructor does not teach this batch",
      });
    }

    // Check if student has already rated this instructor for this batch
    const existingRating = await InstructorRating.findOne({
      instructor,
      student: req.user.id,
      batch,
    });

    if (existingRating) {
      return res.status(400).json({
        success: false,
        message: "You have already rated this instructor for this batch",
      });
    }

    // Create new rating
    const newRating = await InstructorRating.create({
      instructor,
      student: req.user.id,
      batch,
      communicationSkills,
      subjectKnowledge,
      teachingMethodology,
      responseToQuestions,
      overallRating,
      feedback: feedback || "",
      suggestions: suggestions || "",
      isAnonymous: isAnonymous || false,
    });

    // Populate references
    await newRating.populate("instructor", "name email picture");
    await newRating.populate("student", "name email");
    await newRating.populate("batch", "name");

    res.status(201).json({
      success: true,
      message: "Rating submitted successfully",
      data: newRating,
    });
  } catch (error) {
    console.error("Error adding instructor rating:", error);
    res.status(500).json({
      success: false,
      message: "Error submitting rating",
      error: error.message,
    });
  }
};

// @desc    Update a rating and feedback for an instructor
// @route   PUT /api/v1/instructor-ratings/:id
// @access  Private/Student (own rating) or Admin/SuperAdmin
exports.updateInstructorRating = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      communicationSkills,
      subjectKnowledge,
      teachingMethodology,
      responseToQuestions,
      overallRating,
      feedback,
      suggestions,
      isAnonymous,
    } = req.body;

    // Find the rating
    const rating = await InstructorRating.findById(id);
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
    if (communicationSkills) rating.communicationSkills = communicationSkills;
    if (subjectKnowledge) rating.subjectKnowledge = subjectKnowledge;
    if (teachingMethodology) rating.teachingMethodology = teachingMethodology;
    if (responseToQuestions) rating.responseToQuestions = responseToQuestions;
    if (overallRating) rating.overallRating = overallRating;
    if (feedback !== undefined) rating.feedback = feedback;
    if (suggestions !== undefined) rating.suggestions = suggestions;
    if (isAnonymous !== undefined) rating.isAnonymous = isAnonymous;

    await rating.save();

    // Populate references
    await rating.populate("instructor", "name email picture");
    await rating.populate("student", "name email");
    await rating.populate("batch", "name");

    res.status(200).json({
      success: true,
      message: "Rating updated successfully",
      data: rating,
    });
  } catch (error) {
    console.error("Error updating instructor rating:", error);
    res.status(500).json({
      success: false,
      message: "Error updating rating",
      error: error.message,
    });
  }
};

// @desc    Get all ratings for a specific instructor
// @route   GET /api/v1/instructor-ratings/instructor/:instructorId
// @access  Private/Instructor (own) or Admin/SuperAdmin
exports.getInstructorRatings = async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { batch, page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization
    if (
      req.user.id !== instructorId &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view these ratings",
      });
    }

    // Build query
    let query = { instructor: instructorId, isAnonymous: false };
    if (batch) query.batch = batch;

    // Get ratings
    const ratings = await InstructorRating.find(query)
      .populate("student", "name email")
      .populate("batch", "name course")
      .sort({ ratedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await InstructorRating.countDocuments(query);

    // Calculate statistics
    const stats = await InstructorRating.aggregate([
      { $match: { instructor: new (require("mongoose").Types.ObjectId)(instructorId) } },
      {
        $group: {
          _id: null,
          avgCommunicationSkills: { $avg: "$communicationSkills" },
          avgSubjectKnowledge: { $avg: "$subjectKnowledge" },
          avgTeachingMethodology: { $avg: "$teachingMethodology" },
          avgResponseToQuestions: { $avg: "$responseToQuestions" },
          avgOverallRating: { $avg: "$overallRating" },
          totalRatings: { $sum: 1 },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      message: "Instructor ratings retrieved successfully",
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
    console.error("Error fetching instructor ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ratings",
      error: error.message,
    });
  }
};

// @desc    Get all ratings given by a specific student
// @route   GET /api/v1/instructor-ratings/student/:studentId
// @access  Private/Student (own) or Admin/SuperAdmin
exports.getStudentRatings = async (req, res) => {
  try {
    const { studentId } = req.params;
    const { page = 1, limit = 10 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization
    if (
      req.user.id !== studentId &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view these ratings",
      });
    }

    // Get ratings
    const ratings = await InstructorRating.find({ student: studentId })
      .populate("instructor", "name email picture specialization")
      .populate("batch", "name course")
      .sort({ ratedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await InstructorRating.countDocuments({ student: studentId });

    res.status(200).json({
      success: true,
      message: "Student ratings retrieved successfully",
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
    console.error("Error fetching student ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ratings",
      error: error.message,
    });
  }
};

// @desc    Delete a rating
// @route   DELETE /api/v1/instructor-ratings/:id
// @access  Private/Student (own) or Admin/SuperAdmin
exports.deleteInstructorRating = async (req, res) => {
  try {
    const { id } = req.params;

    const rating = await InstructorRating.findById(id);
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

    await InstructorRating.findByIdAndDelete(id);

    res.status(200).json({
      success: true,
      message: "Rating deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting instructor rating:", error);
    res.status(500).json({
      success: false,
      message: "Error deleting rating",
      error: error.message,
    });
  }
};

// @desc    Get instructor statistics and ratings summary
// @route   GET /api/v1/instructor-ratings/stats/instructor/:instructorId
// @access  Private/Instructor (own) or Admin/SuperAdmin
exports.getInstructorStats = async (req, res) => {
  try {
    const { instructorId } = req.params;
    const { page = 1, limit = 5 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization
    if (
      req.user.id !== instructorId &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view these statistics",
      });
    }

    const ObjectId = require("mongoose").Types.ObjectId;

    // Get comprehensive statistics
    const stats = await InstructorRating.aggregate([
      { $match: { instructor: new ObjectId(instructorId) } },
      {
        $facet: {
          overallStats: [
            {
              $group: {
                _id: null,
                avgCommunicationSkills: { $avg: "$communicationSkills" },
                avgSubjectKnowledge: { $avg: "$subjectKnowledge" },
                avgTeachingMethodology: { $avg: "$teachingMethodology" },
                avgResponseToQuestions: { $avg: "$responseToQuestions" },
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
          batchStats: [
            {
              $group: {
                _id: "$batch",
                avgRating: { $avg: "$overallRating" },
                count: { $sum: 1 },
              },
            },
          ],
        },
      },
    ]);

    // Get recent feedback with pagination
    const recentFeedback = await InstructorRating.find({
      instructor: instructorId,
      feedback: { $ne: "" },
    })
      .select("feedback suggestions overallRating ratedAt")
      .sort({ ratedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count of feedback items for pagination
    const totalFeedback = await InstructorRating.countDocuments({
      instructor: instructorId,
      feedback: { $ne: "" },
    });

    res.status(200).json({
      success: true,
      message: "Instructor statistics retrieved successfully",
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
    console.error("Error fetching instructor statistics:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching statistics",
      error: error.message,
    });
  }
};

// @desc    Get all ratings for batch (admin view)
// @route   GET /api/v1/instructor-ratings/batch/:batchId
// @access  Private/Admin/SuperAdmin
exports.getBatchRatings = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Check authorization - only admin/superAdmin can view batch ratings
    if (req.user.role !== "admin" && req.user.role !== "superAdmin") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view batch ratings",
      });
    }

    // Get ratings
    const ratings = await InstructorRating.find({ batch: batchId })
      .populate("instructor", "name email picture")
      .populate("student", "name email")
      .sort({ ratedAt: -1 })
      .skip(parseInt(skip))
      .limit(parseInt(limit));

    const total = await InstructorRating.countDocuments({ batch: batchId });

    res.status(200).json({
      success: true,
      message: "Batch ratings retrieved successfully",
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
    console.error("Error fetching batch ratings:", error);
    res.status(500).json({
      success: false,
      message: "Error fetching ratings",
      error: error.message,
    });
  }
};
