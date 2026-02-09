const LearningMaterial = require("../models/LearningMaterial");
const Batch = require("../models/Batch");
const Course = require("../models/Course");
const cloudinary = require("../config/cloudinary");
const mongoose = require("mongoose");

// @desc    Create learning material
// @route   POST /api/v1/batches/:batchId/learning-materials
// @access  Private/Instructor
exports.createLearningMaterial = async (req, res) => {
  try {
    const { batchId } = req.params;

    // let jsonPayload = JSON.parse(req.body.jsonData);

    // Check batch exists and user is instructor
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
        message: "Not authorized to add materials to this batch",
      });
    }

    let materialData = {
      ...req.body,
      batch: batchId,
      course: batch.course,
      createdBy: req.user.id,
    };

    // Handle file upload
    if (req.file) {
      materialData.file = {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      };

      // Set material type based on file
      materialData.materialType = getMaterialTypeFromMime(req.file.mimetype);
    }

    // Handle external URL
    if (req.body.externalUrl) {
      materialData.materialType = getMaterialTypeFromUrl(req.body.externalUrl);
      materialData.externalProvider = getProviderFromUrl(req.body.externalUrl);
    }

    const material = await LearningMaterial.create(materialData);

    res.status(201).json({
      success: true,
      message: "Learning material created successfully",
      data: material,
    });
  } catch (error) {
    console.log("error :", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all learning materials for a batch
// @route   GET /api/v1/batches/:batchId/learning-materials
// @access  Private (enrolled students/instructor)
exports.getBatchMaterials = async (req, res) => {
  try {
    const { batchId } = req.params;
    const {
      week,
      materialType,
      contentType,
      isPublished = true,
      limit = 20,
      page = 1,
    } = req.query;

    // Build query
    const query = { batch: batchId };

    // Filter by week if provided
    if (week) {
      query.week = parseInt(week);
    }

    // Filter by material type
    if (materialType) {
      query.materialType = materialType;
    }

    // Filter by content type
    if (contentType) {
      query.contentType = contentType;
    }

    // For students, only show published materials
    if (req.user.role === "student") {
      query.isPublished = true;

      // Check availability dates
      const now = new Date();
      query.$or = [
        {
          $and: [{ availableFrom: { $lte: now } }, { availableUntil: { $gte: now } }],
        },
        {
          $and: [
            { availableFrom: { $exists: false } },
            { availableUntil: { $exists: false } },
          ],
        },
        {
          $and: [
            { availableFrom: { $lte: now } },
            { availableUntil: { $exists: false } },
          ],
        },
        {
          $and: [
            { availableFrom: { $exists: false } },
            { availableUntil: { $gte: now } },
          ],
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

    // Execute query with sorting
    const materials = await LearningMaterial.find(query)
      .sort({ week: 1, moduleOrder: 1, createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name");

    const total = await LearningMaterial.countDocuments(query);

    // Get week distribution for navigation
    const weekDistribution = await LearningMaterial.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$week",
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$materialType", "quiz"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      count: materials.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      weekDistribution,
      data: materials,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single learning material
// @route   GET /api/v1/learning-materials/:id
// @access  Private (enrolled students/instructor)
//
exports.getLearningMaterial = async (req, res) => {
  try {
    const material = await LearningMaterial.findById(req.params.id)
      .populate("batch", "name")
      .populate("course", "title")
      .populate("createdBy", "name email")
      .populate("prerequisites", "title materialType");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Increment view count for students
    if (req.user.role === "student" && material.isAvailable) {
      material.viewCount += 1;
      await material.save();
    }

    res.status(200).json({
      success: true,
      data: material,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update learning material
// @route   PUT /api/v1/learning-materials/:id
// @access  Private/Instructor
exports.updateLearningMaterial = async (req, res) => {
  try {
    const material = await LearningMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Check authorization
    if (
      material.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to update this material",
      });
    }

    // Handle file update
    if (req.file) {
      // Delete old file from Cloudinary
      if (material.file && material.file.public_id) {
        await cloudinary.uploader.destroy(material.file.public_id);
      }

      req.body.file = {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype,
      };

      req.body.materialType = getMaterialTypeFromMime(req.file.mimetype);
    }

    req.body.updatedBy = req.user.id;

    const updatedMaterial = await LearningMaterial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true },
    );

    res.status(200).json({
      success: true,
      message: "Learning material updated successfully",
      data: updatedMaterial,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete learning material
// @route   DELETE /api/v1/learning-materials/:id
// @access  Private/Instructor
exports.deleteLearningMaterial = async (req, res) => {
  try {
    const material = await LearningMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Check authorization
    if (
      material.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to delete this material",
      });
    }

    // Delete file from Cloudinary if exists
    if (material.file && material.file.public_id) {
      await cloudinary.uploader.destroy(material.file.public_id);
    }

    await material.deleteOne();

    res.status(200).json({
      success: true,
      message: "Learning material deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Publish/unpublish learning material
// @route   PUT /api/v1/learning-materials/:id/publish
// @access  Private/Instructor
exports.togglePublish = async (req, res) => {
  try {
    const material = await LearningMaterial.findById(req.params.id);

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Check authorization
    if (
      material.createdBy.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to publish/unpublish this material",
      });
    }

    material.isPublished = !material.isPublished;
    material.publishDate = new Date();
    material.updatedBy = req.user.id;
    await material.save();

    res.status(200).json({
      success: true,
      message: `Material ${material.isPublished ? "published" : "unpublished"} successfully`,
      data: material,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get material statistics
// @route   GET /api/v1/batches/:batchId/learning-materials/stats
// @access  Private/Instructor
exports.getMaterialStats = async (req, res) => {
  try {
    const { batchId } = req.params;
    const objectId = new mongoose.Types.ObjectId(batchId);

    const stats = await LearningMaterial.aggregate([
      { $match: { batch: objectId } },
      {
        $group: {
          _id: "$materialType",
          count: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ["$isPublished", true] }, 1, 0] } },
          totalViews: { $sum: "$viewCount" },
          avgViews: { $avg: "$viewCount" },
        },
      },
      { $sort: { count: -1 } },
    ]);

    const weekStats = await LearningMaterial.aggregate([
      { $match: { batch: objectId, isPublished: true } },
      {
        $group: {
          _id: "$week",
          count: { $sum: 1 },
          totalEstimatedTime: { $sum: "$estimatedTime" },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      data: {
        byType: stats,
        byWeek: weekStats,
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

// Helper functions
function getMaterialTypeFromMime(mimeType) {
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType.includes("presentation")) return "presentation";
  if (mimeType.includes("image")) return "image";
  return "other";
}

function getMaterialTypeFromUrl(url) {
  if (url.includes("youtube.com") || url.includes("vimeo.com")) return "video";
  if (url.includes("github.com")) return "code";
  return "article";
}

function getProviderFromUrl(url) {
  if (url.includes("youtube.com")) return "youtube";
  if (url.includes("vimeo.com")) return "vimeo";
  if (url.includes("github.com")) return "github";
  return "external";
}
