const Assignment = require("../models/Assignment");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const { sendEmail } = require("../utils/emailService");
const Enrollment = require("../models/Enrollment");
const mongoose = require("mongoose");

// @desc    Create assignment
// @route   POST /api/v1/batches/:batchId/assignments
// @access  Private/Instructor
//TODO: No way to upload files and link (allowSubmission type: text, file, quiz and code)
exports.createAssignment = async (req, res) => {
  try {
    const { batchId } = req.params;

    // Check batch exists and user is instructor
    const batch = await Batch.findById(batchId).populate("course");
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
        message: "Not authorized to create assignments for this batch",
      });
    }

    const assignmentData = {
      ...req.body,
      batch: batchId,
      course: batch.course._id,
      createdBy: req.user.id,
    };

    // Set passing marks if not provided (default 40%)
    if (!assignmentData.passingMarks) {
      assignmentData.passingMarks = Math.floor(assignmentData.maxMarks * 0.4);
    }

    const assignment = await Assignment.create(assignmentData);

    // Send notification to enrolled students if assignment is published
    if (assignment.isPublished) {
      await sendAssignmentNotification(assignment, batch, "created");
    }

    res.status(201).json({
      success: true,
      message: "Assignment created successfully",
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all assignments for a batch
// @route   GET /api/v1/batches/:batchId/assignments
// @access  Private (enrolled students/instructor)
exports.getBatchAssignments = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { status, week, isPublished = true, limit = 20, page = 1 } = req.query;

    // Build query
    const query = { batch: batchId };

    // Filter by status
    if (status === "upcoming") {
      query.startDate = { $gt: new Date() };
      query.isPublished = true;
      query.isActive = true;
    } else if (status === "open") {
      const now = new Date();
      query.startDate = { $lte: now };
      query.$or = [
        { deadline: { $gte: now } },
        {
          allowLateSubmission: true,
          lateSubmissionDeadline: { $gte: now },
        },
      ];
      query.isPublished = true;
      query.isActive = true;
    } else if (status === "closed") {
      const now = new Date();
      query.$or = [
        {
          deadline: { $lt: now },
          allowLateSubmission: false,
        },
        {
          allowLateSubmission: true,
          lateSubmissionDeadline: { $lt: now },
        },
      ];
    } else if (status === "draft") {
      query.isPublished = false;
    }

    // Filter by week if provided
    if (week) {
      query.week = parseInt(week);
    }

    // For students, only show published assignments
    if (req.user.role === "student") {
      query.isPublished = true;
      query.isActive = true;

      // Check if assignment has started
      const now = new Date();
      query.$or = [
        { startDate: { $lte: now } },
        // Show upcoming assignments 24 hours in advance
        {
          startDate: {
            $gt: now,
            $lte: new Date(now.getTime() + 24 * 60 * 60 * 1000),
          },
        },
      ];
    } else {
      // Instructor/admin can see all, filtered by isPublished if specified
      if (isPublished !== undefined) {
        query.isPublished = isPublished === "true";
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const assignments = await Assignment.find(query)
      .sort({ deadline: 1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Assignment.countDocuments(query);

    // Get statistics for instructor
    let stats = null;
    if (
      req.user.role === "instructor" ||
      req.user.role === "admin" ||
      req.user.role === "superAdmin"
    ) {
      const Submission = require("../models/Submission");

      const assignmentIds = assignments.map((a) => a._id);
      const submissionStats = await Submission.aggregate([
        { $match: { assignment: { $in: assignmentIds } } },
        {
          $group: {
            _id: "$assignment",
            submitted: {
              $sum: {
                $cond: [{ $in: ["$status", ["submitted", "graded"]] }, 1, 0],
              },
            },
            graded: { $sum: { $cond: [{ $eq: ["$isGraded", true] }, 1, 0] } },
          },
        },
      ]);

      // Map stats to assignments
      const statsMap = {};
      submissionStats.forEach((stat) => {
        statsMap[stat._id.toString()] = {
          submitted: stat.submitted,
          graded: stat.graded,
        };
      });

      assignments.forEach((assignment) => {
        assignment._doc.stats = statsMap[assignment._id.toString()] || {
          submitted: 0,
          graded: 0,
        };
      });

      // Get overall batch stats
      const batchStats = await calculateAssignmentStats(batchId);
      stats = batchStats;
    }

    res.status(200).json({
      success: true,
      count: assignments.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats,
      data: assignments,
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single assignment
// @route   GET /api/v1/assignments/:id
// @access  Private (enrolled students/instructor)
exports.getAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id)
      .populate("batch", "name instructor")
      .populate("course", "title")
      .populate("createdBy", "name email");

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // For students, check if they have submitted
    let studentSubmission = null;
    if (req.user.role === "student") {
      const Submission = require("../models/Submission");
      studentSubmission = await Submission.findOne({
        assignment: assignment._id,
        student: req.user.id,
      });
    }

    // For instructor, get submission statistics
    let submissionStats = null;
    if (
      req.user.role === "instructor" ||
      req.user.role === "admin" ||
      req.user.role === "superAdmin"
    ) {
      const Submission = require("../models/Submission");
      const submissions = await Submission.find({
        assignment: assignment._id,
      });

      submissionStats = {
        total: submissions.length,
        submitted: submissions.filter(
          (s) => s.status === "submitted" || s.status === "graded",
        ).length,
        graded: submissions.filter((s) => s.isGraded).length,
        late: submissions.filter((s) => s.isLate).length,
      };
    }

    res.status(200).json({
      success: true,
      data: {
        assignment,
        studentSubmission,
        submissionStats,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update assignment
// @route   PUT /api/v1/assignments/:id
// @access  Private/Instructor
exports.updateAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Check authorization
    if (
      assignment.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this assignment",
      });
    }

    // Check if assignment can be updated (if submissions exist)
    if (assignment.submissionCount > 0) {
      // Restrict certain updates
      const restrictedFields = ["maxMarks", "submissionType", "allowedFileTypes"];
      const hasRestrictedUpdate = Object.keys(req.body).some((key) =>
        restrictedFields.includes(key),
      );

      if (hasRestrictedUpdate) {
        return res.status(400).json({
          success: false,
          message: "Cannot update assignment properties after submissions have been made",
        });
      }
    }

    req.body.updatedBy = req.user.id;

    const updatedAssignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    // Send notification if assignment was unpublished and now published
    if (!assignment.isPublished && updatedAssignment.isPublished) {
      const batch = await Batch.findById(updatedAssignment.batch).populate("course");
      await sendAssignmentNotification(updatedAssignment, batch, "published");
    }

    // Send notification if deadline changed
    if (assignment.deadline.getTime() !== updatedAssignment.deadline.getTime()) {
      const batch = await Batch.findById(updatedAssignment.batch).populate("course");
      await sendAssignmentNotification(updatedAssignment, batch, "updated");
    }

    res.status(200).json({
      success: true,
      message: "Assignment updated successfully",
      data: updatedAssignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete assignment
// @route   DELETE /api/v1/assignments/:id
// @access  Private/Instructor
exports.deleteAssignment = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Check authorization
    if (
      assignment.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this assignment",
      });
    }

    // Check if submissions exist
    if (assignment.submissionCount > 0) {
      return res.status(400).json({
        success: false,
        message: "Cannot delete assignment that has submissions",
      });
    }

    await assignment.deleteOne();

    res.status(200).json({
      success: true,
      message: "Assignment deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Publish/unpublish assignment
// @route   PUT /api/v1/assignments/:id/publish
// @access  Private/Instructor
exports.togglePublish = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Check authorization
    if (
      assignment.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to publish/unpublish this assignment",
      });
    }

    assignment.isPublished = !assignment.isPublished;
    assignment.updatedBy = req.user.id;
    await assignment.save();

    // Send notification if publishing
    if (assignment.isPublished) {
      const batch = await Batch.findById(assignment.batch).populate("course");
      await sendAssignmentNotification(assignment, batch, "published");
    }

    res.status(200).json({
      success: true,
      message: `Assignment ${assignment.isPublished ? "published" : "unpublished"} successfully`,
      data: assignment,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get assignment submissions (for instructor)
// @route   GET /api/v1/assignments/:id/submissions
// @access  Private/Instructor
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, graded, late, limit = 20, page = 1 } = req.query;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(assignment.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view submissions for this assignment",
      });
    }

    // Build query
    const query = { assignment: id };

    if (status) {
      query.status = status;
    }

    if (graded === "true") {
      query.isGraded = true;
    } else if (graded === "false") {
      query.isGraded = false;
    }

    if (late === "true") {
      query.isLate = true;
    } else if (late === "false") {
      query.isLate = false;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("student", "name email")
      .populate("gradedBy", "name");

    const total = await Submission.countDocuments(query);

    // Get statistics
    const stats = await calculateSubmissionStats(id);

    res.status(200).json({
      success: true,
      count: submissions.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats,
      data: submissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function to send assignment notifications
async function sendAssignmentNotification(assignment, batch, action) {
  try {
    const enrollments = await Enrollment.find({
      batch: assignment.batch,
      enrollmentStatus: "active",
    }).populate("student", "name email");

    const actionTemplates = {
      created: {
        subject: `New Assignment: ${assignment.title}`,
        template: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">New Assignment Posted</h2>
            <p>Hello ${student.name},</p>
            <p>A new assignment has been posted for your batch <strong>${batch.name}</strong>.</p>
            <p><strong>Assignment Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${assignment.title}</li>
              <li><strong>Deadline:</strong> ${new Date(assignment.deadline).toLocaleString()}</li>
              <li><strong>Maximum Marks:</strong> ${assignment.maxMarks}</li>
              ${assignment.passingMarks ? `<li><strong>Passing Marks:</strong> ${assignment.passingMarks}</li>` : ""}
            </ul>
            <a href="${process.env.FRONTEND_URL}/assignments/${assignment._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Assignment
            </a>
            <p>Please submit your assignment before the deadline.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `,
      },
      published: {
        subject: `Assignment Now Available: ${assignment.title}`,
        template: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Assignment Now Available</h2>
            <p>Hello ${student.name},</p>
            <p>An assignment has been published for your batch <strong>${batch.name}</strong>.</p>
            <p><strong>Assignment Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${assignment.title}</li>
              <li><strong>Start Date:</strong> ${new Date(assignment.startDate).toLocaleString()}</li>
              <li><strong>Deadline:</strong> ${new Date(assignment.deadline).toLocaleString()}</li>
              <li><strong>Maximum Marks:</strong> ${assignment.maxMarks}</li>
            </ul>
            <a href="${process.env.FRONTEND_URL}/assignments/${assignment._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Assignment
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `,
      },
      updated: {
        subject: `Assignment Updated: ${assignment.title}`,
        template: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Assignment Updated</h2>
            <p>Hello ${student.name},</p>
            <p>An assignment for your batch <strong>${batch.name}</strong> has been updated.</p>
            <p><strong>Updated Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${assignment.title}</li>
              <li><strong>New Deadline:</strong> ${new Date(assignment.deadline).toLocaleString()}</li>
              ${assignment.allowLateSubmission ? `<li><strong>Late Submission:</strong> Allowed until ${new Date(assignment.lateSubmissionDeadline).toLocaleString()}</li>` : ""}
            </ul>
            <a href="${process.env.FRONTEND_URL}/assignments/${assignment._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Updated Assignment
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `,
      },
    };

    const template = actionTemplates[action];
    if (!template) return;

    for (const enrollment of enrollments) {
      if (enrollment.student && enrollment.student.email) {
        await sendEmail({
          email: enrollment.student.email,
          subject: template.subject,
          html: template.template(enrollment.student),
        });
      }
    }

    console.log(
      `Assignment ${action} notifications sent to ${enrollments.length} students`,
    );
  } catch (error) {
    console.error("Error sending assignment notifications:", error);
  }
}

// Helper function to calculate assignment stats
async function calculateAssignmentStats(batchId) {
  const Submission = require("../models/Submission");
  const batchObjectId = new mongoose.Types.ObjectId(batchId);

  const stats = await Submission.aggregate([
    {
      $lookup: {
        from: "assignments",
        localField: "assignment",
        foreignField: "_id",
        as: "assignmentInfo",
      },
    },
    { $unwind: "$assignmentInfo" },
    { $match: { "assignmentInfo.batch": batchObjectId } },
    {
      $group: {
        _id: null,
        totalSubmissions: { $sum: 1 },
        gradedSubmissions: { $sum: { $cond: [{ $eq: ["$isGraded", true] }, 1, 0] } },
        lateSubmissions: { $sum: { $cond: [{ $eq: ["$isLate", true] }, 1, 0] } },
        averageScore: { $avg: "$marksObtained" },
      },
    },
  ]);

  return (
    stats[0] || {
      totalSubmissions: 0,
      gradedSubmissions: 0,
      lateSubmissions: 0,
      averageScore: 0,
    }
  );
}

// Helper function to calculate submission stats
async function calculateSubmissionStats(assignmentId) {
  const Submission = require("../models/Submission");

  const stats = await Submission.aggregate([
    { $match: { assignment: batchObjectId } },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        submitted: {
          $sum: { $cond: [{ $in: ["$status", ["submitted", "graded"]] }, 1, 0] },
        },
        graded: { $sum: { $cond: [{ $eq: ["$isGraded", true] }, 1, 0] } },
        late: { $sum: { $cond: [{ $eq: ["$isLate", true] }, 1, 0] } },
        averageScore: { $avg: "$marksObtained" },
        highestScore: { $max: "$marksObtained" },
        lowestScore: { $min: "$marksObtained" },
      },
    },
  ]);

  return (
    stats[0] || {
      total: 0,
      submitted: 0,
      graded: 0,
      late: 0,
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
    }
  );
}
