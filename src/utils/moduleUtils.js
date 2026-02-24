const Module = require("../models/Module");
const Course = require("../models/Course");
const LiveSession = require("../models/LiveSession");
const Assignment = require("../models/Assignment");
const LearningMaterial = require("../models/LearningMaterial");

/**
 * Validate if module belongs to the given course
 */
async function validateModuleForCourse(moduleId, courseId) {
  const module = await Module.findOne({ _id: moduleId, course: courseId });
  return !!module;
}

/**
 * Update module content counts
 */
async function updateModuleContentCounts(moduleId) {
  try {
    const liveSessions = await LiveSession.countDocuments({ module: moduleId });
    const assignments = await Assignment.countDocuments({ module: moduleId });
    const learningMaterials = await LearningMaterial.countDocuments({
      module: moduleId,
    });

    await Module.findByIdAndUpdate(moduleId, {
      $set: {
        "contentCount.liveSessions": liveSessions,
        "contentCount.assignments": assignments,
        "contentCount.learningMaterials": learningMaterials,
      },
    });

    return {
      liveSessions,
      assignments,
      learningMaterials,
      total: liveSessions + assignments + learningMaterials,
    };
  } catch (error) {
    console.error("Error updating module content counts:", error);
    throw error;
  }
}

/**
 * Check if module can be published (has required content)
 */
async function canPublishModule(moduleId) {
  const module = await Module.findById(moduleId);
  if (!module) {
    return { canPublish: false, reason: "Module not found" };
  }

  // Module must have at least one live session or learning material
  const hasLiveSessions = module.liveSessions.length > 0;
  const hasLearningMaterials = module.learningMaterials.length > 0;

  const hasRequiredContent = hasLiveSessions || hasLearningMaterials;

  return {
    canPublish: hasRequiredContent,
    reason: hasRequiredContent
      ? "Module can be published"
      : "Module must have at least one live session or learning material",
    contentStats: {
      liveSessions: module.liveSessions.length,
      learningMaterials: module.learningMaterials.length,
      assignments: module.assignments.length,
    },
  };
}

/**
 * Get all content in a module organized by type
 */
async function getModuleContentOrganized(moduleId) {
  try {
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    const [liveSessions, assignments, learningMaterials] = await Promise.all([
      LiveSession.find({ module: moduleId })
        .select("title startTime endTime status instructor duration")
        .populate("instructor", "name email")
        .sort({ startTime: 1 }),
      Assignment.find({ module: moduleId })
        .select("title deadline maxMarks status isPublished")
        .sort({ deadline: 1 }),
      LearningMaterial.find({ module: moduleId })
        .select("title materialType difficulty estimatedTime isPublished moduleOrder")
        .sort({ moduleOrder: 1 }),
    ]);

    return {
      module: {
        id: module._id,
        title: module.title,
        sequence: module.sequence,
        startDate: module.startDate,
        endDate: module.endDate,
        status: module.status,
      },
      content: {
        liveSessions,
        assignments,
        learningMaterials,
      },
      summary: {
        totalContent: liveSessions.length + assignments.length + learningMaterials.length,
        liveSessions: liveSessions.length,
        assignments: assignments.length,
        learningMaterials: learningMaterials.length,
      },
    };
  } catch (error) {
    console.error("Error getting organized module content:", error);
    throw error;
  }
}

/**
 * Get all modules for a course with their content summaries
 */
async function getCourseLearningPath(courseId) {
  try {
    const course = await Course.findById(courseId).select("title totalModules");
    if (!course) {
      throw new Error("Course not found");
    }

    const modules = await Module.find({ course: courseId })
      .select(
        "title sequence startDate endDate status isPublished contentCount learningObjectives",
      )
      .sort({ sequence: 1 })
      .lean();

    // Enrich modules with content details
    const enrichedModules = await Promise.all(
      modules.map(async (module) => {
        const upcomingLiveSessions = await LiveSession.countDocuments({
          module: module._id,
          startTime: { $gt: new Date() },
          status: "scheduled",
        });

        return {
          ...module,
          upcomingLiveSessions,
          progressionSequence: module.sequence,
        };
      }),
    );

    return {
      course: {
        id: course._id,
        title: course.title,
        totalModules: course.totalModules,
      },
      learningPath: enrichedModules,
    };
  } catch (error) {
    console.error("Error getting course learning path:", error);
    throw error;
  }
}

/**
 * Archive old/completed modules automatically
 */
async function autoArchiveCompletedModules(courseId) {
  try {
    const now = new Date();
    const resultCount = await Module.updateMany(
      {
        course: courseId,
        endDate: { $lt: now },
        status: { $ne: "archived" },
      },
      {
        $set: {
          status: "archived",
          isPublished: false,
        },
      },
    );

    return resultCount;
  } catch (error) {
    console.error("Error auto-archiving modules:", error);
    throw error;
  }
}

/**
 * Validate date ranges for module and its content
 */
async function validateModuleDateConsistency(moduleId) {
  try {
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    // Get all content dates
    const liveSessions = await LiveSession.find({ module: moduleId }).select(
      "startTime endTime",
    );
    const assignments = await Assignment.find({ module: moduleId }).select(
      "startDate deadline",
    );
    const learningMaterials = await LearningMaterial.find({
      module: moduleId,
    }).select("availableFrom availableUntil");

    const issues = [];

    // Check live sessions are within module dates
    liveSessions.forEach((ls) => {
      if (ls.startTime < module.startDate || ls.endTime > module.endDate) {
        issues.push(`Live session "${ls.title}" falls outside module date range`);
      }
    });

    // Check assignments are within module dates
    assignments.forEach((a) => {
      if (a.startDate < module.startDate || a.deadline > module.endDate) {
        issues.push(`Assignment "${a.title}" falls outside module date range`);
      }
    });

    // Check materials are within module dates
    learningMaterials.forEach((m) => {
      if (m.availableFrom && m.availableFrom < module.startDate) {
        issues.push(`Material "${m.title}" availability starts before module`);
      }
      if (m.availableUntil && m.availableUntil > module.endDate) {
        issues.push(`Material "${m.title}" availability ends after module`);
      }
    });

    return {
      isConsistent: issues.length === 0,
      issues,
    };
  } catch (error) {
    console.error("Error validating module date consistency:", error);
    throw error;
  }
}

/**
 * Calculate total estimated duration for a module
 */
async function calculateModuleEstimatedDuration(moduleId) {
  try {
    const module = await Module.findById(moduleId);
    if (!module) {
      throw new Error("Module not found");
    }

    const [liveSessions, learningMaterials, assignments] = await Promise.all([
      LiveSession.find({ module: moduleId }).select("duration"),
      LearningMaterial.find({ module: moduleId }).select("estimatedTime"),
      Assignment.find({ module: moduleId }),
    ]);

    const liveSessionMinutes = liveSessions.reduce(
      (sum, ls) => sum + (ls.duration || 0),
      0,
    );
    const materialMinutes = learningMaterials.reduce(
      (sum, m) => sum + (m.estimatedTime || 0),
      0,
    );

    // Assume 30 minutes per assignment on average
    const assignmentMinutes = assignments.length * 30;

    const totalMinutes = liveSessionMinutes + materialMinutes + assignmentMinutes;
    const totalHours = Math.round(totalMinutes / 60);

    return {
      totalMinutes,
      totalHours,
      breakdown: {
        liveSessions: liveSessionMinutes,
        learningMaterials: materialMinutes,
        assignments: assignmentMinutes,
      },
    };
  } catch (error) {
    console.error("Error calculating module duration:", error);
    throw error;
  }
}

module.exports = {
  validateModuleForCourse,
  updateModuleContentCounts,
  canPublishModule,
  getModuleContentOrganized,
  getCourseLearningPath,
  autoArchiveCompletedModules,
  validateModuleDateConsistency,
  calculateModuleEstimatedDuration,
};
