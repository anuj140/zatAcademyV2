const Grade = require('../models/Grade');
const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Batch = require('../models/Batch');
const { sendEmail } = require('../utils/emailService');

// @desc    Grade a submission
// @route   PUT /api/v1/submissions/:id/grade
// @access  Private/Instructor
exports.gradeSubmission = async (req, res) => {
  try {
    const { id } = req.params;
    const { marksObtained, feedback, rubricScores } = req.body;
    
    const submission = await Submission.findById(id)
      .populate('assignment', 'maxMarks passingMarks rubric weightage')
      .populate('student', 'name email');
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    // Check authorization
    const assignment = await Assignment.findById(submission.assignment);
    const batch = await Batch.findById(assignment.batch);
    
    if (batch.instructor.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to grade this submission'
      });
    }
    
    // Validate marks
    if (marksObtained > assignment.maxMarks) {
      return res.status(400).json({
        success: false,
        message: `Marks cannot exceed maximum marks (${assignment.maxMarks})`
      });
    }
    
    // Update submission
    submission.marksObtained = marksObtained;
    submission.feedback = feedback;
    submission.rubricScores = rubricScores || [];
    submission.isGraded = true;
    submission.gradedAt = new Date();
    submission.gradedBy = req.user.id;
    submission.status = 'graded';
    
    // Calculate percentage and grade
    submission.calculateGrade(assignment);
    
    await submission.save();
    
    // Update grade record
    await updateGradeRecord(submission, assignment);
    
    // Send grade notification to student
    await sendGradeNotification(submission);
    
    res.status(200).json({
      success: true,
      message: 'Submission graded successfully',
      data: submission
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Bulk grade submissions
// @route   POST /api/v1/assignments/:assignmentId/bulk-grade
// @access  Private/Instructor
exports.bulkGradeSubmissions = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    const { grades } = req.body; // Array of { submissionId, marksObtained, feedback }
    
    if (!grades || !Array.isArray(grades)) {
      return res.status(400).json({
        success: false,
        message: 'Grades array is required'
      });
    }
    
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check authorization
    const batch = await Batch.findById(assignment.batch);
    if (batch.instructor.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to grade submissions for this assignment'
      });
    }
    
    const results = {
      successful: 0,
      failed: 0,
      errors: []
    };
    
    // Grade each submission
    for (const gradeData of grades) {
      try {
        const submission = await Submission.findById(gradeData.submissionId)
          .populate('student', 'name email');
        
        if (!submission) {
          results.failed++;
          results.errors.push(`Submission ${gradeData.submissionId} not found`);
          continue;
        }
        
        // Validate marks
        if (gradeData.marksObtained > assignment.maxMarks) {
          results.failed++;
          results.errors.push(`Marks exceed maximum for submission ${gradeData.submissionId}`);
          continue;
        }
        
        // Update submission
        submission.marksObtained = gradeData.marksObtained;
        submission.feedback = gradeData.feedback;
        submission.isGraded = true;
        submission.gradedAt = new Date();
        submission.gradedBy = req.user.id;
        submission.status = 'graded';
        
        // Calculate percentage and grade
        submission.calculateGrade(assignment);
        
        await submission.save();
        
        // Update grade record
        await updateGradeRecord(submission, assignment);
        
        // Send grade notification
        await sendGradeNotification(submission);
        
        results.successful++;
      } catch (error) {
        results.failed++;
        results.errors.push(`Error grading submission ${gradeData.submissionId}: ${error.message}`);
      }
    }
    
    res.status(200).json({
      success: true,
      message: `Bulk grading completed: ${results.successful} successful, ${results.failed} failed`,
      data: results
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get student grades for a batch
// @route   GET /api/v1/batches/:batchId/grades
// @access  Private (student own grades, instructor all)
exports.getBatchGrades = async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Check if user has access to this batch
    const batch = await Batch.findById(batchId);
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }
    
    let grades;
    
    if (req.user.role === 'student') {
      // Student can only see their own grade
      grades = await Grade.findOne({
        student: req.user.id,
        batch: batchId
      }).populate('assignmentGrades.assignment', 'title week maxMarks weightage');
      
      if (!grades) {
        // Create empty grade record if doesn't exist
        grades = await Grade.create({
          student: req.user.id,
          batch: batchId,
          course: batch.course
        });
      }
    } else if (req.user.role === 'instructor' || req.user.role === 'admin' || req.user.role === 'superAdmin') {
      // Instructor/admin can see all grades
      grades = await Grade.find({ batch: batchId })
        .populate('student', 'name email')
        .populate('assignmentGrades.assignment', 'title week maxMarks weightage')
        .sort({ overallPercentage: -1 });
      
      // Calculate batch statistics
      const batchStats = await calculateBatchGradeStats(batchId);
      
      return res.status(200).json({
        success: true,
        count: grades.length,
        batchStats,
        data: grades
      });
    }
    
    res.status(200).json({
      success: true,
      data: grades
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get student's overall grade
// @route   GET /api/v1/student/grades
// @access  Private/Student
exports.getStudentGrades = async (req, res) => {
  try {
    // Get all batches the student is enrolled in
    const Enrollment = require('../models/Enrollment');
    const enrollments = await Enrollment.find({
      student: req.user.id,
      enrollmentStatus: 'active'
    }).populate('batch', 'name');
    
    const batchIds = enrollments.map(e => e.batch._id);
    
    // Get grades for all batches
    const grades = await Grade.find({
      student: req.user.id,
      batch: { $in: batchIds }
    })
      .populate('batch', 'name')
      .populate('course', 'title');
    
    // Calculate overall statistics
    const overallStats = {
      totalBatches: batchIds.length,
      completedBatches: grades.filter(g => g.isFinalized).length,
      averagePercentage: 0,
      cumulativeGrade: 'N/A'
    };
    
    if (grades.length > 0) {
      const totalPercentage = grades.reduce((sum, g) => sum + (g.overallPercentage || 0), 0);
      overallStats.averagePercentage = totalPercentage / grades.length;
      
      // Determine cumulative grade
      if (overallStats.averagePercentage >= 90) overallStats.cumulativeGrade = 'A';
      else if (overallStats.averagePercentage >= 80) overallStats.cumulativeGrade = 'B';
      else if (overallStats.averagePercentage >= 70) overallStats.cumulativeGrade = 'C';
      else if (overallStats.averagePercentage >= 60) overallStats.cumulativeGrade = 'D';
      else overallStats.cumulativeGrade = 'F';
    }
    
    res.status(200).json({
      success: true,
      count: grades.length,
      overallStats,
      data: grades
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Finalize grades for a batch
// @route   PUT /api/v1/batches/:batchId/grades/finalize
// @access  Private/Instructor
exports.finalizeBatchGrades = async (req, res) => {
  try {
    const { batchId } = req.params;
    
    // Check authorization
    const batch = await Batch.findById(batchId);
    if (batch.instructor.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to finalize grades for this batch'
      });
    }
    
    // Get all grades for the batch
    const grades = await Grade.find({ batch: batchId });
    
    // Finalize each grade
    for (const grade of grades) {
      grade.isFinalized = true;
      grade.finalizedAt = new Date();
      grade.finalizedBy = req.user.id;
      
      // Recalculate overall grade
      grade.calculateOverallGrade();
      
      await grade.save();
      
      // Send final grade notification
      await sendFinalGradeNotification(grade);
    }
    
    res.status(200).json({
      success: true,
      message: `Grades finalized for ${grades.length} students`,
      data: {
        finalizedCount: grades.length,
        batch: batchId
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to update grade record
async function updateGradeRecord(submission, assignment) {
  try {
    let grade = await Grade.findOne({
      student: submission.student,
      batch: submission.batch
    });
    
    if (!grade) {
      grade = await Grade.create({
        student: submission.student,
        batch: submission.batch,
        course: submission.course,
        assignmentsTotal: 0,
        assignmentsCompleted: 0
      });
    }
    
    // Update assignment grades
    const assignmentGradeIndex = grade.assignmentGrades.findIndex(
      ag => ag.assignment.toString() === submission.assignment.toString()
    );
    
    const assignmentGrade = {
      assignment: submission.assignment,
      submission: submission._id,
      score: submission.marksObtained,
      maxScore: assignment.maxMarks,
      percentage: submission.percentage,
      grade: submission.grade,
      weightage: assignment.weightage || 0,
      weightedScore: assignment.weightage ? (submission.percentage * assignment.weightage) / 100 : 0,
      submittedAt: submission.submittedAt,
      gradedAt: submission.gradedAt
    };
    
    if (assignmentGradeIndex === -1) {
      // Add new assignment grade
      grade.assignmentGrades.push(assignmentGrade);
      grade.assignmentsCompleted += 1;
    } else {
      // Update existing assignment grade
      grade.assignmentGrades[assignmentGradeIndex] = assignmentGrade;
    }
    
    // Update totals
    grade.totalScore = grade.assignmentGrades.reduce((sum, ag) => sum + (ag.score || 0), 0);
    grade.totalMaxScore = grade.assignmentGrades.reduce((sum, ag) => sum + (ag.maxScore || 0), 0);
    grade.assignmentsTotal = await Assignment.countDocuments({
      batch: submission.batch,
      isPublished: true
    });
    
    // Calculate overall grade
    grade.calculateOverallGrade();
    
    await grade.save();
  } catch (error) {
    console.error('Error updating grade record:', error);
  }
}

// Helper function to send grade notification
async function sendGradeNotification(submission) {
  try {
    const assignment = await Assignment.findById(submission.assignment);
    const student = await User.findById(submission.student);
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Assignment Graded</h2>
        <p>Hello ${student.name},</p>
        <p>Your submission for <strong>${assignment.title}</strong> has been graded.</p>
        <p><strong>Grade Details:</strong></p>
        <ul>
          <li><strong>Marks Obtained:</strong> ${submission.marksObtained} / ${assignment.maxMarks}</li>
          <li><strong>Percentage:</strong> ${submission.percentage?.toFixed(2)}%</li>
          <li><strong>Grade:</strong> ${submission.grade}</li>
          ${submission.hasPassed ? '<li><strong>Status:</strong> Passed ✅</li>' : '<li><strong>Status:</strong> Failed ❌</li>'}
        </ul>
        ${submission.feedback ? `<p><strong>Feedback:</strong> ${submission.feedback}</p>` : ''}
        <a href="${process.env.FRONTEND_URL}/submissions/${submission._id}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
          View Detailed Feedback
        </a>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
      </div>
    `;
    
    await sendEmail({
      email: student.email,
      subject: `Assignment Graded: ${assignment.title}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('Error sending grade notification:', error);
  }
}

// Helper function to send final grade notification
async function sendFinalGradeNotification(grade) {
  try {
    const student = await User.findById(grade.student);
    const batch = await Batch.findById(grade.batch).populate('course', 'title');
    
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #4F46E5;">Final Grades Published</h2>
        <p>Hello ${student.name},</p>
        <p>Your final grades for <strong>${batch.course.title} - ${batch.name}</strong> have been published.</p>
        <p><strong>Final Grade Summary:</strong></p>
        <ul>
          <li><strong>Overall Percentage:</strong> ${grade.overallPercentage?.toFixed(2)}%</li>
          <li><strong>Final Grade:</strong> ${grade.finalGrade}</li>
          <li><strong>Assignments Completed:</strong> ${grade.assignmentsCompleted} / ${grade.assignmentsTotal}</li>
        </ul>
        <a href="${process.env.FRONTEND_URL}/batches/${batch._id}/grades" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
          View Detailed Grades
        </a>
        <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
        <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
      </div>
    `;
    
    await sendEmail({
      email: student.email,
      subject: `Final Grades Published: ${batch.course.title}`,
      html: emailHtml
    });
  } catch (error) {
    console.error('Error sending final grade notification:', error);
  }
}

// Helper function to calculate batch grade statistics
async function calculateBatchGradeStats(batchId) {
  const grades = await Grade.find({ batch: batchId, isFinalized: true });
  
  if (grades.length === 0) {
    return {
      averagePercentage: 0,
      highestPercentage: 0,
      lowestPercentage: 0,
      gradeDistribution: { A: 0, B: 0, C: 0, D: 0, F: 0 },
      totalStudents: 0,
      finalizedStudents: 0
    };
  }
  
  const percentages = grades.map(g => g.overallPercentage || 0);
  const averagePercentage = percentages.reduce((a, b) => a + b, 0) / percentages.length;
  const highestPercentage = Math.max(...percentages);
  const lowestPercentage = Math.min(...percentages);
  
  const gradeDistribution = { A: 0, B: 0, C: 0, D: 0, F: 0 };
  grades.forEach(grade => {
    const finalGrade = grade.finalGrade || 'F';
    if (gradeDistribution[finalGrade] !== undefined) {
      gradeDistribution[finalGrade]++;
    }
  });
  
  // Get total students in batch
  const Enrollment = require('../models/Enrollment');
  const totalStudents = await Enrollment.countDocuments({
    batch: batchId,
    enrollmentStatus: 'active'
  });
  
  return {
    averagePercentage: Math.round(averagePercentage * 100) / 100,
    highestPercentage: Math.round(highestPercentage * 100) / 100,
    lowestPercentage: Math.round(lowestPercentage * 100) / 100,
    gradeDistribution,
    totalStudents,
    finalizedStudents: grades.length
  };
}