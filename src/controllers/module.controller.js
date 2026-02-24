const Module = require("../models/Module");
const Course = require("../models/Course");
const LiveSession = require("../models/LiveSession");
const Assignment = require("../models/Assignment");
const LearningMaterial = require("../models/LearningMaterial");

// @desc    Create a new module for a course
// @route   POST /api/v1/modules
// @access  Private/Admin
exports.createModule = async (req, res) => {
  try {
    const {
      courseId,
      title,
      description,
      sequence,
      startDate,
      endDate,
      learningObjectives,
      estimatedDuration,
      durationUnit,
    } = req.body;

    // Validate required fields
    if (!courseId || !title || !sequence || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: courseId, title, sequence, startDate, endDate",
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

    // Check if sequence already exists for this course
    const existingModule = await Module.findOne({ course: courseId, sequence });
    if (existingModule) {
      return res.status(400).json({
        success: false,
        message: `Module with sequence ${sequence} already exists for this course`,
      });
    }

    const moduleData = {
      title,
      description,
      course: courseId,
      sequence,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      createdBy: req.user.id,
      learningObjectives: learningObjectives || [],
      estimatedDuration: estimatedDuration || 0,
      durationUnit: durationUnit || "hours",
    };

    const module = await Module.create(moduleData);

    // Update course's totalModules
    const totalModules = await Module.countDocuments({ course: courseId });
    await Course.findByIdAndUpdate(courseId, { $set: { totalModules } });

    res.status(201).json({
      success: true,
      data: module,
    });
  } catch (error) {
    console.error("Error creating module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all modules for a course
// @route   GET /api/v1/modules/course/:courseId
// @access  Public
exports.getModulesByCourse = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { sort, populate } = req.query;

    // Verify course exists
    const course = await Course.findById(courseId);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    let query = Module.find({ course: courseId });

    // Populate related content if requested
    if (populate === "content") {
      query = query
        .populate({
          path: "liveSessions",
          select: "title startTime endTime status instructor",
        })
        .populate({
          path: "assignments",
          select: "title deadline status isPublished",
        })
        .populate({
          path: "learningMaterials",
          select: "title materialType isPublished",
        });
    } else if (populate === "instructor") {
      query = query.populate({
        path: "liveSessions.instructor",
        select: "name email",
      });
    }

    // Sort by sequence by default
    if (sort) {
      query = query.sort(sort);
    } else {
      query = query.sort("sequence");
    }

    const modules = await query;

    res.status(200).json({
      success: true,
      count: modules.length,
      data: modules,
    });
  } catch (error) {
    console.error("Error fetching modules:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single module with all its content
// @route   GET /api/v1/modules/:id
// @access  Public
exports.getModule = async (req, res) => {
  try {
    const { id } = req.params;

    const module = await Module.findById(id)
      .populate({
        path: "liveSessions",
        select: "title description startTime endTime status instructor provider joinUrl",
        populate: {
          path: "instructor",
          select: "name email",
        },
      })
      .populate({
        path: "assignments",
        select: "title description deadline maxMarks isPublished status",
      })
      .populate({
        path: "learningMaterials",
        select:
          "title materialType contentType estimatedTime difficulty isPublished moduleOrder",
      })
      .populate("createdBy", "name email")
      .populate("course", "title");

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    res.status(200).json({
      success: true,
      data: module,
    });
  } catch (error) {
    console.error("Error fetching module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update a module
// @route   PUT /api/v1/modules/:id
// @access  Private/Admin
exports.updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description,
      startDate,
      endDate,
      estimatedDuration,
      learningObjectives,
      durationUnit,
    } = req.body;

    // Verify module exists
    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // If changing dates, validate
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);
      if (start >= end) {
        return res.status(400).json({
          success: false,
          message: "End date must be after start date",
        });
      }
    }

    // Update fields
    if (title) module.title = title;
    if (description) module.description = description;
    if (startDate) module.startDate = new Date(startDate);
    if (endDate) module.endDate = new Date(endDate);
    if (estimatedDuration !== undefined) module.estimatedDuration = estimatedDuration;
    if (durationUnit) module.durationUnit = durationUnit;
    if (learningObjectives) module.learningObjectives = learningObjectives;

    const updatedModule = await module.save();

    res.status(200).json({
      success: true,
      data: updatedModule,
    });
  } catch (error) {
    console.error("Error updating module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Publish a module (make it available to students)
// @route   PUT /api/v1/modules/:id/publish
// @access  Private/Admin
exports.publishModule = async (req, res) => {
  try {
    const { id } = req.params;

    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check if module has content
    const hasContent =
      module.liveSessions.length > 0 ||
      module.assignments.length > 0 ||
      module.learningMaterials.length > 0;

    if (!hasContent) {
      return res.status(400).json({
        success: false,
        message:
          "Module must have at least one piece of content (live session, assignment, or learning material) before publishing",
      });
    }

    module.isPublished = true;
    module.publishedAt = new Date();
    module.status = "published";

    const updatedModule = await module.save();

    res.status(200).json({
      success: true,
      message: "Module published successfully",
      data: updatedModule,
    });
  } catch (error) {
    console.error("Error publishing module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Archive a module
// @route   PUT /api/v1/modules/:id/archive
// @access  Private/Admin
exports.archiveModule = async (req, res) => {
  try {
    const { id } = req.params;

    const module = await Module.findByIdAndUpdate(
      id,
      {
        $set: {
          status: "archived",
          isPublished: false,
        },
      },
      { new: true, runValidators: true },
    );

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    res.status(200).json({
      success: true,
      message: "Module archived successfully",
      data: module,
    });
  } catch (error) {
    console.error("Error archiving module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete a module
// @route   DELETE /api/v1/modules/:id
// @access  Private/Admin
exports.deleteModule = async (req, res) => {
  try {
    const { id } = req.params;

    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Remove module references from all related documents
    await LiveSession.deleteMany({ module: id });
    await Assignment.deleteMany({ module: id });
    await LearningMaterial.deleteMany({ module: id });

    // Delete the module
    await Module.findByIdAndDelete(id);

    // Update course's totalModules
    const courseId = module.course;
    const totalModules = await Module.countDocuments({ course: courseId });
    await Course.findByIdAndUpdate(courseId, { $set: { totalModules } });

    res.status(200).json({
      success: true,
      message: "Module deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add content to a module (live session, assignment, learning material)
// @route   PUT /api/v1/modules/:id/add-content
// @access  Private/Admin
exports.addContentToModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { contentType, contentId } = req.body;

    if (!contentType || !contentId) {
      return res.status(400).json({
        success: false,
        message: "Please provide contentType and contentId",
      });
    }

    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    const validContentTypes = ["liveSession", "assignment", "learningMaterial"];
    if (!validContentTypes.includes(contentType)) {
      return res.status(400).json({
        success: false,
        message: `Invalid contentType. Must be one of: ${validContentTypes.join(", ")}`,
      });
    }

    // Add content based on type
    if (contentType === "liveSession") {
      if (!module.liveSessions.includes(contentId)) {
        module.liveSessions.push(contentId);
        module.contentCount.liveSessions += 1;
      }
    } else if (contentType === "assignment") {
      if (!module.assignments.includes(contentId)) {
        module.assignments.push(contentId);
        module.contentCount.assignments += 1;
      }
    } else if (contentType === "learningMaterial") {
      if (!module.learningMaterials.includes(contentId)) {
        module.learningMaterials.push(contentId);
        module.contentCount.learningMaterials += 1;
      }
    }

    await module.save();

    res.status(200).json({
      success: true,
      message: `Content added to module successfully`,
      data: module,
    });
  } catch (error) {
    console.error("Error adding content to module:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get module content summary
// @route   GET /api/v1/modules/:id/content-summary
// @access  Public
exports.getModuleContentSummary = async (req, res) => {
  try {
    const { id } = req.params;

    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Get detailed content counts
    const liveSessions = await LiveSession.find({ module: id });
    const assignments = await Assignment.find({ module: id });
    const learningMaterials = await LearningMaterial.find({ module: id });

    // Calculate stats
    const stats = {
      totalLiveSessions: liveSessions.length,
      upcomingLiveSessions: liveSessions.filter(
        (ls) => new Date(ls.startTime) > new Date(),
      ).length,
      completedLiveSessions: liveSessions.filter((ls) => ls.status === "completed")
        .length,
      totalAssignments: assignments.length,
      activeAssignments: assignments.filter((a) => a.isActive && a.isPublished).length,
      totalLearningMaterials: learningMaterials.length,
      publishedMaterials: learningMaterials.filter((m) => m.isPublished).length,
      totalEstimatedTime:
        learningMaterials.reduce((sum, m) => sum + (m.estimatedTime || 0), 0) +
        liveSessions.reduce((sum, ls) => sum + (ls.duration || 0), 0),
    };

    res.status(200).json({
      success: true,
      module: {
        id: module._id,
        title: module.title,
        sequence: module.sequence,
        startDate: module.startDate,
        endDate: module.endDate,
        status: module.status,
      },
      stats,
    });
  } catch (error) {
    console.error("Error getting module content summary:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all modules (admin view with advanced filtering)
// @route   GET /api/v1/modules
// @access  Private/Admin
exports.getAllModules = async (req, res) => {
  try {
    const { courseId, status, sort, page, limit } = req.query;

    let query = {};

    if (courseId) query.course = courseId;
    if (status) query.status = status;

    let moduleQuery = Module.find(query).populate("course", "title");

    // Sort
    if (sort) {
      moduleQuery = moduleQuery.sort(sort);
    } else {
      moduleQuery = moduleQuery.sort("sequence");
    }

    // Pagination
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 10;
    const skip = (pageNum - 1) * limitNum;

    const total = await Module.countDocuments(query);
    moduleQuery = moduleQuery.skip(skip).limit(limitNum);

    const modules = await moduleQuery;

    res.status(200).json({
      success: true,
      count: modules.length,
      total,
      pagination: {
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
      data: modules,
    });
  } catch (error) {
    console.error("Error getting modules:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
