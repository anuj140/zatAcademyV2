const mongoose = require("mongoose");

const moduleItemSchema = new mongoose.Schema({
  itemType: {
    type: String,
    enum: ["live_session", "learning_material", "assignment", "quiz", "assessment"],
    required: true,
  },
  itemId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    refPath: "items.itemModel",
  },
  itemModel: {
    type: String,
    required: true,
    enum: ["LiveSession", "LearningMaterial", "Assignment"],
  },
  title: {
    type: String,
    required: true,
  },
  order: {
    type: Number,
    required: true,
    min: 0,
  },
  isRequired: {
    type: Boolean,
    default: true,
  },
  estimatedDuration: Number, // in minutes
  dueDate: Date,

  // Metadata for quick access
  metadata: {
    type: mongoose.Schema.Types.Mixed,
  },
});

const moduleSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, "Module title is required"],
      trim: true,
      maxlength: [200, "Module title cannot exceed 200 characters"],
    },
    description: {
      type: String,
      maxlength: [2000, "Module description cannot exceed 2000 characters"],
    },
    course: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
    },
    batch: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Batch",
      required: true,
    },

    // Module ordering and organization
    order: {
      type: Number,
      required: true,
      min: 0,
    },
    weekNumber: {
      type: Number,
      min: 1,
    },

    // Module content items
    items: [moduleItemSchema],

    // Dates
    startDate: {
      type: Date,
      required: [true, "Module start date is required"],
    },
    endDate: {
      type: Date,
      required: [true, "Module end date is required"],
      validate: {
        validator: function (value) {
          if (this.isNew) {
            return value > this.startDate;
          }
          return true;
        },
        message: "End date must be after start date",
      },
    },

    // Status
    isPublished: {
      type: Boolean,
      default: false,
    },
    publishedDate: Date,

    // Learning objectives
    learningObjectives: [String],

    // Prerequisites
    prerequisites: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Module",
      },
    ],

    // Statistics
    totalItems: {
      type: Number,
      default: 0,
    },
    totalDuration: {
      type: Number, // in minutes
      default: 0,
    },
    completionRate: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },

    // Metadata
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  },
);

// Indexes
moduleSchema.index({ course: 1, batch: 1, order: 1 });
moduleSchema.index({ batch: 1, weekNumber: 1 });
moduleSchema.index({ isPublished: 1, startDate: 1 });

// Virtuals
moduleSchema.virtual("isActive").get(function () {
  const now = new Date();
  return this.isPublished && now >= this.startDate && now <= this.endDate;
});

moduleSchema.virtual("isUpcoming").get(function () {
  return this.isPublished && new Date() < this.startDate;
});

moduleSchema.virtual("isCompleted").get(function () {
  return new Date() > this.endDate;
});

moduleSchema.virtual("hasPrerequisites").get(function () {
  return this.prerequisites && this.prerequisites.length > 0;
});

// Pre-save middleware
moduleSchema.pre("save", async function () {
  this.updatedAt = Date.now();

  // Update total items
  this.totalItems = this.items.length;

  // Calculate total duration
  this.totalDuration = this.items.reduce(
    (sum, item) => sum + (item.estimatedDuration || 0),
    0,
  );

  // Sort items by order
  this.items.sort((a, b) => a.order - b.order);

  // Set published date if being published
  if (this.isPublished && !this.publishedDate) {
    this.publishedDate = new Date();
  }
});

// Methods
moduleSchema.methods.addItem = function (itemData) {
  // Auto-increment order if not provided
  if (itemData.order === undefined) {
    const maxOrder = this.items.reduce((max, item) => Math.max(max, item.order), -1);
    itemData.order = maxOrder + 1;
  }

  this.items.push(itemData);
  return this.save();
};

moduleSchema.methods.removeItem = function (itemId) {
  this.items = this.items.filter((item) => item.itemId.toString() !== itemId.toString());

  // Reorder remaining items
  this.items = this.items.map((item, index) => {
    item.order = index;
    return item;
  });

  return this.save();
};

moduleSchema.methods.reorderItems = function (itemOrders) {
  // itemOrders is an array of { itemId, order }
  itemOrders.forEach(({ itemId, order }) => {
    const item = this.items.find((i) => i.itemId.toString() === itemId.toString());
    if (item) {
      item.order = order;
    }
  });

  return this.save();
};

moduleSchema.methods.getItemByType = function (itemType) {
  return this.items.filter((item) => item.itemType === itemType);
};

moduleSchema.methods.checkPrerequisites = async function (studentId) {
  if (!this.hasPrerequisites) {
    return { satisfied: true, missing: [] };
  }

  const Progress = mongoose.model("Progress");
  const missingPrerequisites = [];

  for (const prereqId of this.prerequisites) {
    const prereqModule = await mongoose.model("Module").findById(prereqId);

    if (prereqModule) {
      // Check if student has completed this prerequisite
      const progress = await Progress.findOne({
        student: studentId,
        batch: this.batch,
      });

      // Simple check: has student completed all items in prerequisite module?
      const prereqItemIds = prereqModule.items.map((item) => item.itemId.toString());
      const completedItems =
        progress?.materialProgress?.filter(
          (mp) =>
            prereqItemIds.includes(mp.material.toString()) && mp.status === "completed",
        ) || [];

      if (completedItems.length < prereqItemIds.length) {
        missingPrerequisites.push({
          moduleId: prereqModule._id,
          title: prereqModule.title,
          completionRate:
            prereqItemIds.length > 0
              ? (completedItems.length / prereqItemIds.length) * 100
              : 0,
        });
      }
    }
  }

  return {
    satisfied: missingPrerequisites.length === 0,
    missing: missingPrerequisites,
  };
};

// Static methods
moduleSchema.statics.getCourseCurriculum = async function (
  courseId,
  batchId,
  options = {},
) {
  const { includeUnpublished = false, studentId = null, populateItems = true } = options;

  // Build query
  const query = { course: courseId, batch: batchId };

  if (!includeUnpublished) {
    query.isPublished = true;
  }

  // Get modules
  let modulesQuery = this.find(query)
    .sort({ order: 1 })
    .populate("createdBy", "name email")
    .populate("prerequisites", "title order");

  const modules = await modulesQuery;

  // If populateItems is true, populate each item
  if (populateItems) {
    for (const module of modules) {
      for (const item of module.items) {
        // Populate based on item type
        if (item.itemModel === "LiveSession") {
          await module.populate({
            path: "items.itemId",
            model: "LiveSession",
            select: "title startTime endTime duration status instructor",
          });
        } else if (item.itemModel === "LearningMaterial") {
          await module.populate({
            path: "items.itemId",
            model: "LearningMaterial",
            select: "title materialType contentType estimatedTime isPublished",
          });
        } else if (item.itemModel === "Assignment") {
          await module.populate({
            path: "items.itemId",
            model: "Assignment",
            select: "title deadline maxMarks isPublished",
          });
        }
      }
    }
  }

  // If studentId provided, include student progress
  if (studentId) {
    const Progress = mongoose.model("Progress");
    const progress = await Progress.findOne({
      student: studentId,
      batch: batchId,
    });

    // Attach progress data to each module
    for (const module of modules) {
      // Calculate module completion for this student
      const moduleItemIds = module.items.map((item) => item.itemId.toString());

      // Check material progress
      const completedMaterials =
        progress?.materialProgress?.filter(
          (mp) =>
            moduleItemIds.includes(mp.material.toString()) && mp.status === "completed",
        ).length || 0;

      // Check assignment progress
      const Submission = mongoose.model("Submission");
      const completedAssignments = await Submission.countDocuments({
        student: studentId,
        assignment: { $in: moduleItemIds },
        status: { $in: ["submitted", "graded"] },
      });

      // Check session attendance
      const attendedSessions =
        progress?.sessionAttendance?.filter(
          (sa) =>
            moduleItemIds.includes(sa.session.toString()) && sa.status === "present",
        ).length || 0;

      const totalCompleted = completedMaterials + completedAssignments + attendedSessions;
      const totalRequired = module.items.filter((item) => item.isRequired).length;

      module._doc.studentProgress = {
        completedItems: totalCompleted,
        totalItems: totalRequired,
        completionPercentage:
          totalRequired > 0 ? (totalCompleted / totalRequired) * 100 : 0,
        canAccess: true, // Will be updated based on prerequisites
        prerequisitesSatisfied: true,
      };

      // Check prerequisites
      if (module.hasPrerequisites) {
        const prereqCheck = await module.checkPrerequisites(studentId);
        module._doc.studentProgress.prerequisitesSatisfied = prereqCheck.satisfied;
        module._doc.studentProgress.canAccess = prereqCheck.satisfied;
        module._doc.studentProgress.missingPrerequisites = prereqCheck.missing;
      }
    }
  }

  return modules;
};

moduleSchema.statics.getModuleCurriculum = async function (moduleId, options = {}) {
  const { studentId = null, populateItems = true } = options;

  const module = await this.findById(moduleId)
    .populate("course", "title")
    .populate("batch", "name")
    .populate("createdBy", "name email")
    .populate("prerequisites", "title order");

  if (!module) {
    throw new Error("Module not found");
  }

  // Populate items
  if (populateItems) {
    for (const item of module.items) {
      if (item.itemModel === "LiveSession") {
        await module.populate({
          path: "items.itemId",
          model: "LiveSession",
          select:
            "title description startTime endTime duration status instructor meetingId joinUrl recordingUrl hasMaterials",
        });
      } else if (item.itemModel === "LearningMaterial") {
        await module.populate({
          path: "items.itemId",
          model: "LearningMaterial",
          select:
            "title description materialType contentType file externalUrl estimatedTime difficulty isPublished prerequisites",
        });
      } else if (item.itemModel === "Assignment") {
        await module.populate({
          path: "items.itemId",
          model: "Assignment",
          select:
            "title description deadline maxMarks passingMarks submissionType isPublished allowLateSubmission",
        });
      }
    }
  }

  // If studentId provided, include detailed progress
  if (studentId) {
    const Progress = mongoose.model("Progress");
    const Submission = mongoose.model("Submission");

    const progress = await Progress.findOne({
      student: studentId,
      batch: module.batch,
    });

    // Add progress data to each item
    for (const item of module.items) {
      const itemProgress = {
        status: "not_started",
        completedAt: null,
        score: null,
        canAccess: true,
      };

      if (item.itemModel === "LearningMaterial") {
        const materialProgress = progress?.materialProgress?.find(
          (mp) => mp.material.toString() === item.itemId.toString(),
        );

        if (materialProgress) {
          itemProgress.status = materialProgress.status;
          itemProgress.completedAt = materialProgress.completedAt;
          itemProgress.progress = materialProgress.progress;
          itemProgress.timeSpent = materialProgress.timeSpent;
        }
      } else if (item.itemModel === "Assignment") {
        const submission = await Submission.findOne({
          student: studentId,
          assignment: item.itemId,
        });

        if (submission) {
          itemProgress.status = submission.status;
          itemProgress.completedAt = submission.submittedAt;
          itemProgress.score = submission.marksObtained;
          itemProgress.submissionId = submission._id;
        }
      } else if (item.itemModel === "LiveSession") {
        const sessionAttendance = progress?.sessionAttendance?.find(
          (sa) => sa.session.toString() === item.itemId.toString(),
        );

        if (sessionAttendance) {
          itemProgress.status =
            sessionAttendance.status === "present" ? "completed" : "absent";
          itemProgress.completedAt = sessionAttendance.joinedAt;
          itemProgress.duration = sessionAttendance.duration;
        }
      }

      item._doc.studentProgress = itemProgress;
    }

    // Check module prerequisites
    if (module.hasPrerequisites) {
      const prereqCheck = await module.checkPrerequisites(studentId);
      module._doc.prerequisitesSatisfied = prereqCheck.satisfied;
      module._doc.missingPrerequisites = prereqCheck.missing;
    } else {
      module._doc.prerequisitesSatisfied = true;
    }
  }

  return module;
};

module.exports = mongoose.model("Module", moduleSchema);
