const express = require("express");
const router = express.Router();
const {
  register,
  login,
  refreshToken,
  logout,
  logoutAll,
  getActiveSessions,
  revokeSession,
  forgotPassword,
  resetPassword,
  getMe,
  updateDetails,
  updatePassword,
  verifyToken,
} = require("../controllers/auth.controller");
const {
  protect,
  validateRefreshToken,
  extractDeviceInfo,
  authRateLimit,
  optionalAuth,
} = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const useragent = require("express-useragent");

// Use useragent middleware
router.use(useragent.express());

// Public routes with rate limiting
router.post("/register", authRateLimit, extractDeviceInfo, register);
router.post("/login", authRateLimit, extractDeviceInfo, login);
router.post(
  "/refresh",
  authRateLimit,
  validateRefreshToken,
  extractDeviceInfo,
  refreshToken,
);
router.post("/forgot-password", authRateLimit, forgotPassword);
router.put("/reset-password/:resetToken", authRateLimit, resetPassword);

// Protected routes
router.post("/logout", protect, logout);
router.post("/logout-all", protect, logoutAll);
router.get("/sessions", protect, getActiveSessions);
router.delete("/sessions/:deviceId", protect, revokeSession);
router.get("/me", protect, getMe);
router.put("/update-details", protect, updateDetails);
router.put("/update-password", protect, updatePassword);
router.get("/verify", protect, verifyToken);

module.exports = router;
