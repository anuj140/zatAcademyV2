const express = require("express");
const router = express.Router();
const {
  createModule,
  getCourseCurriculum,
  getModuleCurriculum,
  updateModule,
  deleteModule,
  togglePublish,
  addItemToModule,
  removeItemFromModule,
  reorderModuleItems,
  reorderModules,
} = require("../controllers/module.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

router.use(protect);

// Course curriculum
router.get("/courses/:courseId/batches/:batchId/curriculum", getCourseCurriculum);

// Batch module reordering - FIXED PATH
router.put(
  "/batches/:batchId/reorder",
  authorize("instructor", "admin", "superAdmin"),
  reorderModules,
);

// Create module
router.post("/", authorize("instructor", "admin", "superAdmin"), createModule);

// ===== MODULE ITEM OPERATIONS =====

// Reorder items
router.put(
  "/:id/items/reorder",
  authorize("instructor", "admin", "superAdmin"),
  reorderModuleItems,
);

// Add item
router.post(
  "/:id/items",
  authorize("instructor", "admin", "superAdmin"),
  addItemToModule,
);

// Remove item
router.delete(
  "/:id/items/:itemId",
  authorize("instructor", "admin", "superAdmin"),
  removeItemFromModule,
);

// ===== MODULE-SPECIFIC OPERATIONS =====

// Toggle publish
router.put("/:id/publish", authorize("instructor", "admin", "superAdmin"), togglePublish);

// Get module curriculum
router.get("/:id/curriculum", getModuleCurriculum);

// ===== GENERIC CRUD (must be last) =====

// Update module
router.put("/:id", authorize("instructor", "admin", "superAdmin"), updateModule);

// Delete module
router.delete("/:id", authorize("instructor", "admin", "superAdmin"), deleteModule);

module.exports = router;
