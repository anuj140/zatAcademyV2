const Progress = require("../models/Progress");
const Enrollment = require("../models/Enrollment");
const LearningMaterial = require("../models/LearningMaterial");
const LiveSession = require("../models/LiveSession");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const Grade = require("../models/Grade");

class ProgressService {
  /**
   * Calculate and update progress for a student in a batch
   */
  async calculateStudentProgress(studentId, batchId) {
    try {
      // Get enrollment
      //1. Find the enrollment with studentId, batchId and enrollment status 'active'
      const enrollment = await Enrollment.findOne({
        student: studentId,
        batch: batchId,
        enrollmentStatus: "active",
      });

      // if no enrollment is found 'Student not enrolled in this batch'
      if (!enrollment) {
        throw new Error("Student not enrolled in this batch");
      }

      // Calculate progress using the model's static method
      //
      const progress = await Progress.calculateForStudent(studentId, batchId);

      // Update streak
      progress.updateStreak();
      await progress.save();

      return progress;
    } catch (error) {
      console.error("Error calculating student progress:", error);
      throw error;
    }
  }

  /**
   * Batch calculate progress for all students in a batch
   */
  async calculateBatchProgress(batchId) {
    try {
      const enrollments = await Enrollment.find({
        batch: batchId,
        enrollmentStatus: "active",
      }).select("student");

      const results = [];

      for (const enrollment of enrollments) {
        try {
          const progress = await this.calculateStudentProgress(
            enrollment.student,
            batchId,
          );
          results.push({
            student: enrollment.student,
            success: true,
            progress,
          });
        } catch (error) {
          results.push({
            student: enrollment.student,
            success: false,
            error: error.message,
          });
        }
      }

      return results;
    } catch (error) {
      console.error("Error calculating batch progress:", error);
      throw error;
    }
  }

  /**
   * Get student progress dashboard
   */
  async getStudentDashboard(studentId) {
    try {
      // Get all active enrollments
      //1. Find the enrollment with provided studentId and with enrollmentStatus set to 'active'
      // -- populate - batch name, startDate endDate
      //               course name, title thumbnail
      const enrollments = await Enrollment.find({
        student: studentId,
        enrollmentStatus: "active",
      })
        .populate("batch", "name startDate endDate")
        .populate("course", "title thumbnail");

      const dashboard = {
        overallStats: {
          totalBatches: enrollments.length, //! Total enrollment is !== batches (remove)
          batchesInProgress: 0,
          batchesCompleted: 0,
          averageProgress: 0,
          totalTimeSpent: 0,
        },
        batchProgress: [],
        recentActivity: [],
        upcomingDeadlines: [],
        atRiskBatches: [],
      };

      let totalProgress = 0;

      for (const enrollment of enrollments) {
        // Get progress for this batch
        let progress = await Progress.findOne({
          student: studentId,
          batch: enrollment.batch._id,
        });

        if (!progress) {
          progress = await this.calculateStudentProgress(studentId, enrollment.batch._id);
        }

        const Module = require("../models/Module");
        const modules = await Module.find({
          batch: enrollment.batch._id,
          isPublished: true,
        }).sort({ order: 1 });

        const moduleProgressDetails = modules.map((module) => {
          const modProgress = progress.moduleProgress?.find(
            (mp) => mp.module.toString() === module._id.toString(),
          );

          return {
            moduleId: module._id,
            moduleTitle: module.title,
            completionPercentage: modProgress?.completionPercentage || 0,
            completedItems: modProgress?.completedItems || 0,
            totalItems: modProgress?.totalItems || 0,
          };
        });

        dashboard.batchProgress.push({
          batchId: enrollment.batch._id,
          batchName: enrollment.batch.name,
          courseTitle: enrollment.course.title,
          thumbnail: enrollment.course.thumbnail?.url,
          startDate: enrollment.batch.startDate,
          endDate: enrollment.batch.endDate,
          progress: progress.overallProgress,
          materialProgress: progress.materialCompletionPercentage,
          attendance: progress.attendancePercentage,
          assignmentProgress: progress.assignmentCompletionPercentage,
          moduleProgress: moduleProgressDetails, // NEW
          isAtRisk: progress.isAtRisk,
          lastActive: progress.lastActive,
        });

        // Update overall stats
        totalProgress += progress.overallProgress;
        dashboard.overallStats.totalTimeSpent += progress.totalTimeSpent;

        if (progress.overallProgress >= 90) {
          dashboard.overallStats.batchesCompleted++;
        } else {
          dashboard.overallStats.batchesInProgress++;
        }

        if (progress.isAtRisk) {
          dashboard.atRiskBatches.push({
            batchId: enrollment.batch._id,
            batchName: enrollment.batch.name,
            riskFactors: progress.riskFactors,
            progress: progress.overallProgress,
          });
        }
      }

      // Calculate averages
      if (enrollments.length > 0) {
        dashboard.overallStats.averageProgress = totalProgress / enrollments.length;
      }

      // Get recent submissions
      const recentSubmissions = await Submission.find({
        student: studentId,
      })
        .sort({ submittedAt: -1 })
        .limit(5)
        .populate("assignment", "title")
        .populate("batch", "name");

      dashboard.recentActivity = recentSubmissions.map((sub) => ({
        type: "submission",
        title: sub.assignment?.title || "Assignment",
        batch: sub.batch?.name,
        date: sub.submittedAt,
        status: sub.status,
        score: sub.marksObtained,
      }));

      // Get upcoming assignments
      const now = new Date();
      const oneWeekLater = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

      const upcomingAssignments = await Assignment.find({
        batch: { $in: enrollments.map((e) => e.batch._id) },
        deadline: { $gt: now, $lt: oneWeekLater },
        isPublished: true,
        isActive: true,
      })
        .populate("batch", "name")
        .sort("deadline");

      dashboard.upcomingDeadlines = upcomingAssignments.map((assignment) => ({
        assignmentId: assignment._id,
        title: assignment.title,
        batch: assignment.batch.name,
        deadline: assignment.deadline,
        daysLeft: Math.ceil((assignment.deadline - now) / (1000 * 60 * 60 * 24)),
      }));

      return dashboard;
    } catch (error) {
      console.error("Error getting student dashboard:", error);
      throw error;
    }
  }

  /**
   * Get instructor progress dashboard for a batch
   */
  async getInstructorBatchDashboard(batchId, instructorId) {
    try {
      // Verify instructor has access to this batch
      const Batch = require("../models/Batch");
      const batch = await Batch.findById(batchId);

      if (!batch) {
        throw new Error("Batch not found");
      }

      if (batch.instructor.toString() !== instructorId) {
        throw new Error("Not authorized to view this batch dashboard");
      }

      // Get all active enrollments
      const enrollments = await Enrollment.find({
        batch: batchId,
        enrollmentStatus: "active",
      }).populate("student", "name email");

      const studentProgress = [];
      let totalProgress = 0;
      let atRiskCount = 0;

      // Get progress for each student
      for (const enrollment of enrollments) {
        let progress = await Progress.findOne({
          student: enrollment.student._id,
          batch: batchId,
        });

        if (!progress) {
          progress = await this.calculateStudentProgress(enrollment.student._id, batchId);
        }

        studentProgress.push({
          studentId: enrollment.student._id,
          studentName: enrollment.student.name,
          studentEmail: enrollment.student.email,
          progress: progress.overallProgress,
          materialProgress: progress.materialCompletionPercentage,
          attendance: progress.attendancePercentage,
          assignmentProgress: progress.assignmentCompletionPercentage,
          lastActive: progress.lastActive,
          isAtRisk: progress.isAtRisk,
          riskFactors: progress.riskFactors,
          engagementScore: progress.engagementScore,
        });

        totalProgress += progress.overallProgress;
        if (progress.isAtRisk) atRiskCount++;
      }

      // Calculate batch statistics
      const averageProgress =
        enrollments.length > 0 ? totalProgress / enrollments.length : 0;

      // Sort students by progress
      studentProgress.sort((a, b) => b.progress - a.progress);

      // Get batch completion rate
      const completionRate =
        enrollments.length > 0
          ? (studentProgress.filter((s) => s.progress >= 90).length /
              enrollments.length) *
            100
          : 0;

      // Get assignment submission rates
      const Assignment = require("../models/Assignment");
      const assignments = await Assignment.find({
        batch: batchId,
        isPublished: true,
      });

      const assignmentStats = await Promise.all(
        assignments.map(async (assignment) => {
          const submissionCount = await Submission.countDocuments({
            assignment: assignment._id,
            status: { $in: ["submitted", "graded"] },
          });

          return {
            assignmentId: assignment._id,
            title: assignment.title,
            deadline: assignment.deadline,
            totalStudents: enrollments.length,
            submissions: submissionCount,
            submissionRate:
              enrollments.length > 0 ? (submissionCount / enrollments.length) * 100 : 0,
          };
        }),
      );

      // Sort assignments by submission rate (lowest first for attention)
      assignmentStats.sort((a, b) => a.submissionRate - b.submissionRate);

      return {
        batchId,
        batchName: batch.name,
        totalStudents: enrollments.length,
        averageProgress,
        completionRate,
        atRiskCount,
        atRiskPercentage:
          enrollments.length > 0 ? (atRiskCount / enrollments.length) * 100 : 0,
        studentProgress,
        assignmentStats: assignmentStats.slice(0, 5), // Top 5 assignments needing attention
        topPerformers: studentProgress.slice(0, 5),
        needAttention: studentProgress.filter((s) => s.isAtRisk).slice(0, 10),
      };
    } catch (error) {
      console.error("Error getting instructor dashboard:", error);
      throw error;
    }
  }

  /**
   * Identify at-risk students in a batch
   */
  async identifyAtRiskStudents(batchId, threshold = 60) {
    try {
      const enrollments = await Enrollment.find({
        batch: batchId,
        enrollmentStatus: "active",
      }).populate("student", "name email");

      const atRiskStudents = [];

      for (const enrollment of enrollments) {
        const progress = await Progress.findOne({
          student: enrollment.student._id,
          batch: batchId,
        });

        if (progress && progress.overallProgress < threshold) {
          atRiskStudents.push({
            studentId: enrollment.student._id,
            studentName: enrollment.student.name,
            studentEmail: enrollment.student.email,
            progress: progress.overallProgress,
            lastActive: progress.lastActive,
            riskFactors: progress.riskFactors,
            daysInactive: progress.daysSinceLastActive,
          });
        }
      }

      // Sort by most at-risk first
      atRiskStudents.sort((a, b) => a.progress - b.progress);

      return atRiskStudents;
    } catch (error) {
      console.error("Error identifying at-risk students:", error);
      throw error;
    }
  }

  /**
   * Update material progress for a student
   */
  //## Fun: Update learning material progress by taking args- studentId, batchId, materialId and progressData
  async updateMaterialProgress(studentId, batchId, materialId, progressData) {
    try {
      //1. Find the student progress with studentId and batchId
      const progress = await Progress.findOne({
        student: studentId,
        batch: batchId,
      });

      //2. If progress not found throw error 'Progress record not found'
      if (!progress) {
        throw new Error("Progress record not found");
      }

      // Find material progress entry
      //3. Find the materialId matches with provided materialId
      const materialIndex = progress.materialProgress.findIndex(
        (mp) => mp.material.toString() === materialId,
      );
      //4. If not found
      if (materialIndex === -1) {
        // Add new material progress entry
        //5. Push provided materialId into that materialProgress array
        console.log(
          "progress.materialProgress[materialIndex]: ",
          progress.materialProgress[materialIndex],
        ); // clg
        progress.materialProgress.push({
          material: materialId,
          ...progressData,
        });
      } else {
        // Update existing entry
        //6. else, it it is exists
        //-
        console.log(
          "progress.materialProgress[materialIndex]: ",
          progress.materialProgress[materialIndex],
        ); // clg
        progress.materialProgress[materialIndex] = {
          ...progress.materialProgress[materialIndex].toObject(),
          ...progressData,
          lastAccessed: new Date(),
        };
      }

      // Recalculate completed materials count
      progress.completedMaterials = progress.materialProgress.filter(
        (mp) => mp.status === "completed",
      ).length;

      await progress.save();
      return progress;
    } catch (error) {
      console.error("Error updating material progress:", error);
      throw error;
    }
  }

  /**
   * Update session attendance
   */
  async updateSessionAttendance(studentId, batchId, sessionId, attendanceData) {
    try {
      const progress = await Progress.findOne({
        student: studentId,
        batch: batchId,
      });

      if (!progress) {
        throw new Error("Progress record not found");
      }

      // Find session attendance entry
      const sessionIndex = progress.sessionAttendance.findIndex(
        (sa) => sa.session.toString() === sessionId,
      );

      if (sessionIndex === -1) {
        // Add new session attendance entry
        progress.sessionAttendance.push({
          session: sessionId,
          ...attendanceData,
        });
      } else {
        // Update existing entry
        progress.sessionAttendance[sessionIndex] = {
          ...progress.sessionAttendance[sessionIndex].toObject(),
          ...attendanceData,
        };
      }

      // Recalculate attended sessions count
      progress.attendedSessions = progress.sessionAttendance.filter(
        (sa) => sa.status === "present",
      ).length;

      await progress.save();
      return progress;
    } catch (error) {
      console.error("Error updating session attendance:", error);
      throw error;
    }
  }
}

module.exports = new ProgressService();
