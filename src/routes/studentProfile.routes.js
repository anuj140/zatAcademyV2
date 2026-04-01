const express = require("express");
const router = express.Router();
const {
  checkProfileExists,
  getPreFillData,
  submitProfile,
  viewProfile,
  updateProfile,
  deleteProfile,
} = require("../controllers/studentProfile.controller");
const { protect, requirePhoneVerifiedForWrites } = require("../middleware/auth");
const { authorize } = require("../middleware/role");

// All routes protected
router.use(protect);
// Block unverified-phone users from all writes (submit & update profile)
router.use(requirePhoneVerifiedForWrites);

// Student routes
// Check if profile exists (before enrollment)
router.get("/check", authorize("student"), checkProfileExists);

// Get pre-fill data for form
router.get("/pre-fill", authorize("student"), getPreFillData);

// Submit new profile form
router.post("/", authorize("student"), submitProfile);

// View profile (student own or admin any)
router.get("/:id", authorize("student", "admin", "superAdmin"), viewProfile);

// Update existing profile (student own or admin any)
router.put("/:id", authorize("student", "admin", "superAdmin"), updateProfile);

// Delete profile (admin only)
router.delete("/:id", authorize("admin", "superAdmin"), deleteProfile);

module.exports = router;
