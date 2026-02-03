const Enrollment = require('../models/Enrollment');
const Batch = require('../models/Batch');

/**
 * Check if user can access batch materials
 */
exports.canAccessBatchMaterials = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    
    // Admin and super admin can access any batch
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      return next();
    }
    
    // Instructor can access if assigned to batch
    if (req.user.role === 'instructor') {
      const batch = await Batch.findById(batchId);
      if (batch && batch.instructor.toString() === req.user.id) {
        return next();
      }
    }
    
    // Student can access if enrolled and active
    if (req.user.role === 'student') {
      const enrollment = await Enrollment.findOne({
        student: req.user.id,
        batch: batchId,
        enrollmentStatus: 'active',
        accessRevoked: false
      });
      
      if (enrollment) {
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access materials for this batch'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Check if user can manage batch content (instructor/admin)
 */
exports.canManageBatchContent = async (req, res, next) => {
  try {
    const { batchId } = req.params;
    
    // Admin and super admin can manage any batch
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      return next();
    }
    
    // Instructor can manage only if assigned
    if (req.user.role === 'instructor') {
      const batch = await Batch.findById(batchId);
      if (batch && batch.instructor.toString() === req.user.id) {
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Not authorized to manage content for this batch'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Check if user can access assignment
 */
exports.canAccessAssignment = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    
    const Assignment = require('../models/Assignment');
    const assignment = await Assignment.findById(assignmentId);
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Admin and super admin can access any assignment
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      req.assignment = assignment;
      return next();
    }
    
    // Instructor can access if assigned to batch
    if (req.user.role === 'instructor') {
      const batch = await Batch.findById(assignment.batch);
      if (batch && batch.instructor.toString() === req.user.id) {
        req.assignment = assignment;
        return next();
      }
    }
    
    // Student can access if enrolled, active, and assignment is published
    if (req.user.role === 'student') {
      const enrollment = await Enrollment.findOne({
        student: req.user.id,
        batch: assignment.batch,
        enrollmentStatus: 'active',
        accessRevoked: false
      });
      
      if (enrollment && assignment.isPublished) {
        req.assignment = assignment;
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Not authorized to access this assignment'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Check if student can submit assignment
 */
exports.canSubmitAssignment = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    
    if (req.user.role !== 'student') {
      return res.status(403).json({
        success: false,
        message: 'Only students can submit assignments'
      });
    }
    
    const Assignment = require('../models/Assignment');
    const assignment = await Assignment.findById(assignmentId);
    
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    // Check enrollment
    const enrollment = await Enrollment.findOne({
      student: req.user.id,
      batch: assignment.batch,
      enrollmentStatus: 'active',
      accessRevoked: false
    });
    
    if (!enrollment) {
      return res.status(403).json({
        success: false,
        message: 'Not enrolled in this batch'
      });
    }
    
    // Check if assignment is open for submission
    const now = new Date();
    if (!assignment.isPublished || !assignment.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not open for submission'
      });
    }
    
    if (now < assignment.startDate) {
      return res.status(400).json({
        success: false,
        message: 'Assignment submission has not started yet'
      });
    }
    
    if (now > assignment.deadline && (!assignment.allowLateSubmission || now > assignment.lateSubmissionDeadline)) {
      return res.status(400).json({
        success: false,
        message: 'Assignment submission deadline has passed'
      });
    }
    
    req.assignment = assignment;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Check if user can grade assignments
 */
exports.canGradeAssignment = async (req, res, next) => {
  try {
    const { assignmentId } = req.params;
    
    // Admin and super admin can grade any assignment
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      return next();
    }
    
    // Instructor can grade if assigned to batch
    if (req.user.role === 'instructor') {
      const Assignment = require('../models/Assignment');
      const assignment = await Assignment.findById(assignmentId);
      
      if (!assignment) {
        return res.status(404).json({
          success: false,
          message: 'Assignment not found'
        });
      }
      
      const batch = await Batch.findById(assignment.batch);
      if (batch && batch.instructor.toString() === req.user.id) {
        return next();
      }
    }
    
    return res.status(403).json({
      success: false,
      message: 'Not authorized to grade this assignment'
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};