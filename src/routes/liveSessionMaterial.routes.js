const express = require("express");
const router = express.Router();
const {
  uploadMaterial,
  getSessionMaterials,
  getMaterial,
  updateMaterial,
  deleteMaterial,
  getStudentSessions,
} = require("../controllers/sessionMaterial.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { uploadSessionMaterial, handleUploadError } = require("../middleware/uploads");

// All routes protected
router.use(protect);

// Student dashboard
router.get("/student/sessions", authorize("student"), getStudentSessions);

// Session materials
router.get("/live-sessions/:sessionId/materials", getSessionMaterials);
router.post(
  "/",
  authorize("instructor", "admin", "superAdmin"),
  uploadSessionMaterial,
  handleUploadError,
  uploadMaterial,
);

// Material CRUD
router.get("/:id", getMaterial);
router.put(
  "/:id",
  authorize("instructor", "admin", "superAdmin"),
  uploadSessionMaterial,
  handleUploadError,
  updateMaterial,
);
router.delete("/:id", authorize("instructor", "admin", "superAdmin"), deleteMaterial);

module.exports = router;
