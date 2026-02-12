const LiveSession = require("../models/LiveSession");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const videoService = require("../services/videoService");
const {
  validateSessionTiming,
  sendSessionNotifications,
} = require("../utils/sessionUtils");

// @desc    Create live session
// @route   POST /api/v1/live-sessions
// @access  Private/Instructor
exports.createLiveSession = async (req, res) => {
  try {
    const { batch: batchId, startTime, endTime, duration } = req.body;

    // Validate batch exists and instructor is assigned
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Check if instructor is assigned to this batch
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "You are not assigned to this batch",
      });
    }

    // Validate session timing
    const timingValidation = await validateSessionTiming(
      batchId,
      new Date(startTime),
      new Date(endTime),
    );

    if (!timingValidation.valid) {
      return res.status(400).json({
        success: false,
        message: timingValidation.message,
        conflicts: timingValidation.conflicts,
      });
    }

    // Create video session
    const videoSession = await videoService.createSession(req.body, req.user);

    // Create live session record
    const sessionData = {
      ...req.body,
      course: batch.course,
      instructor: batch.instructor,
      provider: videoSession.provider,
      meetingId: videoSession.meetingId,
      meetingPassword: videoSession.meetingPassword,
      joinUrl: videoSession.joinUrl,
      startUrl: videoSession.startUrl,
      roomId: videoSession.roomId,
      roomSecret: videoSession.roomSecret,
      createdBy: req.user.id,
    };

    const liveSession = await LiveSession.create(sessionData);

    // Send notifications
    await sendSessionNotifications(liveSession, "created");

    res.status(201).json({
      success: true,
      message: "Live session created successfully",
      data: liveSession,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all sessions for a batch
// @route   GET /api/v1/batches/:batchId/sessions
// @access  Private (instructor/students enrolled)
exports.getBatchSessions = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { status, type, from, to, limit = 20, page = 1 } = req.query;

    // Check batch access
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: "Batch not found",
      });
    }

    // Build query
    const query = { batch: batchId };

    // Status filter
    if (status === "upcoming") {
      query.startTime = { $gt: new Date() };
      query.status = "scheduled";
    } else if (status === "ongoing") {
      query.startTime = { $lte: new Date() };
      query.endTime = { $gte: new Date() };
      query.status = { $in: ["scheduled", "ongoing"] };
    } else if (status === "past") {
      query.endTime = { $lt: new Date() };
    } else if (status) {
      query.status = status;
    }

    // Type filter
    if (type) {
      query.sessionType = type;
    }

    // Date range filter
    if (from || to) {
      query.startTime = {};
      if (from) query.startTime.$gte = new Date(from);
      if (to) query.startTime.$lte = new Date(to);
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query
    const sessions = await LiveSession.find(query)
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("instructor", "name email");

    const total = await LiveSession.countDocuments(query);

    res.status(200).json({
      success: true,
      count: sessions.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      data: sessions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single session
// @route   GET /api/v1/live-sessions/:id
// @access  Private
exports.getLiveSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id)
      .populate("batch", "name schedule")
      .populate("course", "title")
      .populate("instructor", "name email avatar")
      .populate("attendees.student", "name email");

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    res.status(200).json({
      success: true,
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update session
// @route   PUT /api/v1/live-sessions/:id
// @access  Private/Instructor
exports.updateLiveSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check authorization
    if (
      session.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this session",
      });
    }

    // Check if session can be updated
    if (session.status === "completed" || session.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Cannot update completed or cancelled session",
      });
    }

    // If updating timing, validate
    if (req.body.startTime || req.body.endTime) {
      const newStartTime = req.body.startTime
        ? new Date(req.body.startTime)
        : session.startTime;
      const newEndTime = req.body.endTime 
        ? new Date(req.body.endTime) 
        : session.endTime;

      const timingValidation = await validateSessionTiming(
        session.batch,
        newStartTime,
        newEndTime,
        session._id,
      );

      if (!timingValidation.valid) {
        return res.status(400).json({
          success: false,
          message: timingValidation.message,
          conflicts: timingValidation.conflicts,
        });
      }
    }

    // Update session fields manually
    if (req.body.title !== undefined) session.title = req.body.title;
    if (req.body.description !== undefined) session.description = req.body.description;
    if (req.body.startTime !== undefined) session.startTime = new Date(req.body.startTime);
    if (req.body.endTime !== undefined) session.endTime = new Date(req.body.endTime);
    if (req.body.duration !== undefined) session.duration = req.body.duration;
    if (req.body.sessionType !== undefined) session.sessionType = req.body.sessionType;
    if (req.body.status !== undefined) session.status = req.body.status;
    
    // Save the session (validators will run correctly now)
    const updatedSession = await session.save();

    // Update video session if needed
    if (req.body.startTime || req.body.title) {
      await videoService.updateSession(session.meetingId, {
        topic: req.body.title || session.title,
        start_time: req.body.startTime || session.startTime,
      });
    }

    // Send notifications if timing changed
    if (req.body.startTime || req.body.endTime) {
      await sendSessionNotifications(updatedSession, "updated");
    }

    res.status(200).json({
      success: true,
      message: "Session updated successfully",
      data: updatedSession,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Cancel session
// @route   PUT /api/v1/live-sessions/:id/cancel
// @access  Private/Instructor
exports.cancelLiveSession = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check authorization
    if (
      session.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to cancel this session",
      });
    }

    // Check if session can be cancelled
    if (session.status === "cancelled") {
      return res.status(400).json({
        success: false,
        message: "Session is already cancelled",
      });
    }

    if (session.status === "completed") {
      return res.status(400).json({
        success: false,
        message: "Cannot cancel completed session",
      });
    }

    // Update session
    session.status = "cancelled";
    session.cancelledAt = new Date();
    session.cancelledBy = req.user.id;
    session.cancellationReason = req.body.reason;
    await session.save();

    // Cancel video session
    await videoService.deleteSession(session.meetingId);

    // Send notifications
    await sendSessionNotifications(session, "cancelled");

    res.status(200).json({
      success: true,
      message: "Session cancelled successfully",
      data: session,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get session join link
// @route   GET /api/v1/live-sessions/:id/join-link
// @access  Private (student enrolled/instructor assigned)
exports.getSessionJoinLink = async (req, res) => {
  try {
    const session = await LiveSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Generate appropriate link based on user role
    let joinLink;
    if (
      req.user.role === "instructor" ||
      req.user.role === "admin" ||
      req.user.role === "superAdmin"
    ) {
      joinLink = videoService.getInstructorStartLink(session, req.user.id);
    } else {
      joinLink = videoService.getStudentJoinLink(session);
    }

    // Generate access token for frontend
    const { generateSessionAccessToken } = require("../utils/sessionUtils");
    const accessToken = generateSessionAccessToken(
      req.user.id,
      session._id,
      req.user.role,
    );

    res.status(200).json({
      success: true,
      data: {
        joinLink,
        accessToken,
        session: {
          id: session._id,
          title: session.title,
          startTime: session.startTime,
          endTime: session.endTime,
          status: session.status,
        },
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Record attendance
// @route   POST /api/v1/live-sessions/:id/attendance
// @access  Private/System (called by video system)
exports.recordAttendance = async (req, res) => {
  try {
    const { studentId, action } = req.body; // action: 'join' or 'leave'

    const session = await LiveSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check if student is enrolled in the batch
    const Enrollment = require("../models/Enrollment");
    const enrollment = await Enrollment.findOne({
      student: studentId,
      batch: session.batch,
      enrollmentStatus: "active",
    });

    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: "Student not enrolled in this batch",
      });
    }

    const now = new Date();

    if (action === "join") {
      // Check if already in attendees
      const existingAttendance = session.attendees.find(
        (a) => a.student.toString() === studentId && !a.leftAt,
      );

      if (!existingAttendance) {
        session.attendees.push({
          student: studentId,
          joinedAt: now,
        });
      }
    } else if (action === "leave") {
      // Find the attendance record
      const attendance = session.attendees.find(
        (a) => a.student.toString() === studentId && !a.leftAt,
      );

      if (attendance) {
        attendance.leftAt = now;
        attendance.duration = Math.round((now - attendance.joinedAt) / (1000 * 60)); // minutes
      }
    }

    await session.save();

    res.status(200).json({
      success: true,
      message: `Attendance ${action} recorded`,
      data: session.attendees,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get instructor dashboard sessions
// @route   GET /api/v1/instructor/sessions
// @access  Private/Instructor
exports.getInstructorSessions = async (req, res) => {
  try {
    const { status, upcoming, past, limit = 20, page = 1 } = req.query;

    // Build query for instructor's sessions
    const query = { instructor: req.user.id };

    if (status) {
      query.status = status;
    } else if (upcoming === "true") {
      query.startTime = { $gt: new Date() };
      query.status = "scheduled";
    } else if (past === "true") {
      query.endTime = { $lt: new Date() };
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const sessions = await LiveSession.find(query)
      .sort({ startTime: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("batch", "name currentStudents maxStudents")
      .populate("course", "title thumbnail");

    const total = await LiveSession.countDocuments(query);

    // Get statistics
    const stats = await LiveSession.aggregate([
      { $match: { instructor: req.user._id } },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          totalStudents: { $sum: { $size: "$attendees" } },
        },
      },
    ]);

    res.status(200).json({
      success: true,
      count: sessions.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats,
      data: sessions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Upload session recording
// @route   POST /api/v1/live-sessions/:id/recording
// @access  Private/Instructor
exports.uploadRecording = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: "Please upload a recording file",
      });
    }

    const session = await LiveSession.findById(req.params.id);

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "Session not found",
      });
    }

    // Check authorization
    if (
      session.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to upload recording for this session",
      });
    }

    // Update session with recording details
    session.recordingUrl = req.file.path;
    session.recordingPublicId = req.file.filename;
    await session.save();

    // Create session material for the recording
    const SessionMaterial = require("../models/SessionMaterial");
    await SessionMaterial.create({
      title: `Recording: ${session.title}`,
      description: `Session recording from ${session.startTime}`,
      liveSession: session._id,
      batch: session.batch,
      course: session.course,
      materialType: "recording",
      fileType: "video",
      file: {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      },
      uploadedBy: req.user.id,
    });

    res.status(200).json({
      success: true,
      message: "Recording uploaded successfully",
      data: {
        recordingUrl: req.file.path,
        sessionId: session._id,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
