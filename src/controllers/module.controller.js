const Module = require("../models/Module");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const LearningMaterial = require("../models/LearningMaterial");
const Assignment = require("../models/Assignment");
const LiveSession = require("../models/LiveSession");
const Enrollment = require("../models/Enrollment");

// @desc    Create a new module
// @route   POST /api/v1/modules
// @access  Private/Instructor
exports.createModule = async (req, res) => {
  try {
    const {
      courseId,
      batchId,
      title,
      description,
      order,
      weekNumber,
      startDate,
      endDate,
      learningObjectives,
      prerequisites,
    } = req.body;

    // Verify batch exists and user is instructor
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
        message: "Not authorized to create modules for this batch",
      });
    }

    // Verify course matches
    if (batch.course._id.toString() !== courseId) {
      return res.status(400).json({
        success: false,
        message: "Course does not match batch",
      });
    }

    // Auto-assign order if not provided
    let moduleOrder = order;
    if (moduleOrder === undefined) {
      const maxOrder = await Module.findOne({ batch: batchId })
        .sort({ order: -1 })
        .select("order");
      moduleOrder = maxOrder ? maxOrder.order + 1 : 0;
    }

    const module = await Module.create({
      title,
      description,
      course: courseId,
      batch: batchId,
      order: moduleOrder,
      weekNumber,
      startDate,
      endDate,
      learningObjectives: learningObjectives || [],
      prerequisites: prerequisites || [],
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: "Module created successfully",
      data: module,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get course curriculum (all modules)
// @route   GET /api/v1/courses/:courseId/batches/:batchId/curriculum
// @access  Private (enrolled students/instructor)
exports.getCourseCurriculum = async (req, res) => {
  try {
    const { courseId, batchId } = req.params;
    const { includeUnpublished = false } = req.query;

    // Check access
    const hasAccess = await checkBatchAccess(req.user, batchId);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view curriculum for this batch",
      });
    }

    // Get curriculum
    const options = {
      includeUnpublished: req.user.role !== "student" && includeUnpublished === "true",
      studentId: req.user.role === "student" ? req.user.id : null,
      populateItems: true,
    };

    const curriculum = await Module.getCourseCurriculum(courseId, batchId, options);

    // Calculate overall statistics
    const stats = {
      totalModules: curriculum.length,
      publishedModules: curriculum.filter((m) => m.isPublished).length,
      totalItems: curriculum.reduce((sum, m) => sum + m.totalItems, 0),
      totalDuration: curriculum.reduce((sum, m) => sum + m.totalDuration, 0),
      activeModules: curriculum.filter((m) => m.isActive).length,
      upcomingModules: curriculum.filter((m) => m.isUpcoming).length,
      completedModules: curriculum.filter((m) => m.isCompleted).length,
    };

    // If student, add student-specific stats
    if (req.user.role === "student") {
      const completedItems = curriculum.reduce(
        (sum, m) => sum + (m.studentProgress?.completedItems || 0),
        0,
      );
      const totalRequiredItems = curriculum.reduce(
        (sum, m) => sum + (m.studentProgress?.totalItems || 0),
        0,
      );

      stats.studentProgress = {
        completedItems,
        totalRequiredItems,
        overallCompletion:
          totalRequiredItems > 0 ? (completedItems / totalRequiredItems) * 100 : 0,
        modulesCompleted: curriculum.filter(
          (m) => m.studentProgress && m.studentProgress.completionPercentage === 100,
        ).length,
        modulesInProgress: curriculum.filter(
          (m) =>
            m.studentProgress &&
            m.studentProgress.completionPercentage > 0 &&
            m.studentProgress.completionPercentage < 100,
        ).length,
        modulesNotStarted: curriculum.filter(
          (m) => !m.studentProgress || m.studentProgress.completionPercentage === 0,
        ).length,
      };
    }

    res.status(200).json({
      success: true,
      stats,
      data: {
        courseId,
        batchId,
        modules: curriculum,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single module curriculum
// @route   GET /api/v1/modules/:id/curriculum
// @access  Private (enrolled students/instructor)
exports.getModuleCurriculum = async (req, res) => {
  try {
    const { id } = req.params;

    // Check access
    const module = await Module.findById(id);
    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    const hasAccess = await checkBatchAccess(req.user, module.batch);
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this module",
      });
    }

    // Get detailed curriculum
    const options = {
      studentId: req.user.role === "student" ? req.user.id : null,
      populateItems: true,
    };

    const curriculum = await Module.getModuleCurriculum(id, options);

    // Organize items by type for better response structure
    const organizedItems = {
      liveSessions: [],
      learningMaterials: [],
      assignments: [],
      all: curriculum.items,
    };

    curriculum.items.forEach((item) => {
      const itemData = {
        _id: item._id,
        itemId: item.itemId._id || item.itemId,
        itemType: item.itemType,
        title: item.title,
        order: item.order,
        isRequired: item.isRequired,
        estimatedDuration: item.estimatedDuration,
        dueDate: item.dueDate,
        details: item.itemId,
        studentProgress: item.studentProgress,
      };

      if (item.itemType === "live_session") {
        organizedItems.liveSessions.push(itemData);
      } else if (item.itemType === "learning_material") {
        organizedItems.learningMaterials.push(itemData);
      } else if (item.itemType === "assignment") {
        organizedItems.assignments.push(itemData);
      }
    });

    res.status(200).json({
      success: true,
      data: {
        module: {
          _id: curriculum._id,
          title: curriculum.title,
          description: curriculum.description,
          course: curriculum.course,
          batch: curriculum.batch,
          order: curriculum.order,
          weekNumber: curriculum.weekNumber,
          startDate: curriculum.startDate,
          endDate: curriculum.endDate,
          isPublished: curriculum.isPublished,
          isActive: curriculum.isActive,
          isUpcoming: curriculum.isUpcoming,
          isCompleted: curriculum.isCompleted,
          learningObjectives: curriculum.learningObjectives,
          prerequisites: curriculum.prerequisites,
          hasPrerequisites: curriculum.hasPrerequisites,
          prerequisitesSatisfied: curriculum.prerequisitesSatisfied,
          missingPrerequisites: curriculum.missingPrerequisites,
          totalItems: curriculum.totalItems,
          totalDuration: curriculum.totalDuration,
          createdBy: curriculum.createdBy,
          createdAt: curriculum.createdAt,
          updatedAt: curriculum.updatedAt,
        },
        items: organizedItems,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update module
// @route   PUT /api/v1/modules/:id
// @access  Private/Instructor
exports.updateModule = async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this module",
      });
    }

    req.body.updatedBy = req.user.id;

    const updatedModule = await Module.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      message: "Module updated successfully",
      data: updatedModule,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete module
// @route   DELETE /api/v1/modules/:id
// @access  Private/Instructor
exports.deleteModule = async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this module",
      });
    }

    await module.deleteOne();

    res.status(200).json({
      success: true,
      message: "Module deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Publish/unpublish module
// @route   PUT /api/v1/modules/:id/publish
// @access  Private/Instructor
exports.togglePublish = async (req, res) => {
  try {
    const module = await Module.findById(req.params.id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to publish/unpublish this module",
      });
    }

    module.isPublished = !module.isPublished;
    console.log(req.user.id);
    module.updatedBy = req.user.id;

    if (module.isPublished && !module.publishedDate) {
      module.publishedDate = new Date();
    }

    await module.save();

    res.status(200).json({
      success: true,
      message: `Module ${module.isPublished ? "published" : "unpublished"} successfully`,
      data: module,
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Add item to module
// @route   POST /api/v1/modules/:id/items
// @access  Private/Instructor
exports.addItemToModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemType, itemId, title, order, isRequired, estimatedDuration, dueDate } =
      req.body;

    const module = await Module.findById(id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to add items to this module",
      });
    }

    // Determine item model based on type
    let itemModel;
    let item;

    if (itemType === "live_session") {
      itemModel = "LiveSession";
      item = await LiveSession.findById(itemId);
    } else if (itemType === "learning_material") {
      itemModel = "LearningMaterial";
      item = await LearningMaterial.findById(itemId);
    } else if (itemType === "assignment") {
      itemModel = "Assignment";
      item = await Assignment.findById(itemId);
    } else {
      return res.status(400).json({
        success: false,
        message: "Invalid item type",
      });
    }

    if (!item) {
      return res.status(404).json({
        success: false,
        message: `${itemType} not found`,
      });
    }

    // Verify item belongs to same batch
    if (item.batch.toString() !== module.batch.toString()) {
      return res.status(400).json({
        success: false,
        message: "Item does not belong to the same batch as module",
      });
    }

    // Check if item already exists in module
    const existingItem = module.items.find(
      (i) => i.itemId.toString() === itemId.toString(),
    );

    if (existingItem) {
      return res.status(400).json({
        success: false,
        message: "Item already exists in this module",
      });
    }

    // Add item to module
    await module.addItem({
      itemType,
      itemId,
      itemModel,
      title: title || item.title,
      order,
      isRequired: isRequired !== undefined ? isRequired : true,
      estimatedDuration: estimatedDuration || item.estimatedTime || item.duration || 60,
      dueDate: dueDate || item.deadline,
      metadata: {
        originalTitle: item.title,
      },
    });

    res.status(200).json({
      success: true,
      message: "Item added to module successfully",
      data: module,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Remove item from module
// @route   DELETE /api/v1/modules/:id/items/:itemId
// @access  Private/Instructor
exports.removeItemFromModule = async (req, res) => {
  try {
    const { id, itemId } = req.params;

    const module = await Module.findById(id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to remove items from this module",
      });
    }

    await module.removeItem(itemId);

    res.status(200).json({
      success: true,
      message: "Item removed from module successfully",
      data: module,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reorder module items
// @route   PUT /api/v1/modules/:id/items/reorder
// @access  Private/Instructor
exports.reorderModuleItems = async (req, res) => {
  try {
    const { id } = req.params;
    const { itemOrders } = req.body; // Array of { itemId, order }

    const module = await Module.findById(id);

    if (!module) {
      return res.status(404).json({
        success: false,
        message: "Module not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(module.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to reorder items in this module",
      });
    }

    await module.reorderItems(itemOrders);

    res.status(200).json({
      success: true,
      message: "Module items reordered successfully",
      data: module,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Reorder modules
// @route   PUT /api/v1/batches/:batchId/modules/reorder
// @access  Private/Instructor
exports.reorderModules = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { moduleOrders } = req.body; // Array of { moduleId, order }

    // Check authorization
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
        message: "Not authorized to reorder modules in this batch",
      });
    }

    // Update each module's order
    for (const { moduleId, order } of moduleOrders) {
      await Module.findByIdAndUpdate(moduleId, {
        order,
        updatedBy: req.user.id,
      });
    }

    // Get updated modules
    const modules = await Module.find({ batch: batchId })
      .sort({ order: 1 })
      .select("_id title order");

    res.status(200).json({
      success: true,
      message: "Modules reordered successfully",
      data: modules,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper function
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
