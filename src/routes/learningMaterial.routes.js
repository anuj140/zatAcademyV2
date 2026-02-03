const express = require("express");
const router = express.Router();
const {
  createLearningMaterial,
  getBatchMaterials,
  getLearningMaterial,
  updateLearningMaterial,
  deleteLearningMaterial,
  togglePublish,
  getMaterialStats,
} = require("../controllers/learningMaterial.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const {
  canAccessBatchMaterials,
  canManageBatchContent,
} = require("../middleware/accessControl");
const { uploadSessionMaterial, handleUploadError } = require("../middleware/uploads");

// All routes protected
router.use(protect);

// Batch materials
router.get(
  "/batches/:batchId/learning-materials",
  canAccessBatchMaterials,
  getBatchMaterials,
);
router.get(
  "/batches/:batchId/learning-materials/stats",
  authorize("instructor", "admin", "superAdmin"),
  getMaterialStats,
);

// Material CRUD
router.post(
  "/batches/:batchId/learning-materials",
  authorize("instructor", "admin", "superAdmin"),
  canManageBatchContent,
  uploadSessionMaterial,
  handleUploadError,
  createLearningMaterial,
);
//! TODO: Does not respect the 'isPublish' flag, even with 'isPublish' set to false, student can access that material
router.get("/:id", getLearningMaterial);
router.put(
  "/:id",
  authorize("instructor", "admin", "superAdmin"),
  uploadSessionMaterial,
  handleUploadError,
  updateLearningMaterial,
);
router.delete(
  "/:id",
  authorize("instructor", "admin", "superAdmin"),
  deleteLearningMaterial,
);
router.put("/:id/publish", authorize("instructor", "admin", "superAdmin"), togglePublish);

module.exports = router;
