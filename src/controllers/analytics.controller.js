const analyticsCalculator = require("../utils/analyticsCalculator");
const AnalyticsCache = require("../models/AnalyticsCache");
const { clearCache } = require("../middleware/cache");

// @desc    Get system-wide analytics
// @route   GET /api/v1/analytics/system
// @access  Private/Admin
exports.getSystemAnalytics = async (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    const analytics = await analyticsCalculator.getSystemAnalytics(timeRange);

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get batch analytics
// @route   GET /api/v1/analytics/batches/:batchId
// @access  Private/Admin/Instructor
exports.getBatchAnalytics = async (req, res) => {
  try {
    const { batchId } = req.params;
    const { timeRange = "30d" } = req.query;

    // Check authorization
    if (req.user.role === "instructor") {
      const Batch = require("../models/Batch");
      const batch = await Batch.findById(batchId);

      if (!batch || batch.instructor.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: "Not authorized to view analytics for this batch",
        });
      }
    }

    const analytics = await analyticsCalculator.getBatchAnalytics(batchId, timeRange);

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get course analytics
// @route   GET /api/v1/analytics/courses/:courseId
// @access  Private/Admin
exports.getCourseAnalytics = async (req, res) => {
  try {
    const { courseId } = req.params;
    const { timeRange = "30d" } = req.query;

    const analytics = await analyticsCalculator.getCourseAnalytics(courseId, timeRange);

    res.status(200).json({
      success: true,
      data: analytics,
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get payment collection report
// @route   GET /api/v1/analytics/payments
// @access  Private/Admin
exports.getPaymentCollectionReport = async (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    const report = await analyticsCalculator.getPaymentCollectionReport(timeRange);

    res.status(200).json({
      success: true,
      data: report,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get student engagement metrics
// @route   GET /api/v1/analytics/engagement
// @access  Private/Admin
exports.getStudentEngagementMetrics = async (req, res) => {
  try {
    const { timeRange = "30d" } = req.query;

    const metrics = await analyticsCalculator.getStudentEngagementMetrics(timeRange);

    res.status(200).json({
      success: true,
      data: metrics,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get revenue analytics
// @route   GET /api/v1/analytics/revenue
// @access  Private/Admin
exports.getRevenueAnalytics = async (req, res) => {
  try {
    const { timeRange = "30d", groupBy = "month" } = req.query;

    const dateFilter = analyticsCalculator.getDateFilter(timeRange);

    const Payment = require("../models/Payment");

    const groupStage = {};
    if (groupBy === "month") {
      groupStage._id = {
        month: { $month: "$paymentDate" },
        year: { $year: "$paymentDate" },
      };
    } else if (groupBy === "week") {
      groupStage._id = {
        week: { $week: "$paymentDate" },
        year: { $year: "$paymentDate" },
      };
    } else if (groupBy === "day") {
      groupStage._id = {
        day: { $dayOfMonth: "$paymentDate" },
        month: { $month: "$paymentDate" },
        year: { $year: "$paymentDate" },
      };
    } else {
      groupStage._id = null;
    }

    const revenueData = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $group: {
          ...groupStage,
          totalRevenue: { $sum: "$amount" },
          transactionCount: { $sum: 1 },
          averageTransaction: { $avg: "$amount" },
          fullPaymentRevenue: {
            $sum: { $cond: [{ $eq: ["$paymentType", "full"] }, "$amount", 0] },
          },
          emiRevenue: {
            $sum: { $cond: [{ $eq: ["$paymentType", "emi"] }, "$amount", 0] },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Calculate totals
    const totals = revenueData.reduce(
      (acc, item) => ({
        totalRevenue: acc.totalRevenue + item.totalRevenue,
        transactionCount: acc.transactionCount + item.transactionCount,
        fullPaymentRevenue: acc.fullPaymentRevenue + item.fullPaymentRevenue,
        emiRevenue: acc.emiRevenue + item.emiRevenue,
      }),
      {
        totalRevenue: 0,
        transactionCount: 0,
        fullPaymentRevenue: 0,
        emiRevenue: 0,
      },
    );

    totals.averageTransaction =
      totals.transactionCount > 0 ? totals.totalRevenue / totals.transactionCount : 0;

    res.status(200).json({
      success: true,
      data: {
        timeRange,
        groupBy,
        totals,
        breakdown: revenueData,
        calculatedAt: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get enrollment analytics
// @route   GET /api/v1/analytics/enrollments
// @access  Private/Admin
exports.getEnrollmentAnalytics = async (req, res) => {
  try {
    const { timeRange = "30d", courseId, batchId } = req.query;

    const dateFilter = analyticsCalculator.getDateFilter(timeRange);

    const Enrollment = require("../models/Enrollment");

    // Build match stage
    const matchStage = { enrollmentDate: dateFilter };

    if (courseId) {
      matchStage.course = require("mongoose").Types.ObjectId(courseId);
    }

    if (batchId) {
      matchStage.batch = require("mongoose").Types.ObjectId(batchId);
    }

    const enrollmentData = await Enrollment.aggregate([
      { $match: matchStage },
      {
        $group: {
          _id: {
            month: { $month: "$enrollmentDate" },
            year: { $year: "$enrollmentDate" },
          },
          count: { $sum: 1 },
          activeEnrollments: {
            $sum: { $cond: [{ $eq: ["$enrollmentStatus", "active"] }, 1, 0] },
          },
          completedEnrollments: {
            $sum: { $cond: [{ $eq: ["$enrollmentStatus", "completed"] }, 1, 0] },
          },
          cancelledEnrollments: {
            $sum: { $cond: [{ $eq: ["$enrollmentStatus", "cancelled"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Get enrollment by course
    const enrollmentByCourse = await Enrollment.aggregate([
      { $match: matchStage },
      {
        $lookup: {
          from: "courses",
          localField: "course",
          foreignField: "_id",
          as: "courseInfo",
        },
      },
      { $unwind: "$courseInfo" },
      {
        $group: {
          _id: "$course",
          courseName: { $first: "$courseInfo.title" },
          count: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { count: -1 } },
      { $limit: 10 },
    ]);

    // Calculate conversion rate (placeholder)
    // In production, you would track website visitors vs enrollments

    res.status(200).json({
      success: true,
      data: {
        timeRange,
        totalEnrollments: enrollmentData.reduce((sum, item) => sum + item.count, 0),
        monthlyTrend: enrollmentData,
        byCourse: enrollmentByCourse,
        conversionRate: 3.5, // Placeholder
        calculatedAt: new Date(),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Clear analytics cache
// @route   DELETE /api/v1/analytics/cache
// @access  Private/Admin
exports.clearAnalyticsCache = async (req, res) => {
  try {
    const { pattern } = req.query;

    const patterns = pattern
      ? [pattern]
      : [
          "system_analytics_",
          "batch_analytics_",
          "course_analytics_",
          "payment_collection_",
          "student_engagement_",
          "api:",
        ];

    const result = await clearCache(patterns);

    res.status(200).json({
      success: true,
      message: "Analytics cache cleared",
      data: result,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get real-time dashboard data
// @route   GET /api/v1/analytics/dashboard
// @access  Private/Admin
exports.getAdminDashboard = async (req, res) => {
  try {
    // Get real-time data in parallel
    const [systemAnalytics, paymentReport, engagementMetrics, recentActivities] =
      await Promise.all([
        analyticsCalculator.getSystemAnalytics("24h"),
        analyticsCalculator.getPaymentCollectionReport("24h"),
        analyticsCalculator.getStudentEngagementMetrics("24h"),
        getRecentActivities(),
      ]);

    // Get top performing courses
    const Course = require("../models/Course");
    const topCourses = await Course.aggregate([
      { $match: { isPublished: true } },
      {
        $lookup: {
          from: "enrollments",
          localField: "_id",
          foreignField: "course",
          as: "enrollments",
        },
      },
      {
        $project: {
          title: 1,
          fee: 1,
          enrollmentCount: { $size: "$enrollments" },
          revenue: {
            $multiply: [{ $size: "$enrollments" }, "$fee"],
          },
        },
      },
      { $sort: { enrollmentCount: -1 } },
      { $limit: 5 },
    ]);

    // Get pending actions
    const pendingActions = await getPendingActions();

    const dashboard = {
      overview: systemAnalytics.overview,
      financial: {
        today: paymentReport.summary,
        trend: paymentReport.monthlyBreakdown.slice(-7), // Last 7 days
      },
      engagement: engagementMetrics,
      topCourses,
      recentActivities,
      pendingActions,
      lastUpdated: new Date(),
    };

    res.status(200).json({
      success: true,
      data: dashboard,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Helper functions
async function getRecentActivities() {
  const activities = [];

  // Get recent enrollments
  const Enrollment = require("../models/Enrollment");
  const recentEnrollments = await Enrollment.find()
    .sort({ enrollmentDate: -1 })
    .limit(5)
    .populate("student", "name")
    .populate("course", "title")
    .populate("batch", "name");

  recentEnrollments.forEach((enrollment) => {
    activities.push({
      type: "enrollment",
      title: `New enrollment in ${enrollment.course?.title}`,
      user: enrollment.student?.name,
      timestamp: enrollment.enrollmentDate,
      details: {
        batch: enrollment.batch?.name,
        paymentMethod: enrollment.paymentMethod,
      },
    });
  });

  // Get recent payments
  const Payment = require("../models/Payment");
  const recentPayments = await Payment.find({ status: "completed" })
    .sort({ paymentDate: -1 })
    .limit(5)
    .populate("student", "name")
    .populate("course", "title");

  recentPayments.forEach((payment) => {
    activities.push({
      type: "payment",
      title: `Payment received for ${payment.course?.title}`,
      user: payment.student?.name,
      timestamp: payment.paymentDate,
      details: {
        amount: payment.amount,
        type: payment.paymentType,
      },
    });
  });

  // Get recent doubts
  const Doubt = require("../models/Doubt");
  const recentDoubts = await Doubt.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .populate("student", "name")
    .populate("batch", "name");

  recentDoubts.forEach((doubt) => {
    activities.push({
      type: "doubt",
      title: `New doubt: ${doubt.title.substring(0, 50)}...`,
      user: doubt.isAnonymous ? "Anonymous" : doubt.student?.name,
      timestamp: doubt.createdAt,
      details: {
        batch: doubt.batch?.name,
        status: doubt.status,
      },
    });
  });

  // Sort all activities by timestamp
  activities.sort((a, b) => b.timestamp - a.timestamp);

  return activities.slice(0, 10); // Return top 10
}

async function getPendingActions() {
  const actions = [];

  // Check for unresolved doubts
  const Doubt = require("../models/Doubt");
  const unresolvedDoubts = await Doubt.countDocuments({
    status: { $in: ["open", "answered"] },
    priority: { $in: ["high", "urgent"] },
  });

  if (unresolvedDoubts > 0) {
    actions.push({
      type: "doubt",
      title: `${unresolvedDoubts} urgent doubts need attention`,
      priority: "high",
      link: "/admin/doubts?status=open&priority=high",
    });
  }

  // Check for pending payments
  const Payment = require("../models/Payment");
  const pendingPayments = await Payment.countDocuments({
    status: "pending",
    dueDate: { $lt: new Date() },
  });

  if (pendingPayments > 0) {
    actions.push({
      type: "payment",
      title: `${pendingPayments} overdue payments`,
      priority: "medium",
      link: "/admin/payments?status=pending&overdue=true",
    });
  }

  // Check for batch starting soon
  const Batch = require("../models/Batch");
  const oneWeekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const startingBatches = await Batch.countDocuments({
    startDate: { $gt: new Date(), $lt: oneWeekFromNow },
    isActive: true,
  });

  if (startingBatches > 0) {
    actions.push({
      type: "batch",
      title: `${startingBatches} batches starting soon`,
      priority: "low",
      link: "/admin/batches?status=upcoming",
    });
  }

  return actions;
}
