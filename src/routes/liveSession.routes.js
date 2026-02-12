const express = require("express");
const router = express.Router();
const {
  createLiveSession,
  getBatchSessions,
  getLiveSession,
  updateLiveSession,
  cancelLiveSession,
  getSessionJoinLink,
  recordAttendance,
  getInstructorSessions,
  uploadRecording,
} = require("../controllers/liveSession.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const {
  canJoinSession,
  validateSessionToken,
} = require("../middleware/videoAuth");
const {
  uploadRecording: uploadRecordingMiddleware,
  handleUploadError,
} = require("../middleware/uploads");

// All routes protected
router.use(protect);

// Instructor routes
router.post("/", authorize("instructor", "admin", "superAdmin"), createLiveSession);
router.get(
  "/instructor/sessions",
  authorize("instructor", "admin", "superAdmin"),
  getInstructorSessions,
);
router.put(
  "/:id/cancel",
  authorize("instructor", "admin", "superAdmin"),
  cancelLiveSession,
);
router.post(
  "/:id/recording",
  authorize("instructor", "admin", "superAdmin"),
  uploadRecordingMiddleware,
  handleUploadError,
  uploadRecording,
);

// Batch sessions
router.get("/batches/:batchId/sessions", getBatchSessions);

// Session management
router.get("/:id", getLiveSession);
router.put("/:id", authorize("instructor", "admin", "superAdmin"), updateLiveSession);

// Session access
router.get("/:id/join-link", canJoinSession, getSessionJoinLink);

// Attendance (called by video system - requires special auth)
router.post("/:id/attendance", validateSessionToken, recordAttendance);

module.exports = router;
