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
    // Check batch exists and user is instructor
    const batch = await Batch.findById(req.body.batchId);
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
      batch,
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

// @desc    Download learning material
// @route   GET /api/v1/learning-materials/:id/download
// @access  Private (students/instructor/admin/superAdmin)
exports.downloadMaterial = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate material ID
    const validation = validateMaterialId(id);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    // Validate user context
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Fetch material
    const material = await LearningMaterial.findById(id).populate("batch");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Validate material has downloadable file
    if (!material.file) {
      return res.status(400).json({
        success: false,
        message: "This material does not have a file attached for download",
      });
    }

    if (!material.file.url) {
      return res.status(400).json({
        success: false,
        message: "Material file URL is missing or invalid",
      });
    }

    // Check authorization
    const userRole = req.user.role;
    let canAccess = false;

    try {
      canAccess = await checkMaterialAccess(req.user.id, material, userRole);
    } catch (accessError) {
      console.error("Error checking material access:", accessError);
      return res.status(500).json({
        success: false,
        message: "Error verifying access permissions",
      });
    }

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to download this material",
      });
    }

    // Check availability for students
    if (userRole === "student") {
      if (!material.isPublished) {
        return res.status(403).json({
          success: false,
          message: "This material has not been published yet",
        });
      }

      if (!material.isAvailable) {
        const now = new Date();
        let reason = "This material is not available";

        if (material.availableFrom && now < material.availableFrom) {
          reason = `This material will be available from ${material.availableFrom.toLocaleDateString()}`;
        } else if (material.availableUntil && now > material.availableUntil) {
          reason = `This material is no longer available (expired on ${material.availableUntil.toLocaleDateString()})`;
        }

        return res.status(403).json({
          success: false,
          message: reason,
        });
      }
    }

    // Update download count and track last download
    try {
      material.downloadCount = (material.downloadCount || 0) + 1;
      material.lastDownloadedAt = new Date();
      await material.save();
    } catch (saveError) {
      console.error("Error updating download count:", saveError);
      // Continue anyway - don't fail the request just for tracking
    }

    // Return the file URL and tracking data
    res.status(200).json({
      success: true,
      message: "Material download initiated",
      data: {
        fileName: material.file.originalName || `material-${material._id}`,
        fileUrl: material.file.url,
        fileSize: material.file.size || 0,
        mimeType: material.file.mimeType || "application/octet-stream",
        materialTitle: material.title,
        downloadCount: material.downloadCount,
        downloadedAt: new Date(),
      },
    });
  } catch (error) {
    console.error("Download material error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to process download request",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Preview learning material
// @route   GET /api/v1/learning-materials/:id/preview
// @access  Private (students/instructor/admin/superAdmin)
exports.previewMaterial = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate material ID
    const validation = validateMaterialId(id);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    // Validate user context
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Fetch material
    const material = await LearningMaterial.findById(id)
      .populate("batch")
      .populate("createdBy", "name email");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Check authorization
    const userRole = req.user.role;
    let canAccess = false;

    try {
      canAccess = await checkMaterialAccess(req.user.id, material, userRole);
    } catch (accessError) {
      console.error("Error checking material access:", accessError);
      return res.status(500).json({
        success: false,
        message: "Error verifying access permissions",
      });
    }

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to preview this material",
      });
    }

    // Check availability for students
    if (userRole === "student") {
      if (!material.isPublished) {
        return res.status(403).json({
          success: false,
          message: "This material has not been published yet",
        });
      }

      if (!material.isAvailable) {
        const now = new Date();
        let reason = "This material is not available";

        if (material.availableFrom && now < material.availableFrom) {
          reason = `This material will be available from ${material.availableFrom.toLocaleDateString()}`;
        } else if (material.availableUntil && now > material.availableUntil) {
          reason = `This material is no longer available (expired on ${material.availableUntil.toLocaleDateString()})`;
        }

        return res.status(403).json({
          success: false,
          message: reason,
        });
      }
    }

    // Update preview count and track last preview
    try {
      material.previewCount = (material.previewCount || 0) + 1;
      material.lastPreviewedAt = new Date();
      await material.save();
    } catch (saveError) {
      console.error("Error updating preview count:", saveError);
      // Continue anyway - don't fail the request just for tracking
    }

    // Build preview data based on material type
    let previewData = {
      id: material._id,
      title: material.title,
      description: material.description || "",
      materialType: material.materialType,
      contentType: material.contentType,
      createdBy: material.createdBy || {},
      createdAt: material.createdAt,
      previewCount: material.previewCount,
      isPublished: material.isPublished,
    };

    // Handle file-based materials
    if (material.file && material.file.url) {
      const previewUrl = getPreviewUrl(material.file.url, material.materialType);

      previewData.file = {
        url: previewUrl || material.file.url,
        originalName: material.file.originalName || `material-${material._id}`,
        size: material.file.size || 0,
        mimeType: material.file.mimeType || "application/octet-stream",
        public_id: material.file.public_id,
      };

      // Add optimized preview URL for specific types
      if (
        material.materialType === "pdf" ||
        material.materialType === "image" ||
        material.materialType === "presentation" ||
        material.materialType === "video"
      ) {
        const cloudinaryPreviewUrl = getCloudinaryPreviewUrl(
          material.file.public_id,
          material.materialType,
        );

        if (cloudinaryPreviewUrl) {
          previewData.file.previewUrl = cloudinaryPreviewUrl;
          previewData.file.canPreviewInline = true;
        } else {
          previewData.file.canPreviewInline = false;
        }
      }

      // Add video-specific metadata
      if (material.materialType === "video" && material.file.duration) {
        previewData.file.duration = material.file.duration;
        previewData.file.formattedDuration = formatDuration(material.file.duration);
      }
    }

    // Handle external URLs
    if (material.externalUrl) {
      if (!previewData.file) {
        previewData.file = {};
      }
      previewData.file.externalUrl = material.externalUrl;
      previewData.file.externalProvider = material.externalProvider || "unknown";
      previewData.file.canPreviewInline =
        material.externalProvider === "youtube" || material.externalProvider === "vimeo";
    }

    // Handle quiz materials
    if (material.materialType === "quiz") {
      if (!material.quizQuestions || material.quizQuestions.length === 0) {
        return res.status(400).json({
          success: false,
          message: "Quiz material has no questions defined",
        });
      }

      previewData.quizInfo = {
        totalQuestions: material.quizQuestions.length,
        totalPoints: material.totalPoints || 0,
        estimatedTime: material.estimatedTime || 0,
        difficulty: material.difficulty || "beginner",
      };
    }

    // Add estimated time if available
    if (material.estimatedTime) {
      previewData.estimatedTime = material.estimatedTime;
      previewData.formattedEstimatedTime = `${material.estimatedTime} minutes`;
    }

    // Add difficulty level
    if (material.difficulty) {
      previewData.difficulty = material.difficulty;
    }

    res.status(200).json({
      success: true,
      message: "Material preview retrieved successfully",
      data: previewData,
    });
  } catch (error) {
    console.error("Preview material error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve material preview",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

// @desc    Get material download/preview statistics
// @route   GET /api/v1/learning-materials/:id/statistics
// @access  Private (students/instructor/admin/superAdmin)
exports.getMaterialStatistics = async (req, res) => {
  try {
    const { id } = req.params;

    // Validate material ID
    const validation = validateMaterialId(id);
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: validation.error,
      });
    }

    // Validate user context
    if (!req.user || !req.user.id || !req.user.role) {
      return res.status(401).json({
        success: false,
        message: "User authentication required",
      });
    }

    // Fetch material
    const material = await LearningMaterial.findById(id).populate("batch");

    if (!material) {
      return res.status(404).json({
        success: false,
        message: "Learning material not found",
      });
    }

    // Check authorization
    const userRole = req.user.role;
    let canAccess = false;

    try {
      canAccess = await checkMaterialAccess(req.user.id, material, userRole);
    } catch (accessError) {
      console.error("Error checking material access:", accessError);
      return res.status(500).json({
        success: false,
        message: "Error verifying access permissions",
      });
    }

    if (!canAccess) {
      return res.status(403).json({
        success: false,
        message: "You do not have permission to view statistics for this material",
      });
    }

    // Build statistics object
    const statistics = {
      materialId: material._id,
      title: material.title,
      materialType: material.materialType,
      isPublished: material.isPublished,
      viewCount: material.viewCount || 0,
      downloadCount: material.downloadCount || 0,
      previewCount: material.previewCount || 0,
      completionCount: material.completionCount || 0,
      lastDownloadedAt: material.lastDownloadedAt || null,
      lastPreviewedAt: material.lastPreviewedAt || null,
      engagementScore: calculateEngagementScore(material),
      engagementLevel: getEngagementLevel(material),
    };

    res.status(200).json({
      success: true,
      message: "Material statistics retrieved successfully",
      data: statistics,
    });
  } catch (error) {
    console.error("Get material statistics error:", error);
    res.status(500).json({
      success: false,
      message: "Failed to retrieve material statistics",
      error: process.env.NODE_ENV === "development" ? error.message : undefined,
    });
  }
};

/**
 * Check if user has access to material
 */
async function checkMaterialAccess(userId, material, userRole) {
  try {
    const Enrollment = require("../models/Enrollment");

    // Validate inputs
    if (!userId || !material || !userRole) {
      throw new Error("Missing required parameters for access check");
    }

    // Admin and superAdmin can always access
    if (userRole === "admin" || userRole === "superAdmin") {
      return true;
    }

    // Instructor can access if they created it or are assigned to batch
    if (userRole === "instructor") {
      if (!material.batch) {
        console.warn("Material has no batch assigned");
        return false;
      }

      const Batch = require("../models/Batch");
      const batch = await Batch.findById(material.batch);

      if (!batch) {
        console.warn("Batch not found for material");
        return false;
      }

      // Check if instructor created the material or is assigned to batch
      const isCreator = material.createdBy && material.createdBy.toString() === userId;
      const isBatchInstructor =
        batch.instructor && batch.instructor.toString() === userId;

      return isCreator || isBatchInstructor;
    }

    // Students can access if enrolled in the batch
    if (userRole === "student") {
      if (!material.batch) {
        console.warn("Material has no batch assigned");
        return false;
      }

      const enrollment = await Enrollment.findOne({
        student: userId,
        batch: material.batch,
        enrollmentStatus: "active",
        accessRevoked: false,
      });

      return !!enrollment;
    }

    // Unknown role
    return false;
  } catch (error) {
    console.error("Error in checkMaterialAccess:", error);
    throw error;
  }
}

/**
 * Validate material ID format
 */
function validateMaterialId(materialId) {
  if (!materialId) {
    return { valid: false, error: "Material ID is required" };
  }
  if (!mongoose.Types.ObjectId.isValid(materialId)) {
    return { valid: false, error: "Invalid material ID format" };
  }
  return { valid: true };
}

/**
 * Generate preview URL based on material type
 * Returns the appropriate preview URL based on file type and storage location
 */
function getPreviewUrl(fileUrl, materialType) {
  // Validate inputs
  if (!fileUrl) {
    return null;
  }

  if (!materialType) {
    // If no material type provided, return URL as-is
    return fileUrl;
  }

  // For Cloudinary URLs, return as-is (they can be previewed directly)
  if (fileUrl.includes("cloudinary")) {
    return fileUrl;
  }

  // For external URLs, return as-is
  return fileUrl;
}

/**
 * Generate Cloudinary preview URL with transformations
 * Applies specific transformations based on material type
 */
function getCloudinaryPreviewUrl(publicId, materialType) {
  // Validate inputs
  if (!publicId) {
    return null;
  }

  if (!materialType) {
    return null;
  }

  const baseUrl = "https://res.cloudinary.com";
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

  // Validate Cloudinary config
  if (!cloudName) {
    console.warn("CLOUDINARY_CLOUD_NAME not configured");
    return null;
  }

  try {
    // Apply transformations based on material type
    switch (materialType) {
      case "pdf":
        // PDF preview - return URL with preset transformation
        // Note: PDF rendering requires Cloudinary premium or custom integration
        return `${baseUrl}/${cloudName}/image/upload/w_800,h_1000,c_limit/${publicId}`;

      case "image":
        // Image preview with optimization
        return `${baseUrl}/${cloudName}/image/upload/w_800,h_600,c_limit,q_auto/${publicId}`;

      case "presentation":
        // Presentation preview with aspect ratio preservation
        return `${baseUrl}/${cloudName}/image/upload/w_800,c_limit,q_auto/${publicId}`;

      case "video":
        // Video thumbnail/poster frame
        return `${baseUrl}/${cloudName}/video/upload/w_800,h_600,c_limit,so_0/${publicId}`;

      default:
        // Generic preview for other types
        return `${baseUrl}/${cloudName}/image/upload/w_800/${publicId}`;
    }
  } catch (error) {
    console.error("Error generating preview URL:", error);
    return null;
  }
}

/**
 * Calculate engagement score based on views, downloads, and previews
 */
function calculateEngagementScore(material) {
  try {
    const views = material.viewCount || 0;
    const downloads = material.downloadCount || 0;
    const previews = material.previewCount || 0;
    const completions = material.completionCount || 0;

    // Weight: views (1x), previews (2x), downloads (3x), completions (5x)
    const score = views * 1 + previews * 2 + downloads * 3 + completions * 5;

    return Math.max(0, score); // Ensure non-negative
  } catch (error) {
    console.error("Error calculating engagement score:", error);
    return 0;
  }
}

/**
 * Determine engagement level based on engagement score
 */
function getEngagementLevel(material) {
  try {
    const score = calculateEngagementScore(material);

    if (score === 0) return "none";
    if (score < 10) return "low";
    if (score < 50) return "moderate";
    if (score < 100) return "high";
    return "very-high";
  } catch (error) {
    console.error("Error determining engagement level:", error);
    return "unknown";
  }
}

/**
 * Format duration in seconds to readable format (HH:MM:SS)
 */
function formatDuration(seconds) {
  try {
    if (!seconds || typeof seconds !== "number") {
      return "0:00";
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    if (hours > 0) {
      return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
    }

    return `${minutes}:${String(secs).padStart(2, "0")}`;
  } catch (error) {
    console.error("Error formatting duration:", error);
    return "0:00";
  }
}
