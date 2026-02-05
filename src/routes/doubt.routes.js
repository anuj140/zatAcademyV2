const express = require("express");
const router = express.Router();
const {
  createDoubt,
  replyToDoubt,
  getBatchDoubts,
  getDoubt,
  resolveDoubt,
  voteDoubt,
  followDoubt,
  getInstructorDoubts,
  pinDoubt,
} = require("../controllers/doubt.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { uploadDoubtAttachments, handleUploadError } = require("../middleware/uploads");

// All routes protected
router.use(protect);

// Student routes
router.post(
  "/",
  authorize("student"),
  uploadDoubtAttachments,
  handleUploadError,
  createDoubt,
);

router.post("/:id/reply", uploadDoubtAttachments, handleUploadError, replyToDoubt);

router.post("/:id/vote", voteDoubt);
router.post("/:id/follow", followDoubt);

// Batch doubts
router.get("/batches/:batchId/doubts", getBatchDoubts);

// Single doubt
router.get("/:id", getDoubt);

// Instructor routes
router.get(
  "/instructor/doubts",
  authorize("instructor", "admin", "superAdmin"),
  getInstructorDoubts,
);
router.put("/:id/resolve", authorize("instructor", "admin", "superAdmin"), resolveDoubt);
router.put("/:id/pin", authorize("instructor", "admin", "superAdmin"), pinDoubt);

module.exports = router;
