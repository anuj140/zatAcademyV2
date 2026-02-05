const express = require("express");
const router = express.Router();
const {
  getSystemAnalytics,
  getBatchAnalytics,
  getCourseAnalytics,
  getPaymentCollectionReport,
  getStudentEngagementMetrics,
  getRevenueAnalytics,
  getEnrollmentAnalytics,
  clearAnalyticsCache,
  getAdminDashboard,
} = require("../controllers/analytics.controller");
const { protect } = require("../middleware/auth");
const { authorize } = require("../middleware/role");
const { cacheResponse } = require("../middleware/cache");

// All routes protected
router.use(protect);
router.use(authorize("admin", "superAdmin"));

// Analytics endpoints with caching
router.get("/system", cacheResponse(300), getSystemAnalytics);
router.get("/batches/:batchId", cacheResponse(300), getBatchAnalytics);
router.get("/courses/:courseId", cacheResponse(3600), getCourseAnalytics);
router.get("/payments", cacheResponse(300), getPaymentCollectionReport);
router.get("/engagement", cacheResponse(300), getStudentEngagementMetrics);
router.get("/revenue", cacheResponse(300), getRevenueAnalytics);
router.get("/enrollments", cacheResponse(300), getEnrollmentAnalytics);

// Admin dashboard
router.get("/dashboard", cacheResponse(60), getAdminDashboard); // 1 minute cache for real-time dashboard

// Cache management
router.delete("/cache", clearAnalyticsCache);

module.exports = router;
