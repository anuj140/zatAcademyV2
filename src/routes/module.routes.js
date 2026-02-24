const express = require("express");
const router = express.Router();
const {
  createModule,
  getModulesByCourse,
  getModule,
  updateModule,
  publishModule,
  archiveModule,
  deleteModule,
  addContentToModule,
  getModuleContentSummary,
  getAllModules,
} = require("../controllers/module.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// All routes protected
router.use(protect);

// Admin/Instructor routes for module management
router.post("/", authorize("admin", "superAdmin"), createModule); //[x]

// Get all modules (admin and instructor)
router.get("/", authorize("admin", "superAdmin"), getAllModules); // [x]

// Get modules for a specific course
router.get("/course/:courseId", getModulesByCourse); // [x]

// Get single module with all content
router.get("/:id", getModule); // [x]

// Update module
router.put("/:id", authorize("admin", "superAdmin"), updateModule);

// Publish module (make it available to students)
router.put("/:id/publish", authorize("admin", "superAdmin"), publishModule); // [x]

// Archive module (remove from active course)
router.put("/:id/archive", authorize("admin", "superAdmin"), archiveModule); // [x]

// Add content to module
router.put("/:id/add-content", authorize("admin", "superAdmin"), addContentToModule); // [x]

// Get module content summary (stats and overview)
router.get("/:id/content-summary", getModuleContentSummary); // [x]

// Delete module
router.delete("/:id", authorize("admin", "superAdmin"), deleteModule);

module.exports = router;
