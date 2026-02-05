const progressService = require("../services/ProgressService");
const Progress = require("../models/Progress");
const Enrollment = require("../models/Enrollment");

// @desc    Get student progress dashboard
// @route   GET /api/v1/student/progress/dashboard
// @access  Private/Student
exports.getStudentProgressDashboard = async (req, res) => {
  try {
    const dashboard = await progressService.getStudentDashboard(req.user.id);

    res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get progress for a specific batch
// @route   GET /api/v1/batches/:batchId/progress
// @access  Private (student enrolled/instructor assigned)
exports.getBatchProgress = async (req, res) => {
  try {
    const { batchId } = req.params;

    // Check if user has access to this batch
    const hasAccess = await checkBatchProgressAccess(req.user, batchId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view progress for this batch",
      });
    }

    let progress;

    if (req.user.role === "student") {
      // Get student's progress for this batch
      progress = await Progress.findOne({
        student: req.user.id,
        batch: batchId,
      });

      if (!progress) {
        progress = await progressService.calculateStudentProgress(req.user.id, batchId);
      }

      res.status(200).json({
        success: true,
        data: progress,
      });
    } else if (
      req.user.role === "instructor" ||
      req.user.role === "admin" ||
      req.user.role === "superAdmin"
    ) {
      // Get instructor dashboard for this batch
      const dashboard = await progressService.getInstructorBatchDashboard(
        batchId,
        req.user.id,
      );

      res.status(200).json({
        success: true,
        data: dashboard,
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update material progress
// @route   PUT /api/v1/progress/materials/:materialId
// @access  Private/Student
exports.updateMaterialProgress = async (req, res) => {
  try {
    //1. Get the 'materialId' from url (means req.params)
    const { materialId } = req.params;
    //2. Extract batchId, status, progress, timeSpent, notes from request body
    const { batchId, status, progress, timeSpent, notes } = req.body;

    // Verify student is enrolled in the batch
    //3. Find the student by taking thier id, provided batchId and with enrollment status set to active
    //-- to able to update material
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: batchId,
      enrollmentStatus: "active",
    });

    //4. If not enrollment found return 'Not enrolled in this batch'
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "Not enrolled in this batch",
      });
    }

    // Verify material belongs to batch
    const LearningMaterial = require("../models/LearningMaterial");
    //5. Check if learning material belong to the batch, that student provide (i.e batchId) and it should be publish
    const material = await LearningMaterial.findOne({
      _id: materialId,
      batch: batchId,
      isPublished: true,
    });
    //6. If leanring material not found return 'Material not found in this batch'
    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Material not found in this batch",
      });
    }

    // Update progress
    //# After validating student enrollment & material
    const updatedProgress = await progressService.updateMaterialProgress(
      req.user.id,
      batchId,
      materialId,
      { status, progress, timeSpent, notes, lastAccessed: new Date() },
    );
    res.status(200).json({
      success: true,
      message: "Material progress updated",
      data: updatedProgress,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get at-risk students for a batch
// @route   GET /api/v1/batches/:batchId/at-risk-students
// @access  Private/Instructor
exports.getAtRiskStudents = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { threshold } = req.query;

    // Check authorization
    const Batch = require("../models/Batch");
    const batch = await Batch.findById(batchId);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view at-risk students for this batch",
      });
    }

    const atRiskStudents = await progressService.identifyAtRiskStudents(
      batchId,
      parseInt(threshold) || 60,
    );

    res.status(200).json({
      success: true,
      count: atRiskStudents.length,
      data: atRiskStudents,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Calculate progress for all students in a batch
// @route   POST /api/v1/batches/:batchId/progress/calculate
// @access  Private/Instructor
exports.calculateBatchProgress = async (req, res) => {
  try {
    const { batchId } = req.params;

    // Check authorization
    const Batch = require("../models/Batch");
    const batch = await Batch.findById(batchId);

    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to calculate progress for this batch",
      });
    }

    const results = await progressService.calculateBatchProgress(batchId);

    res.status(200).json({
      success: true,
      message: "Progress calculation completed",
      data: {
        total: results.length,
        successful: results.filter((r) => r.success).length,
        failed: results.filter((r) => !r.success).length,
        results,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get progress trends for a student
// @route   GET /api/v1/student/progress/trend
// @access  Private/Student
exports.getProgressTrend = async (req, res) => {
  try {
    // Get all active enrollments
    const enrollments = await Enrollment.find({
      student: req.user.id,
      enrollmentStatus: "active",
    }).populate("batch", "name");

    const trends = [];

    for (const enrollment of enrollments) {
      const progress = await Progress.findOne({
        student: req.user.id,
        batch: enrollment.batch._id,
      });

      if (progress) {
        // Get historical progress data (simplified - would need a separate history collection)
        trends.push({
          batchId: enrollment.batch._id,
          batchName: enrollment.batch.name,
          currentProgress: progress.overallProgress,
          materialProgress: progress.materialCompletionPercentage,
          assignmentProgress: progress.assignmentCompletionPercentage,
          attendance: progress.attendancePercentage,
          lastUpdated: progress.updatedAt,
          isAtRisk: progress.isAtRisk,
        });
      }
    }

    // Sort by progress (lowest first for attention)
    trends.sort((a, b) => a.currentProgress - b.currentProgress);

    res.status(200).json({
      success: true,
      count: trends.length,
      data: trends,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get instructor's progress overview
// @route   GET /api/v1/instructor/progress/overview
// @access  Private/Instructor
exports.getInstructorProgressOverview = async (req, res) => {
  try {
    // Get batches assigned to instructor
    const Batch = require("../models/Batch");
    const batches = await Batch.find({ instructor: req.user.id });

    const overview = {
      totalBatches: batches.length,
      activeBatches: batches.filter((b) => b.isActive).length,
      totalStudents: 0,
      averageProgress: 0,
      atRiskCount: 0,
      batchDetails: [],
    };

    let totalProgress = 0;
    let batchCount = 0;

    for (const batch of batches) {
      // Get enrollment count
      const enrollmentCount = await Enrollment.countDocuments({
        batch: batch._id,
        enrollmentStatus: "active",
      });

      overview.totalStudents += enrollmentCount;

      // Get progress stats for this batch
      const progresses = await Progress.find({ batch: batch._id });

      if (progresses.length > 0) {
        const batchProgress =
          progresses.reduce((sum, p) => sum + (p.overallProgress || 0), 0) /
          progresses.length;
        const atRiskStudents = progresses.filter((p) => p.isAtRisk).length;

        totalProgress += batchProgress;
        batchCount++;

        overview.atRiskCount += atRiskStudents;

        overview.batchDetails.push({
          batchId: batch._id,
          batchName: batch.name,
          studentCount: enrollmentCount,
          averageProgress: batchProgress,
          atRiskStudents,
          startDate: batch.startDate,
          endDate: batch.endDate,
          isActive: batch.isActive,
        });
      }
    }

    if (batchCount > 0) {
      overview.averageProgress = totalProgress / batchCount;
    }

    // Sort batches by at-risk students (most first)
    overview.batchDetails.sort((a, b) => b.atRiskStudents - a.atRiskStudents);

    res.status(200).json({
      success: true,
      data: overview,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function
async function checkBatchProgressAccess(user, batchId) {
  if (user.role === "admin" || user.role === "superAdmin") {
    return true;
  }

  if (user.role === "instructor") {
    const Batch = require("../models/Batch");
    const batch = await Batch.findById(batchId);
    return batch && batch.instructor.toString() === user.id;
  }

  if (user.role === "student") {
    const enrollment = await Enrollment.findOne({
      student: user.id,
      batch: batchId,
      enrollmentStatus: "active",
    });
    return !!enrollment;
  }

  return false;
}
