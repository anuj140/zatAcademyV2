const Doubt = require("../models/Doubt");
const Batch = require("../models/Batch");
const Enrollment = require("../models/Enrollment");
const { sendEmail } = require("../utils/emailService");
const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");

// @desc    Create a new doubt
// @route   POST /api/v1/doubts
// @access  Private/Student
exports.createDoubt = async (req, res) => {
  try {
    const {
      batchId,
      title,
      description,
      category,
      contextType,
      contextId,
      tags,
      isAnonymous,
    } = req.body;

    // Check if student is enrolled in the batch
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: batchId,
      enrollmentStatus: "active",
      accessRevoked: false,
    });
    console.log("enrollment: ", enrollment);

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "Not enrolled in this batch",
      });
    }

    // Check daily doubt limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayDoubts = await Doubt.countDocuments({
      student: req.user.id,
      createdAt: { $gte: today },
    });

    if (todayDoubts >= parseInt(process.env.MAX_DOUBTS_PER_DAY || 10)) {
      return res.status(429).json({
        success: false,
        message: "Daily doubt limit reached. Please try again tomorrow.",
      });
    }

    // Get batch and course info
    const batch = await Batch.findById(batchId).populate("course instructor");

    // Create doubt
    const doubtData = {
      title,
      description,
      student: req.user.id,
      batch: batchId,
      course: batch.course._id,
      category: category || "conceptual",
      contextType,
      contextId,
      tags: tags || [],
      isAnonymous: isAnonymous || false,
    };


    // Handle attachments
    if (req.files && req.files.length > 0) {
      doubtData.attachments = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
      }));
    }

    // Add context title if available
    if (contextType === "lesson" && contextId) {
      const LearningMaterial = require("../models/LearningMaterial");
      const material = await LearningMaterial.findById(contextId);
      if (material) {
        doubtData.contextTitle = material.title;
      }
    } else if (contextType === "assignment" && contextId) {
      const Assignment = require("../models/Assignment");
      const assignment = await Assignment.findById(contextId);
      if (assignment) {
        doubtData.contextTitle = assignment.title;
      }
    }

    const doubt = await Doubt.create(doubtData);

    // Send notification to instructor
    await sendDoubtNotification(doubt, batch, "created");

    // Add student as follower
    doubt.followers.push(req.user.id);
    await doubt.save();

    res.status(201).json({
      success: true,
      message: "Doubt posted successfully",
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reply to a doubt
// @route   POST /api/v1/doubts/:id/reply
// @access  Private (student enrolled/instructor assigned)
exports.replyToDoubt = async (req, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;

    const doubt = await Doubt.findById(id);

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check if user can reply to this doubt
    const canReply = await canUserReplyToDoubt(req.user, doubt);
    if (!canReply) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to reply to this doubt",
      });
    }

    // Create reply
    const reply = {
      user: req.user.id,
      content,
      isInstructorReply:
        req.user.role === "instructor" ||
        req.user.role === "admin" ||
        req.user.role === "superAdmin",
    };

    // Handle attachments in reply
    if (req.files && req.files.length > 0) {
      reply.attachments = req.files.map((file) => ({
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        mimeType: file.mimetype,
      }));
    }

    // Add reply to doubt
    doubt.replies.push(reply);

    // Update doubt status
    if (doubt.status === "open" && reply.isInstructorReply) {
      doubt.status = "answered";
    }

    await doubt.save();

    // Send notifications
    await sendReplyNotification(doubt, reply, req.user);

    res.status(201).json({
      success: true,
      message: "Reply posted successfully",
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get doubts for a batch
// @route   GET /api/v1/batches/:batchId/doubts
// @access  Private (enrolled students/instructor)
exports.getBatchDoubts = async (req, res) => {
  try {
    const { batchId } = req.params;
    const {
      status,
      category,
      hasInstructorReply,
      studentId,
      search,
      limit = 20,
      page = 1,
    } = req.query;

    // Check if user has access to this batch
    const hasAccess = await checkBatchAccess(req.user, batchId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view doubts for this batch",
      });
    }

    // Build query
    const query = { batch: batchId };

    if (status) {
      query.status = status;
    }

    if (category) {
      query.category = category;
    }

    if (hasInstructorReply === "true") {
      query.instructorReplyCount = { $gt: 0 };
    } else if (hasInstructorReply === "false") {
      query.instructorReplyCount = 0;
    }

    if (studentId) {
      query.student = studentId;
    }

    if (search) {
      query.$text = { $search: search };
    }

    // For students, don't show anonymous doubts from other students
    if (req.user.role === "student") {
      query.$or = [{ student: req.user.id }, { isAnonymous: false }];
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const doubts = await Doubt.find(query)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("student", "name email")
      .populate("replies.user", "name email role");

    const total = await Doubt.countDocuments(query);

    // Get statistics
    const batchObjectId = new mongoose.Types.ObjectId(batchId);
    const stats = await Doubt.aggregate([
      { $match: { batch: batchObjectId } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgReplies: { $avg: "$replyCount" },
          avgResolutionTime: { $avg: "$timeToResolution" },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: doubts.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats,
      data: doubts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single doubt
// @route   GET /api/v1/doubts/:id
// @access  Private (enrolled students/instructor)
exports.getDoubt = async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id)
      .populate("student", "name email")
      .populate("batch", "name")
      .populate("course", "title")
      .populate("replies.user", "name email role")
      .populate("resolvedBy", "name");

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check if user can view this doubt
    const canView = await canUserViewDoubt(req.user, doubt);
    if (!canView) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this doubt",
      });
    }

    // Increment view count
    doubt.views += 1;
    await doubt.save();

    res.status(200).json({
      success: true,
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Mark doubt as resolved
// @route   PUT /api/v1/doubts/:id/resolve
// @access  Private/Instructor
exports.resolveDoubt = async (req, res) => {
  try {
    const { id } = req.params;
    const { replyId } = req.body; // Optional: mark a specific reply as solution

    const doubt = await Doubt.findById(id);

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check authorization
    if (!(await canUserManageDoubt(req.user, doubt))) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to resolve this doubt",
      });
    }

    // Update doubt status
    doubt.status = "resolved";
    doubt.resolvedAt = new Date();
    doubt.resolvedBy = req.user.id;

    // Mark a reply as solution if provided
    if (replyId) {
      const replyIndex = doubt.replies.findIndex((r) => r._id.toString() === replyId);
      if (replyIndex !== -1) {
        // Clear previous solution
        doubt.replies.forEach((reply) => {
          reply.isSolution = false;
        });

        // Mark new solution
        doubt.replies[replyIndex].isSolution = true;
        doubt.solutionReply = doubt.replies[replyIndex]._id;
      }
    }

    await doubt.save();

    // Send resolution notification
    await sendDoubtNotification(doubt, null, "resolved");

    res.status(200).json({
      success: true,
      message: "Doubt marked as resolved",
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Upvote/downvote a doubt
// @route   POST /api/v1/doubts/:id/vote
// @access  Private (enrolled students)
exports.voteDoubt = async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body; // 'upvote' or 'downvote'

    const doubt = await Doubt.findById(id);

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check if user is enrolled in the batch
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: doubt.batch,
      enrollmentStatus: "active",
    });

    if (
      !enrollment &&
      req.user.role !== "instructor" &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not enrolled in this batch",
      });
    }

    // Update votes
    const upvoteIndex = doubt.upvotes.indexOf(req.user.id);
    const downvoteIndex = doubt.downvotes.indexOf(req.user.id);
    console.log("req.user.id: ", req.user.id);
    console.log("dobut.upvotes: ", doubt.downvotes);

    if (type === "upvote") {
      if (upvoteIndex === -1) {
        doubt.upvotes.push(req.user.id);
        // Remove from downvotes if exists
        if (downvoteIndex !== -1) {
          doubt.downvotes.splice(downvoteIndex, 1);
        }
      } else {
        doubt.upvotes.splice(upvoteIndex, 1);
      }
    } else if (type === "downvote") {
      if (downvoteIndex === -1) {
        doubt.downvotes.push(req.user.id);
        // Remove from upvotes if exists
        if (upvoteIndex !== -1) {
          doubt.upvotes.splice(upvoteIndex, 1);
        }
      } else {
        doubt.downvotes.splice(downvoteIndex, 1);
      }
    }

    await doubt.save();

    res.status(200).json({
      success: true,
      message: `Doubt ${type}d successfully`,
      data: {
        upvotes: doubt.upvotes.length,
        downvotes: doubt.downvotes.length,
      },
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Follow/unfollow a doubt
// @route   POST /api/v1/doubts/:id/follow
// @access  Private (enrolled students)
exports.followDoubt = async (req, res) => {
  try {
    const { id } = req.params;

    const doubt = await Doubt.findById(id);

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check if user is enrolled in the batch
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: doubt.batch,
      enrollmentStatus: "active",
    });

    if (
      !enrollment &&
      req.user.role !== "instructor" &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not enrolled in this batch",
      });
    }

    // Toggle follow
    const followIndex = doubt.followers.indexOf(req.user.id);

    if (followIndex === -1) {
      doubt.followers.push(req.user.id);
    } else {
      doubt.followers.splice(followIndex, 1);
    }

    await doubt.save();

    res.status(200).json({
      success: true,
      message: followIndex === -1 ? "Following doubt" : "Unfollowed doubt",
      data: {
        followers: doubt.followers.length,
        isFollowing: followIndex === -1,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get instructor's doubt dashboard
// @route   GET /api/v1/instructor/doubts
// @access  Private/Instructor
exports.getInstructorDoubts = async (req, res) => {
  try {
    const { status, priority, batchId, limit = 20, page = 1 } = req.query;

    // Get batches assigned to instructor
    const batches = await Batch.find({ instructor: req.user.id });
    const batchIds = batches.map((b) => b._id);

    if (batchIds.length === 0) {
      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        stats: {},
      });
    }

    // Build query
    const query = { batch: { $in: batchIds } };

    if (batchId) {
      query.batch = batchId;
    }

    if (status) {
      query.status = status;
    }

    if (priority) {
      query.priority = priority;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get doubts
    const doubts = await Doubt.find(query)
      .sort({ priority: -1, createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("student", "name email")
      .populate("batch", "name")
      .populate("replies.user", "name");

    const total = await Doubt.countDocuments(query);

    // Get statistics
    const stats = await Doubt.aggregate([
      { $match: { batch: { $in: batchIds } } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgResponseTime: { $avg: "$timeToFirstReply" },
        },
      },
    ]);

    // Calculate response rate
    const totalDoubts = stats.reduce((sum, stat) => sum + stat.count, 0);
    const answeredDoubts = stats.find((s) => s._id === "answered")?.count || 0;
    const responseRate = totalDoubts > 0 ? (answeredDoubts / totalDoubts) * 100 : 0;

    res.status(200).json({
      success: true,
      count: doubts.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats: {
        total: totalDoubts,
        open: stats.find((s) => s._id === "open")?.count || 0,
        answered: answeredDoubts,
        resolved: stats.find((s) => s._id === "resolved")?.count || 0,
        responseRate,
        averageResponseTime:
          stats.find((s) => s._id === "answered")?.avgResponseTime || 0,
      },
      data: doubts,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Pin/unpin a doubt
// @route   PUT /api/v1/doubts/:id/pin
// @access  Private/Instructor
exports.pinDoubt = async (req, res) => {
  try {
    const doubt = await Doubt.findById(req.params.id);

    if (!doubt) {
      return res.status(404).json({
        success: false,
        message: "Doubt not found",
      });
    }

    // Check authorization
    if (!(await canUserManageDoubt(req.user, doubt))) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to pin/unpin this doubt",
      });
    }

    doubt.isPinned = !doubt.isPinned;
    await doubt.save();

    res.status(200).json({
      success: true,
      message: `Doubt ${doubt.isPinned ? "pinned" : "unpinned"} successfully`,
      data: doubt,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper functions

async function checkBatchAccess(user, batchId) {
  if (user.role === "admin" || user.role === "superAdmin") {
    return true;
  }

  if (user.role === "instructor") {
    const batch = await Batch.findById(batchId);
    return batch && batch.instructor.toString() === user.id;
  }

  if (user.role === "student") {
    const enrollment = await Enrollment.findOne({
      student: user.id,
      batch: batchId,
      enrollmentStatus: "active",
      accessRevoked: false,
    });
    return !!enrollment;
  }

  return false;
}

async function canUserReplyToDoubt(user, doubt) {
  // Admin and super admin can always reply
  if (user.role === "admin" || user.role === "superAdmin") {
    return true;
  }

  // Instructor can reply if assigned to batch
  if (user.role === "instructor") {
    const batch = await Batch.findById(doubt.batch);
    return batch && batch.instructor.toString() === user.id;
  }

  // Student can reply if enrolled in batch and not anonymous
  if (user.role === "student") {
    const enrollment = await Enrollment.findOne({
      student: user.id,
      batch: doubt.batch,
      enrollmentStatus: "active",
    });

    return !!enrollment && !doubt.isAnonymous;
  }

  return false;
}

async function canUserViewDoubt(user, doubt) {
  // Admin and super admin can always view
  if (user.role === "admin" || user.role === "superAdmin") {
    return true;
  }

  // Instructor can view if assigned to batch
  if (user.role === "instructor") {
    const batch = await Batch.findById(doubt.batch);
    return batch && batch.instructor.toString() === user.id;
  }

  // Student can view if enrolled in batch
  if (user.role === "student") {
    const enrollment = await Enrollment.findOne({
      student: user.id,
      batch: doubt.batch,
      enrollmentStatus: "active",
    });

    if (!enrollment) return false;

    // Can't view anonymous doubts from other students
    if (doubt.isAnonymous && doubt.student._id.toString() !== user.id) {
      return false;
    }

    return true;
  }

  return false;
}

async function canUserManageDoubt(user, doubt) {
  // Admin and super admin can always manage
  if (user.role === "admin" || user.role === "superAdmin") {
    return true;
  }

  // Instructor can manage if assigned to batch
  if (user.role === "instructor") {
    const batch = await Batch.findById(doubt.batch);
    return batch && batch.instructor.toString() === user.id;
  }

  return false;
}

async function sendDoubtNotification(doubt, batch, action) {
  try {
    const User = require("../models/User");
    const student = await User.findById(doubt.student);

    if (!student) return;

    const actionTemplates = {
      created: {
        subject: `New Doubt Posted: ${doubt.title}`,
        instructorTemplate: (instructor) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">New Doubt Posted</h2>
            <p>Hello ${instructor.name},</p>
            <p>A student has posted a new doubt in your batch <strong>${batch?.name}</strong>.</p>
            <p><strong>Doubt Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${doubt.title}</li>
              <li><strong>Student:</strong> ${doubt.isAnonymous ? "Anonymous" : student.name}</li>
              <li><strong>Category:</strong> ${doubt.category}</li>
              <li><strong>Posted:</strong> ${new Date(doubt.createdAt).toLocaleString()}</li>
            </ul>
            <a href="${process.env.FRONTEND_URL}/doubts/${doubt._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Doubt
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `,
      },
      resolved: {
        subject: `Doubt Resolved: ${doubt.title}`,
        studentTemplate: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Doubt Resolved</h2>
            <p>Hello ${student.name},</p>
            <p>Your doubt has been marked as resolved by the instructor.</p>
            <p><strong>Doubt:</strong> ${doubt.title}</p>
            <p><strong>Resolved At:</strong> ${new Date(doubt.resolvedAt).toLocaleString()}</p>
            <a href="${process.env.FRONTEND_URL}/doubts/${doubt._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Resolution
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `,
      },
    };

    const template = actionTemplates[action];
    if (!template) return;

    if (action === "created" && batch?.instructor) {
      const instructor = await User.findById(batch.instructor);
      if (instructor && instructor.email) {
        await sendEmail({
          email: instructor.email,
          subject: template.subject,
          html: template.instructorTemplate(instructor),
        });
      }
    } else if (action === "resolved") {
      await sendEmail({
        email: student.email,
        subject: template.subject,
        html: template.studentTemplate(student),
      });

      // Notify followers
      for (const followerId of doubt.followers) {
        if (followerId.toString() !== student._id.toString()) {
          const follower = await User.findById(followerId);
          if (follower && follower.email) {
            await sendEmail({
              email: follower.email,
              subject: `Doubt You're Following Was Resolved: ${doubt.title}`,
              html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                  <h2 style="color: #4F46E5;">Doubt Resolved</h2>
                  <p>Hello ${follower.name},</p>
                  <p>A doubt you were following has been marked as resolved.</p>
                  <p><strong>Doubt:</strong> ${doubt.title}</p>
                  <a href="${process.env.FRONTEND_URL}/doubts/${doubt._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
                    View Resolution
                  </a>
                </div>
              `,
            });
          }
        }
      }
    }
  } catch (error) {
    console.error("Error sending doubt notification:", error);
  }
}

async function sendReplyNotification(doubt, reply, replyUser) {
  try {
    const User = require("../models/User");

    // Get doubt owner
    const doubtOwner = await User.findById(doubt.student);

    // Notify doubt owner if reply is from someone else
    if (doubtOwner && doubtOwner._id.toString() !== replyUser.id && doubtOwner.email) {
      await sendEmail({
        email: doubtOwner.email,
        subject: `New Reply to Your Doubt: ${doubt.title}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">New Reply to Your Doubt</h2>
            <p>Hello ${doubtOwner.name},</p>
            <p>Someone has replied to your doubt.</p>
            <p><strong>Doubt:</strong> ${doubt.title}</p>
            <p><strong>Replied By:</strong> ${replyUser.name} (${replyUser.role})</p>
            <a href="${process.env.FRONTEND_URL}/doubts/${doubt._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Reply
            </a>
          </div>
        `,
      });
    }

    // Notify followers (except the person who replied and doubt owner)
    for (const followerId of doubt.followers) {
      if (
        followerId.toString() !== replyUser.id &&
        followerId.toString() !== doubt.student.toString()
      ) {
        const follower = await User.findById(followerId);
        if (follower && follower.email) {
          await sendEmail({
            email: follower.email,
            subject: `New Reply to Doubt You're Following: ${doubt.title}`,
            html: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
                <h2 style="color: #4F46E5;">New Reply to Doubt</h2>
                <p>Hello ${follower.name},</p>
                <p>There's a new reply to a doubt you're following.</p>
                <p><strong>Doubt:</strong> ${doubt.title}</p>
                <a href="${process.env.FRONTEND_URL}/doubts/${doubt._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
                  View Reply
                </a>
              </div>
            `,
          });
        }
      }
    }
  } catch (error) {
    console.error("Error sending reply notification:", error);
  }
}
