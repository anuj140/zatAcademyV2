const Enrollment = require("../models/Enrollment");
const Course = require("../models/Course");
const Batch = require("../models/Batch");
const Payment = require("../models/Payment");
const LiveSession = require("../models/LiveSession");
const LearningMaterial = require("../models/LearningMaterial");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Doubt = require("../models/Doubt");
const Progress = require("../models/Progress");
const AnalyticsCache = require("../models/AnalyticsCache");
const mongoose = require("mongoose");

class AnalyticsCalculator {
  /**
   * Get system-wide analytics
   */
  async getSystemAnalytics(timeRange = "30d") {
    const cacheKey = `system_analytics_${timeRange}`;

    // Check cache
    const cached = await AnalyticsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const dateFilter = this.getDateFilter(timeRange);

    // Calculate all metrics in parallel
    const [
      totalEnrollments,
      activeEnrollments,
      totalRevenue,
      averageSessionAttendance,
      assignmentSubmissionRate,
      doubtResolutionRate,
      courseStats,
      paymentStats,
    ] = await Promise.all([
      this.getTotalEnrollments(dateFilter),
      this.getActiveEnrollments(),
      this.getTotalRevenue(dateFilter),
      this.getAverageSessionAttendance(dateFilter),
      this.getAssignmentSubmissionRate(dateFilter),
      this.getDoubtResolutionRate(dateFilter),
      this.getCourseStats(),
      this.getPaymentStats(dateFilter),
    ]);

    const analytics = {
      overview: {
        totalEnrollments,
        activeEnrollments,
        totalCourses: await Course.countDocuments(),
        totalBatches: await Batch.countDocuments({ isActive: true }),
        totalInstructors: await require("../models/User").countDocuments({
          role: "instructor",
          isActive: true,
        }),
        totalStudents: await require("../models/User").countDocuments({
          role: "student",
          isActive: true,
        }),
      },
      financial: {
        totalRevenue,
        ...paymentStats,
        averageRevenuePerStudent:
          activeEnrollments > 0 ? totalRevenue / activeEnrollments : 0,
      },
      engagement: {
        averageSessionAttendance,
        assignmentSubmissionRate,
        doubtResolutionRate,
        averageProgress: await this.getAverageStudentProgress(),
        activeStudentsPercentage: await this.getActiveStudentsPercentage(),
      },
      coursePerformance: courseStats,
      timeRange,
      calculatedAt: new Date(),
    };

    // Cache the results
    const ttl = timeRange === "24h" ? 300 : 3600; // 5 minutes for daily, 1 hour for others
    await AnalyticsCache.set(cacheKey, analytics, ttl);

    return analytics;
  }

  /**
   * Get batch-wise analytics
   */
  async getBatchAnalytics(batchId, timeRange = "30d") {
    //1. Genreate simple cache key by prefix and batchId and provided timeRange
    const cacheKey = `batch_analytics_${batchId}_${timeRange}`;

    // Check cache
    //If there any cached data return that 'cache data'
    const cached = await AnalyticsCache.get(cacheKey);
    if (cached) {
      return cached;
    }
    //Get time difference
    const dateFilter = this.getDateFilter(timeRange);
    //2. Find the batch by it's id and populate course, instructor
    const batch = await Batch.findById(batchId).populate("course instructor");

    //3. If batch is not found
    if (!batch) {
      throw new Error("Batch not found");
    }

    // Get batch-specific metrics
    //4.
    const [
      enrollmentStats,
      paymentStats,
      sessionStats,
      assignmentStats,
      doubtStats,
      progressStats,
    ] = await Promise.all([
      this.getBatchEnrollmentStats(batchId, dateFilter),
      this.getBatchPaymentStats(batchId, dateFilter),
      this.getBatchSessionStats(batchId, dateFilter),
      this.getBatchAssignmentStats(batchId, dateFilter),
      this.getBatchDoubtStats(batchId, dateFilter),
      this.getBatchProgressStats(batchId),
    ]);

    const analytics = {
      batchInfo: {
        id: batch._id,
        name: batch.name,
        course: batch.course?.title,
        instructor: batch.instructor?.name,
        startDate: batch.startDate,
        endDate: batch.endDate,
        currentStudents: batch.currentStudents,
        maxStudents: batch.maxStudents,
        occupancyRate: (batch.currentStudents / batch.maxStudents) * 100,
      },
      enrollment: enrollmentStats,
      financial: paymentStats,
      engagement: {
        sessions: sessionStats,
        assignments: assignmentStats,
        doubts: doubtStats,
      },
      performance: progressStats,
      timeRange,
      calculatedAt: new Date(),
    };

    // Cache the results
    await AnalyticsCache.set(cacheKey, analytics, 300); // 5 minutes TTL

    return analytics;
  }

  /**
   * Get course-wise analytics
   */
  async getCourseAnalytics(courseId, timeRange = "30d") {
    const cacheKey = `course_analytics_${courseId}_${timeRange}`;

    // Check cache
    const cached = await AnalyticsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const dateFilter = this.getDateFilter(timeRange);
    const course = await Course.findById(courseId);

    if (!course) {
      throw new Error("Course not found");
    }

    // Get course batches
    const batches = await Batch.find({ course: courseId, isActive: true });

    // Calculate course metrics
    const [enrollmentStats, revenueStats, batchStats, studentSatisfaction] =
      await Promise.all([
        this.getCourseEnrollmentStats(courseId, dateFilter),
        this.getCourseRevenueStats(courseId, dateFilter),
        this.getCourseBatchStats(courseId),
        this.getCourseStudentSatisfaction(courseId, dateFilter),
      ]);

    const analytics = {
      courseInfo: {
        id: course._id,
        title: course.title,
        fee: course.fee,
        emiAmount: course.emiAmount,
        duration: course.duration,
        isPublished: course.isPublished,
      },
      enrollment: enrollmentStats,
      financial: revenueStats,
      batches: {
        total: batches.length,
        active: batches.filter((b) => b.isActive).length,
        completed: batches.filter((b) => b.endDate < new Date()).length,
        upcoming: batches.filter((b) => b.startDate > new Date()).length,
        averageOccupancy:
          batches.length > 0
            ? (batches.reduce((sum, b) => sum + b.currentStudents / b.maxStudents, 0) /
                batches.length) *
              100
            : 0,
      },
      satisfaction: studentSatisfaction,
      timeRange,
      calculatedAt: new Date(),
    };

    // Cache the results
    await AnalyticsCache.set(cacheKey, analytics, 3600); // 1 hour TTL

    return analytics;
  }

  /**
   * Get payment collection reports (full vs EMI)
   */
  async getPaymentCollectionReport(timeRange = "30d") {
    const cacheKey = `payment_collection_${timeRange}`;

    // Check cache
    const cached = await AnalyticsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const dateFilter = this.getDateFilter(timeRange);

    const payments = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $lookup: {
          from: "enrollments",
          localField: "enrollment",
          foreignField: "_id",
          as: "enrollmentInfo",
        },
      },
      { $unwind: "$enrollmentInfo" },
      {
        $group: {
          _id: {
            paymentType: "$paymentType",
            month: { $month: "$paymentDate" },
            year: { $year: "$paymentDate" },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          fullPayments: {
            $sum: { $cond: [{ $eq: ["$paymentType", "full"] }, 1, 0] },
          },
          emiPayments: {
            $sum: { $cond: [{ $eq: ["$paymentType", "emi"] }, 1, 0] },
          },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    // Calculate totals
    let totalFullAmount = 0;
    let totalEMIAmount = 0;
    let totalFullCount = 0;
    let totalEMICount = 0;

    payments.forEach((payment) => {
      if (payment._id.paymentType === "full") {
        totalFullAmount += payment.totalAmount;
        totalFullCount += payment.count;
      } else if (payment._id.paymentType === "emi") {
        totalEMIAmount += payment.totalAmount;
        totalEMICount += payment.count;
      }
    });

    const totalAmount = totalFullAmount + totalEMIAmount;
    const totalCount = totalFullCount + totalEMICount;

    const report = {
      summary: {
        totalAmount,
        totalCount,
        fullPayment: {
          amount: totalFullAmount,
          count: totalFullCount,
          percentage: totalAmount > 0 ? (totalFullAmount / totalAmount) * 100 : 0,
        },
        emiPayment: {
          amount: totalEMIAmount,
          count: totalEMICount,
          percentage: totalAmount > 0 ? (totalEMIAmount / totalAmount) * 100 : 0,
        },
        averagePayment: totalCount > 0 ? totalAmount / totalCount : 0,
      },
      monthlyBreakdown: payments,
      timeRange,
      calculatedAt: new Date(),
    };

    // Cache the results
    await AnalyticsCache.set(cacheKey, report, 3600); // 1 hour TTL

    return report;
  }

  /**
   * Get student engagement metrics
   */
  async getStudentEngagementMetrics(timeRange = "30d") {
    const cacheKey = `student_engagement_${timeRange}`;

    // Check cache
    const cached = await AnalyticsCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const dateFilter = this.getDateFilter(timeRange);

    // Get engagement metrics
    const [
      sessionAttendance,
      materialCompletion,
      assignmentSubmission,
      doubtParticipation,
      activeUsers,
    ] = await Promise.all([
      this.getSessionAttendanceMetrics(dateFilter),
      this.getMaterialCompletionMetrics(dateFilter),
      this.getAssignmentSubmissionMetrics(dateFilter),
      this.getDoubtParticipationMetrics(dateFilter),
      this.getActiveUserMetrics(dateFilter),
    ]);

    const metrics = {
      sessionAttendance,
      materialCompletion,
      assignmentSubmission,
      doubtParticipation,
      activeUsers,
      overallEngagement: this.calculateOverallEngagement(
        sessionAttendance,
        materialCompletion,
        assignmentSubmission,
        doubtParticipation,
      ),
      timeRange,
      calculatedAt: new Date(),
    };

    // Cache the results
    await AnalyticsCache.set(cacheKey, metrics, 300); // 5 minutes TTL

    return metrics;
  }

  // Helper methods

  getDateFilter(timeRange) {
    const now = new Date();
    const filter = {};

    switch (timeRange) {
      case "24h":
        filter.$gte = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case "7d":
        filter.$gte = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case "30d":
        filter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case "90d":
        filter.$gte = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case "1y":
        filter.$gte = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      default:
        filter.$gte = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    filter.$lte = now;
    return filter;
  }

  async getTotalEnrollments(dateFilter) {
    return Enrollment.countDocuments({
      enrollmentDate: dateFilter,
    });
  }

  async getActiveEnrollments() {
    return Enrollment.countDocuments({
      enrollmentStatus: "active",
      accessRevoked: false,
    });
  }

  async getTotalRevenue(dateFilter) {
    const result = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          total: { $sum: "$amount" },
        },
      },
    ]);

    return result[0]?.total || 0;
  }

  async getAverageSessionAttendance(dateFilter) {
    const sessions = await LiveSession.find({
      startTime: dateFilter,
      status: { $in: ["completed", "ongoing"] },
    });

    if (sessions.length === 0) return 0;

    const totalAttendance = sessions.reduce(
      (sum, session) => sum + (session.attendees?.length || 0),
      0,
    );

    const totalPossibleAttendance = sessions.reduce((sum, session) => {
      const Batch = require("../models/Batch");
      // This would need batch student count
      return sum + 20; // Placeholder
    }, 0);

    return totalPossibleAttendance > 0
      ? (totalAttendance / totalPossibleAttendance) * 100
      : 0;
  }

  async getAssignmentSubmissionRate(dateFilter) {
    const assignments = await Assignment.find({
      deadline: dateFilter,
      isPublished: true,
    });

    if (assignments.length === 0) return 0;

    const submissions = await Submission.find({
      submittedAt: dateFilter,
      status: { $in: ["submitted", "graded"] },
    });

    // Estimate submission rate
    return assignments.length > 0
      ? (submissions.length / (assignments.length * 20)) * 100
      : 0;
  }

  async getDoubtResolutionRate(dateFilter) {
    const doubts = await Doubt.find({
      createdAt: dateFilter,
    });

    if (doubts.length === 0) return 0;

    const resolvedDoubts = await Doubt.countDocuments({
      createdAt: dateFilter,
      status: "resolved",
    });

    return (resolvedDoubts / doubts.length) * 100;
  }

  async getCourseStats() {
    const courses = await Course.find({ isPublished: true });

    const stats = await Promise.all(
      courses.map(async (course) => {
        const batches = await Batch.countDocuments({ course: course._id });
        const enrollments = await Enrollment.countDocuments({
          course: course._id,
          enrollmentStatus: "active",
        });

        return {
          courseId: course._id,
          title: course.title,
          batches,
          enrollments,
          revenue: 0, // Would need payment data per course
        };
      }),
    );

    // Sort by enrollments
    stats.sort((a, b) => b.enrollments - a.enrollments);

    return stats;
  }

  async getPaymentStats(dateFilter) {
    const payments = await Payment.aggregate([
      {
        $match: {
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $group: {
          _id: "$paymentType",
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          averageAmount: { $avg: "$amount" },
        },
      },
    ]);

    const stats = {
      full: { amount: 0, count: 0, average: 0 },
      emi: { amount: 0, count: 0, average: 0 },
      other: { amount: 0, count: 0, average: 0 },
    };

    payments.forEach((payment) => {
      const type = payment._id || "other";
      if (stats[type]) {
        stats[type] = {
          amount: payment.totalAmount,
          count: payment.count,
          average: payment.averageAmount,
        };
      }
    });

    return stats;
  }

  async getAverageStudentProgress() {
    const progresses = await Progress.find();

    if (progresses.length === 0) return 0;

    const totalProgress = progresses.reduce(
      (sum, progress) => sum + (progress.overallProgress || 0),
      0,
    );

    return totalProgress / progresses.length;
  }

  async getActiveStudentsPercentage() {
    const totalStudents = await require("../models/User").countDocuments({
      role: "student",
      isActive: true,
    });

    if (totalStudents === 0) return 0;

    // Students active in last 7 days
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeStudents = await Progress.countDocuments({
      lastActive: { $gte: sevenDaysAgo },
    });

    return (activeStudents / totalStudents) * 100;
  }

  async getBatchEnrollmentStats(batchId, dateFilter) {
    const enrollments = await Enrollment.find({
      batch: batchId,
      enrollmentDate: dateFilter,
    });

    return {
      total: enrollments.length,
      active: enrollments.filter((e) => e.enrollmentStatus === "active").length,
      completed: enrollments.filter((e) => e.enrollmentStatus === "completed").length,
      cancelled: enrollments.filter((e) => e.enrollmentStatus === "cancelled").length,
    };
  }

  async getBatchPaymentStats(batchId, dateFilter) {
    const batchObjectId = new mongoose.Types.ObjectId(batchId);
    const payments = await Payment.aggregate([
      {
        $match: {
          batch: batchObjectId,
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
          fullAmount: {
            $sum: { $cond: [{ $eq: ["$paymentType", "full"] }, "$amount", 0] },
          },
          emiAmount: {
            $sum: { $cond: [{ $eq: ["$paymentType", "emi"] }, "$amount", 0] },
          },
        },
      },
    ]);

    const result = payments[0] || {
      totalAmount: 0,
      count: 0,
      fullAmount: 0,
      emiAmount: 0,
    };

    return {
      total: result.totalAmount,
      count: result.count,
      full: result.fullAmount,
      emi: result.emiAmount,
      average: result.count > 0 ? result.totalAmount / result.count : 0,
    };
  }

  async getBatchSessionStats(batchId, dateFilter) {
    const sessions = await LiveSession.find({
      batch: batchId,
      startTime: dateFilter,
    });

    const totalAttendance = sessions.reduce(
      (sum, session) => sum + (session.attendees?.length || 0),
      0,
    );

    const batch = await Batch.findById(batchId);
    const totalPossibleAttendance = sessions.length * (batch?.currentStudents || 0);

    return {
      totalSessions: sessions.length,
      completed: sessions.filter((s) => s.status === "completed").length,
      cancelled: sessions.filter((s) => s.status === "cancelled").length,
      totalAttendance,
      averageAttendance: sessions.length > 0 ? totalAttendance / sessions.length : 0,
      attendanceRate:
        totalPossibleAttendance > 0
          ? (totalAttendance / totalPossibleAttendance) * 100
          : 0,
    };
  }

  async getBatchAssignmentStats(batchId, dateFilter) {
    const assignments = await Assignment.find({
      batch: batchId,
      deadline: dateFilter,
      isPublished: true,
    });

    const submissionPromises = assignments.map(async (assignment) => {
      const submissionCount = await Submission.countDocuments({
        assignment: assignment._id,
        status: { $in: ["submitted", "graded"] },
      });

      return {
        assignmentId: assignment._id,
        title: assignment.title,
        totalStudents: await Enrollment.countDocuments({
          batch: batchId,
          enrollmentStatus: "active",
        }),
        submissions: submissionCount,
      };
    });

    const submissionStats = await Promise.all(submissionPromises);

    const totalSubmissions = submissionStats.reduce(
      (sum, stat) => sum + stat.submissions,
      0,
    );
    const totalPossible = submissionStats.reduce(
      (sum, stat) => sum + stat.totalStudents,
      0,
    );

    return {
      totalAssignments: assignments.length,
      totalSubmissions,
      submissionRate: totalPossible > 0 ? (totalSubmissions / totalPossible) * 100 : 0,
      averageSubmissionsPerAssignment:
        assignments.length > 0 ? totalSubmissions / assignments.length : 0,
      assignments: submissionStats,
    };
  }

  async getBatchDoubtStats(batchId, dateFilter) {
    const doubts = await Doubt.find({
      batch: batchId,
      createdAt: dateFilter,
    });

    const resolved = await Doubt.countDocuments({
      batch: batchId,
      createdAt: dateFilter,
      status: "resolved",
    });

    const withInstructorReply = await Doubt.countDocuments({
      batch: batchId,
      createdAt: dateFilter,
      instructorReplyCount: { $gt: 0 },
    });

    return {
      total: doubts.length,
      resolved,
      withInstructorReply,
      resolutionRate: doubts.length > 0 ? (resolved / doubts.length) * 100 : 0,
      instructorResponseRate:
        doubts.length > 0 ? (withInstructorReply / doubts.length) * 100 : 0,
      averageReplies:
        doubts.length > 0
          ? doubts.reduce((sum, doubt) => sum + (doubt.replyCount || 0), 0) /
            doubts.length
          : 0,
    };
  }

  async getBatchProgressStats(batchId) {
    const progresses = await Progress.find({ batch: batchId });

    if (progresses.length === 0) {
      return {
        averageProgress: 0,
        atRiskCount: 0,
        completionRate: 0,
        topPerformer: null,
        needsAttention: [],
      };
    }

    const totalProgress = progresses.reduce(
      (sum, progress) => sum + (progress.overallProgress || 0),
      0,
    );
    const atRiskCount = progresses.filter((p) => p.isAtRisk).length;
    const completedCount = progresses.filter((p) => p.overallProgress >= 90).length;

    // Find top performer
    const topPerformer = progresses.reduce(
      (top, current) =>
        current.overallProgress > (top?.overallProgress || 0) ? current : top,
      null,
    );

    // Find students needing attention (lowest progress)
    const needsAttention = progresses
      .filter((p) => p.overallProgress < 60)
      .sort((a, b) => a.overallProgress - b.overallProgress)
      .slice(0, 5)
      .map((p) => ({
        studentId: p.student,
        progress: p.overallProgress,
        lastActive: p.lastActive,
      }));

    return {
      averageProgress: totalProgress / progresses.length,
      atRiskCount,
      atRiskPercentage: (atRiskCount / progresses.length) * 100,
      completionRate: (completedCount / progresses.length) * 100,
      topPerformer: topPerformer
        ? {
            studentId: topPerformer.student,
            progress: topPerformer.overallProgress,
          }
        : null,
      needsAttention,
    };
  }

  async getCourseEnrollmentStats(courseId, dateFilter) {
    const enrollments = await Enrollment.find({
      course: courseId,
      enrollmentDate: dateFilter,
    });

    const batches = await Batch.find({ course: courseId });

    return {
      total: enrollments.length,
      byBatch: batches.map((batch) => ({
        batchId: batch._id,
        batchName: batch.name,
        enrollments: enrollments.filter(
          (e) => e.batch.toString() === batch._id.toString(),
        ).length,
      })),
      trend: await this.getEnrollmentTrend(courseId, dateFilter),
    };
  }

  async getCourseRevenueStats(courseId, dateFilter) {
    const courseObjectId = new mongoose.Types.ObjectId(courseId);
    const payments = await Payment.aggregate([
      {
        $match: {
          course: courseObjectId,
          status: "completed",
          paymentDate: dateFilter,
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$paymentDate" },
            year: { $year: "$paymentDate" },
          },
          totalAmount: { $sum: "$amount" },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    return {
      total: payments.reduce((sum, p) => sum + p.totalAmount, 0),
      monthly: payments,
      average:
        payments.length > 0
          ? payments.reduce((sum, p) => sum + p.totalAmount, 0) / payments.length
          : 0,
    };
  }

  async getCourseBatchStats(courseId) {
    const batches = await Batch.find({ course: courseId });

    const stats = batches.map((batch) => ({
      batchId: batch._id,
      name: batch.name,
      startDate: batch.startDate,
      endDate: batch.endDate,
      currentStudents: batch.currentStudents,
      maxStudents: batch.maxStudents,
      occupancyRate: (batch.currentStudents / batch.maxStudents) * 100,
      isActive: batch.isActive,
    }));

    // Sort by occupancy rate (highest first)
    stats.sort((a, b) => b.occupancyRate - a.occupancyRate);

    return stats;
  }

  async getCourseStudentSatisfaction(courseId, dateFilter) {
    //! PROXY: This would typically come from ratings/reviews
    // For now, use doubt resolution rate as proxy
    const doubts = await Doubt.find({
      course: courseId,
      createdAt: dateFilter,
    });

    if (doubts.length === 0) {
      return {
        rating: 0,
        resolutionRate: 0,
        responseTime: 0,
        feedbackCount: 0,
      };
    }

    const resolved = await Doubt.countDocuments({
      course: courseId,
      createdAt: dateFilter,
      status: "resolved",
    });

    // Calculate average response time
    const doubtsWithReply = await Doubt.find({
      course: courseId,
      createdAt: dateFilter,
      timeToFirstReply: { $exists: true },
    });

    const totalResponseTime = doubtsWithReply.reduce(
      (sum, doubt) => sum + (doubt.timeToFirstReply || 0),
      0,
    );

    return {
      rating: 4.5, // Placeholder
      resolutionRate: (resolved / doubts.length) * 100,
      responseTime:
        doubtsWithReply.length > 0 ? totalResponseTime / doubtsWithReply.length : 0,
      feedbackCount: 0, // Placeholder
    };
  }

  async getSessionAttendanceMetrics(dateFilter) {
    const sessions = await LiveSession.find({
      startTime: dateFilter,
      status: { $in: ["completed", "ongoing"] },
    });

    if (sessions.length === 0) {
      return {
        totalSessions: 0,
        totalAttendance: 0,
        averageAttendance: 0,
        peakAttendance: 0,
        trend: [],
      };
    }

    const attendanceByDay = {};
    let peakAttendance = 0;
    let totalAttendance = 0;

    sessions.forEach((session) => {
      const day = session.startTime.toISOString().split("T")[0];
      const attendance = session.attendees?.length || 0;

      attendanceByDay[day] = (attendanceByDay[day] || 0) + attendance;
      totalAttendance += attendance;

      if (attendance > peakAttendance) {
        peakAttendance = attendance;
      }
    });

    // Convert to trend array
    const trend = Object.entries(attendanceByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      totalSessions: sessions.length,
      totalAttendance,
      averageAttendance: totalAttendance / sessions.length,
      peakAttendance,
      trend,
    };
  }

  async getMaterialCompletionMetrics(dateFilter) {
    const materials = await LearningMaterial.find({
      publishDate: dateFilter,
      isPublished: true,
    });

    // This would need actual completion data
    // For now, return placeholder metrics
    return {
      totalMaterials: materials.length,
      averageCompletionRate: 65, // Placeholder
      mostAccessed: [], // Would need tracking
      trend: [],
    };
  }

  async getAssignmentSubmissionMetrics(dateFilter) {
    const assignments = await Assignment.find({
      deadline: dateFilter,
      isPublished: true,
    });

    const submissions = await Submission.find({
      submittedAt: dateFilter,
      status: { $in: ["submitted", "graded"] },
    });

    const submissionByDay = {};
    submissions.forEach((sub) => {
      const day = sub.submittedAt.toISOString().split("T")[0];
      submissionByDay[day] = (submissionByDay[day] || 0) + 1;
    });

    const trend = Object.entries(submissionByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      totalAssignments: assignments.length,
      totalSubmissions: submissions.length,
      submissionRate:
        assignments.length > 0
          ? (submissions.length / (assignments.length * 20)) * 100
          : 0,
      averageScore: 75, // Placeholder
      trend,
    };
  }

  async getDoubtParticipationMetrics(dateFilter) {
    const doubts = await Doubt.find({ createdAt: dateFilter });
    const replies = doubts.reduce((sum, doubt) => sum + (doubt.replyCount || 0), 0);

    const doubtsByDay = {};
    doubts.forEach((doubt) => {
      const day = doubt.createdAt.toISOString().split("T")[0];
      doubtsByDay[day] = (doubtsByDay[day] || 0) + 1;
    });

    const trend = Object.entries(doubtsByDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => new Date(a.date) - new Date(b.date));

    return {
      totalDoubts: doubts.length,
      totalReplies: replies,
      averageRepliesPerDoubt: doubts.length > 0 ? replies / doubts.length : 0,
      resolutionRate: 70, // Placeholder
      trend,
    };
  }

  async getActiveUserMetrics(dateFilter) {
    const User = require("../models/User");
    const totalUsers = await User.countDocuments({ isActive: true });

    // Active in last 7 days (using progress lastActive)
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const activeUsers = await Progress.countDocuments({
      lastActive: { $gte: sevenDaysAgo },
    });

    // New users
    const newUsers = await User.countDocuments({
      createdAt: dateFilter,
      role: "student",
    });

    return {
      totalUsers,
      activeUsers,
      newUsers,
      activePercentage: totalUsers > 0 ? (activeUsers / totalUsers) * 100 : 0,
      retentionRate: 85, // Placeholder
    };
  }

  calculateOverallEngagement(
    sessionAttendance,
    materialCompletion,
    assignmentSubmission,
    doubtParticipation,
  ) {
    // Weighted average of all engagement metrics
    const weights = {
      session: 0.3,
      material: 0.25,
      assignment: 0.3,
      doubt: 0.15,
    };

    const sessionEngagement =
      sessionAttendance.averageAttendance > 0
        ? Math.min(100, (sessionAttendance.averageAttendance / 20) * 100)
        : 0; // Assuming 20 students per session

    const materialEngagement = materialCompletion.averageCompletionRate || 0;
    const assignmentEngagement = assignmentSubmission.submissionRate || 0;
    const doubtEngagement =
      doubtParticipation.totalDoubts > 0
        ? Math.min(100, (doubtParticipation.totalDoubts / 10) * 100)
        : 0; // Normalize

    return (
      sessionEngagement * weights.session +
      materialEngagement * weights.material +
      assignmentEngagement * weights.assignment +
      doubtEngagement * weights.doubt
    );
  }

  async getEnrollmentTrend(courseId, dateFilter) {
    const courseObjectId = new mongoose.Types.ObjectId(courseId);
    const enrollments = await Enrollment.aggregate([
      {
        $match: {
          course: courseObjectId,
          enrollmentDate: dateFilter,
        },
      },
      {
        $group: {
          _id: {
            month: { $month: "$enrollmentDate" },
            year: { $year: "$enrollmentDate" },
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.year": 1, "_id.month": 1 } },
    ]);

    return enrollments.map((e) => ({
      month: e._id.month,
      year: e._id.year,
      count: e.count,
    }));
  }
}

module.exports = new AnalyticsCalculator();
