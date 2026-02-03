const LearningMaterial = require('../models/LearningMaterial');
const Assignment = require('../models/Assignment');
const Submission = require('../models/Submission');

/**
 * Calculate student progress for a batch
 */
exports.calculateBatchProgress = async (studentId, batchId) => {
  try {
    // Get all published materials for the batch
    const materials = await LearningMaterial.find({
      batch: batchId,
      isPublished: true
    }).select('_id completionRequired');
    
    // Get all published assignments for the batch
    const assignments = await Assignment.find({
      batch: batchId,
      isPublished: true,
      isActive: true
    }).select('_id');
    
    // Get student's completed materials (you need a StudentProgress model for this)
    // For now, we'll use a placeholder - you should create a StudentProgress model
    const completedMaterialsCount = 0; // Placeholder
    
    // Get student's submitted assignments
    const submittedAssignments = await Submission.find({
      student: studentId,
      batch: batchId,
      status: { $in: ['submitted', 'graded'] }
    }).distinct('assignment');
    
    // Calculate percentages
    const totalMaterials = materials.length;
    const totalAssignments = assignments.length;
    
    const materialProgress = totalMaterials > 0 
      ? (completedMaterialsCount / totalMaterials) * 100 
      : 0;
    
    const assignmentProgress = totalAssignments > 0
      ? (submittedAssignments.length / totalAssignments) * 100
      : 0;
    
    // Overall progress (weighted average)
    const overallProgress = totalMaterials + totalAssignments > 0
      ? ((materialProgress * totalMaterials) + (assignmentProgress * totalAssignments)) / 
        (totalMaterials + totalAssignments)
      : 0;
    
    return {
      materialProgress: Math.round(materialProgress),
      assignmentProgress: Math.round(assignmentProgress),
      overallProgress: Math.round(overallProgress),
      completedMaterials: completedMaterialsCount,
      totalMaterials,
      submittedAssignments: submittedAssignments.length,
      totalAssignments
    };
  } catch (error) {
    console.error('Error calculating progress:', error);
    return {
      materialProgress: 0,
      assignmentProgress: 0,
      overallProgress: 0,
      completedMaterials: 0,
      totalMaterials: 0,
      submittedAssignments: 0,
      totalAssignments: 0
    };
  }
};

/**
 * Calculate grade statistics for an assignment
 */
exports.calculateAssignmentStats = async (assignmentId) => {
  try {
    const submissions = await Submission.find({
      assignment: assignmentId,
      isGraded: true
    }).select('marksObtained percentage');
    
    if (submissions.length === 0) {
      return {
        averageScore: 0,
        highestScore: 0,
        lowestScore: 0,
        submissionCount: 0,
        gradedCount: 0,
        gradeDistribution: {}
      };
    }
    
    const scores = submissions.map(s => s.marksObtained || 0);
    const averageScore = scores.reduce((a, b) => a + b, 0) / scores.length;
    const highestScore = Math.max(...scores);
    const lowestScore = Math.min(...scores);
    
    // Grade distribution
    const gradeDistribution = {
      A: 0, B: 0, C: 0, D: 0, F: 0
    };
    
    submissions.forEach(submission => {
      const grade = submission.grade || 'F';
      if (gradeDistribution[grade] !== undefined) {
        gradeDistribution[grade]++;
      }
    });
    
    return {
      averageScore: Math.round(averageScore * 100) / 100,
      highestScore,
      lowestScore,
      submissionCount: submissions.length,
      gradedCount: submissions.length,
      gradeDistribution
    };
  } catch (error) {
    console.error('Error calculating assignment stats:', error);
    return {
      averageScore: 0,
      highestScore: 0,
      lowestScore: 0,
      submissionCount: 0,
      gradedCount: 0,
      gradeDistribution: {}
    };
  }
};

/**
 * Calculate batch grade statistics
 */
exports.calculateBatchStats = async (batchId) => {
  try {
    const submissions = await Submission.find({
      batch: batchId,
      isGraded: true
    }).populate('assignment', 'maxMarks weightage');
    
    const assignments = await Assignment.find({
      batch: batchId,
      isPublished: true
    });
    
    const students = await Submission.find({ batch: batchId }).distinct('student');
    
    const stats = {
      totalAssignments: assignments.length,
      totalSubmissions: submissions.length,
      totalGraded: submissions.filter(s => s.isGraded).length,
      totalStudents: students.length,
      averageBatchScore: 0,
      assignmentCompletionRate: 0
    };
    
    if (submissions.length > 0) {
      const totalScore = submissions.reduce((sum, s) => sum + (s.marksObtained || 0), 0);
      const totalMaxScore = submissions.reduce((sum, s) => sum + (s.assignment?.maxMarks || 100), 0);
      stats.averageBatchScore = totalMaxScore > 0 ? (totalScore / totalMaxScore) * 100 : 0;
    }
    
    if (assignments.length > 0 && students.length > 0) {
      const totalPossibleSubmissions = assignments.length * students.length;
      const actualSubmissions = submissions.filter(s => 
        s.status === 'submitted' || s.status === 'graded'
      ).length;
      stats.assignmentCompletionRate = totalPossibleSubmissions > 0 
        ? (actualSubmissions / totalPossibleSubmissions) * 100 
        : 0;
    }
    
    return stats;
  } catch (error) {
    console.error('Error calculating batch stats:', error);
    return {
      totalAssignments: 0,
      totalSubmissions: 0,
      totalGraded: 0,
      totalStudents: 0,
      averageBatchScore: 0,
      assignmentCompletionRate: 0
    };
  }
};