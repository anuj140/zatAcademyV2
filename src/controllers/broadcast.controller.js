const Broadcast = require("../models/Broadcast");
const Notification = require("../models/Notification");
const User = require("../models/User");
const Enrollment = require("../models/Enrollment");
const { emitToUser } = require("../services/socket");

/**
 * @desc    Create a new broadcast & emit notifications
 * @route   POST /api/v1/broadcasts
 * @access  Private (Instructor, Admin, SuperAdmin)
 */
exports.createBroadcast = async (req, res) => {
  try {
    const { title, message, type, targetAudience, targetBatch, targetFilters } = req.body;

    // Validate access
    if (req.user.role === "student") {
      return res.status(403).json({
        success: false,
        message: "Students cannot create broadcasts",
      });
    }

    // Validate targetAudience specifics
    if (targetAudience === "batch" && !targetBatch) {
      return res.status(400).json({
        success: false,
        message: "targetBatch is required when targetAudience is 'batch'",
      });
    }

    if (targetAudience === "custom" && (!targetFilters || Object.keys(targetFilters).length === 0)) {
      return res.status(400).json({
        success: false,
        message: "targetFilters object is required when targetAudience is 'custom'",
      });
    }

    const broadcast = await Broadcast.create({
      title,
      message,
      type,
      targetAudience,
      targetBatch: targetAudience === "batch" ? targetBatch : null,
      targetFilters: targetAudience === "custom" ? targetFilters : {},
      createdBy: req.user._id,
    });

    // ── FAN-OUT: Generate Notification Docs for Target Users ──
    let targetUsers = [];

    if (targetAudience === "all") {
      targetUsers = await User.find({ isActive: true }).select("_id");
    } else if (targetAudience === "students") {
      targetUsers = await User.find({ role: "student", isActive: true }).select("_id");
    } else if (targetAudience === "instructors") {
      targetUsers = await User.find({ role: "instructor", isActive: true }).select("_id");
    } else if (targetAudience === "admins") {
      targetUsers = await User.find({ role: { $in: ["admin", "superAdmin"] }, isActive: true }).select("_id");
    } else if (targetAudience === "batch") {
      // Find all students enrolled in this batch
      const enrollments = await Enrollment.find({
        batch: targetBatch,
        enrollmentStatus: "active",
      }).select("student");
      targetUsers = enrollments.map((e) => ({ _id: e.student }));
    } else if (targetAudience === "custom") {
      // Find students whose enrollments match the custom filter criteria
      // Example: targetFilters = { paymentMethod: "emi" }
      const query = {
        enrollmentStatus: "active",
        ...targetFilters,
      };
      
      const matchEnrollments = await Enrollment.find(query).select("student");
      targetUsers = matchEnrollments.map((e) => ({ _id: e.student }));
      
      // Remove duplicates just in case multiple matching enrollments exist for a student
      const uniqueIds = new Set(targetUsers.map(u => u._id.toString()));
      targetUsers = Array.from(uniqueIds).map(id => ({ _id: id }));
    }

    // Prepare notifications payload
    const expiresAt = Notification.computeExpiresAt(broadcast.type);
    const notificationsToInsert = targetUsers.map((u) => ({
      recipient: u._id,
      broadcast: broadcast._id,
      expiresAt,
    }));

    if (notificationsToInsert.length > 0) {
      // Bulk insert is much faster
      await Notification.insertMany(notificationsToInsert);

      // Emit to connected sockets
      const notificationEventPayload = {
        _id: broadcast._id,
        title: broadcast.title,
        message: broadcast.message,
        type: broadcast.type,
        createdAt: broadcast.createdAt,
      };

      for (const notification of notificationsToInsert) {
        // Only online users will receive this instantly; others get it via DB on next fetch
        emitToUser(notification.recipient, "new_notification", notificationEventPayload);
      }
    }

    res.status(201).json({
      success: true,
      message: `Broadcast sent directly to ${targetUsers.length} users`,
      data: broadcast,
    });
  } catch (error) {
    console.error("Error creating broadcast:", error);
    res.status(500).json({ success: false, message: "Server Error", error: error.message });
  }
};

/**
 * @desc    Get all broadcasts relevant to caller
 * @route   GET /api/v1/broadcasts
 * @access  Private
 */
exports.getAllBroadcasts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;

    const query = { isActive: true };

    // Filter by role/batch if student
    if (req.user.role === "student") {
      const activeEnrollments = await Enrollment.find({
        student: req.user._id,
        enrollmentStatus: "active",
      }).select("batch paymentMethod");
      
      const batchIds = activeEnrollments.map((e) => e.batch);

      // Build logic to match custom filters
      // A custom broadcast applies if ANY of the student's active enrollments match ALL of the targetFilters
      // For MongoDB matching, since targetFilters is a Map, we can query it, but it's simpler to fetch all custom broadcasts and filter in-memory if needed, OR construct a complex query.
      // Since broadcasts target *users* dynamically, and students read *broadcasts* dynamically, we need an efficient way. 
      // Actually, since we use "Fan-out on Write" (Notifications), the student gets the Notification immediately!
      // But `getAllBroadcasts` is showing the *broadcast board*.
      // Let's allow the student to see `all`, `students`, `batch` they are in, OR `custom` broadcasts if their notification exists, OR we can dynamically match `custom` if they have a matching enrollment.
      // For simplicity in the query, we will return 'custom' broadcasts if the student has a matching enrollment attribute.
      
      const customMatches = [];
      for (const e of activeEnrollments) {
        // e.g. e.paymentMethod === 'emi'
        if (e.paymentMethod) { // We can dynamically match on known Enrollment fields stored in targetFilters
           customMatches.push({
             "targetAudience": "custom",
             [`targetFilters.paymentMethod`]: e.paymentMethod
           });
        }
      }

      query.$or = [
        { targetAudience: "all" },
        { targetAudience: "students" },
        { targetAudience: "batch", targetBatch: { $in: batchIds } },
        ...(customMatches.length > 0 ? customMatches : [])
      ];
    }
    // Instructors see: all, instructors, and broadcasts they created
    else if (req.user.role === "instructor") {
      query.$or = [
        { targetAudience: "all" },
        { targetAudience: "instructors" },
        { createdBy: req.user._id },
      ];
    }
    // Admin/Superadmin can see everything
    // (no restrictive $or clause needed)

    const total = await Broadcast.countDocuments(query);
    const broadcasts = await Broadcast.find(query)
      .populate("createdBy", "name role")
      .populate("targetBatch", "name")
      .sort({ createdAt: -1 })
      .skip(startIndex)
      .limit(limit);

    res.status(200).json({
      success: true,
      count: broadcasts.length,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
      },
      data: broadcasts,
    });
  } catch (error) {
    console.error("Error fetching broadcasts:", error);
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * @desc    Get single broadcast by ID
 * @route   GET /api/v1/broadcasts/:id
 * @access  Private
 */
exports.getBroadcastById = async (req, res) => {
  try {
    const broadcast = await Broadcast.findOne({
      _id: req.params.id,
      isActive: true,
    })
      .populate("createdBy", "name role")
      .populate("targetBatch", "name");

    if (!broadcast) {
      return res.status(404).json({ success: false, message: "Broadcast not found" });
    }

    res.status(200).json({
      success: true,
      data: broadcast,
    });
  } catch (error) {
    if (error.kind === "ObjectId") {
      return res.status(404).json({ success: false, message: "Broadcast not found" });
    }
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * @desc    Update a broadcast
 * @route   PATCH /api/v1/broadcasts/:id
 * @access  Private (Creator Admin/SuperAdmin)
 */
exports.updateBroadcast = async (req, res) => {
  try {
    let broadcast = await Broadcast.findById(req.params.id);

    if (!broadcast) {
      return res.status(404).json({ success: false, message: "Broadcast not found" });
    }

    // Verify ownership or roles
    if (
      broadcast.createdBy.toString() !== req.user._id.toString() &&
      !["admin", "superAdmin"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this broadcast",
      });
    }

    const { title, message, type } = req.body; // Can't change audience after creation

    broadcast = await Broadcast.findByIdAndUpdate(
      req.params.id,
      { title, message, type },
      { new: true, runValidators: true }
    );

    res.status(200).json({
      success: true,
      data: broadcast,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};

/**
 * @desc    Delete (soft) a broadcast
 * @route   DELETE /api/v1/broadcasts/:id
 * @access  Private (Creator Admin/SuperAdmin)
 */
exports.deleteBroadcast = async (req, res) => {
  try {
    const broadcast = await Broadcast.findById(req.params.id);

    if (!broadcast) {
      return res.status(404).json({ success: false, message: "Broadcast not found" });
    }

    // Verify ownership or roles
    if (
      broadcast.createdBy.toString() !== req.user._id.toString() &&
      !["admin", "superAdmin"].includes(req.user.role)
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this broadcast",
      });
    }

    broadcast.isActive = false;
    await broadcast.save();

    res.status(200).json({
      success: true,
      message: "Broadcast deleted successfully",
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server Error" });
  }
};
