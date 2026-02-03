const Submission = require('../models/Submission');
const Assignment = require('../models/Assignment');
const Batch = require('../models/Batch');
const cloudinary = require('../config/cloudinary');

// @desc    Submit assignment
// @route   POST /api/v1/assignments/:assignmentId/submit
// @access  Private/Student
exports.submitAssignment = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    // Check if assignment exists and is open for submission
    const assignment = await Assignment.findById(assignmentId);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: 'Assignment not found'
      });
    }
    
    if (!assignment.isPublished || !assignment.isActive) {
      return res.status(400).json({
        success: false,
        message: 'Assignment is not open for submission'
      });
    }
    
    const now = new Date();
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
    
    // Check if student has already submitted
    const existingSubmission = await Submission.findOne({
      assignment: assignmentId,
      student: req.user.id
    });
    
    let submission;
    const isResubmission = !!existingSubmission;
    
    if (isResubmission) {
      // Check if resubmission is allowed
      if (existingSubmission.status === 'graded' && !assignment.allowResubmission) {
        return res.status(400).json({
          success: false,
          message: 'Resubmission is not allowed after grading'
        });
      }
      
      // Update existing submission
      existingSubmission.textContent = req.body.textContent || existingSubmission.textContent;
      existingSubmission.notes = req.body.notes || existingSubmission.notes;
      existingSubmission.githubRepo = req.body.githubRepo || existingSubmission.githubRepo;
      existingSubmission.deploymentUrl = req.body.deploymentUrl || existingSubmission.deploymentUrl;
      existingSubmission.submittedAt = now;
      existingSubmission.version += 1;
      existingSubmission.status = 'submitted';
      existingSubmission.isGraded = false;
      existingSubmission.gradedAt = null;
      existingSubmission.gradedBy = null;
      existingSubmission.score = null;
      existingSubmission.marksObtained = null;
      existingSubmission.percentage = null;
      existingSubmission.grade = null;
      existingSubmission.feedback = null;
      existingSubmission.rubricScores = [];
      existingSubmission.resubmissionCount += 1;
      existingSubmission.previousSubmission = existingSubmission._id;
      
      // Handle file uploads
      if (req.files && req.files.length > 0) {
        // Delete old files from Cloudinary
        if (existingSubmission.files && existingSubmission.files.length > 0) {
          for (const file of existingSubmission.files) {
            if (file.public_id) {
              await cloudinary.uploader.destroy(file.public_id);
            }
          }
        }
        
        existingSubmission.files = req.files.map(file => ({
          url: file.path,
          public_id: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: now
        }));
      }
      
      submission = await existingSubmission.save();
    } else {
      // Create new submission
      const submissionData = {
        assignment: assignmentId,
        batch: assignment.batch,
        course: assignment.course,
        student: req.user.id,
        textContent: req.body.textContent,
        notes: req.body.notes,
        githubRepo: req.body.githubRepo,
        deploymentUrl: req.body.deploymentUrl,
        submittedAt: now,
        status: 'submitted'
      };
      
      // Determine submission type
      if (req.body.textContent && (!req.files || req.files.length === 0)) {
        submissionData.submissionType = 'text';
      } else if (!req.body.textContent && req.files && req.files.length > 0) {
        submissionData.submissionType = 'file';
      } else if (req.body.textContent && req.files && req.files.length > 0) {
        submissionData.submissionType = 'both';
      } else if (req.body.githubRepo) {
        submissionData.submissionType = 'github';
      }
      
      // Handle file uploads
      if (req.files && req.files.length > 0) {
        submissionData.files = req.files.map(file => ({
          url: file.path,
          public_id: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: now
        }));
      }
      
      submission = await Submission.create(submissionData);
    }
    
    res.status(isResubmission ? 200 : 201).json({
      success: true,
      message: isResubmission ? 'Assignment resubmitted successfully' : 'Assignment submitted successfully',
      data: submission
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get student's submission for an assignment
// @route   GET /api/v1/assignments/:assignmentId/my-submission
// @access  Private/Student
exports.getMySubmission = async (req, res) => {
  try {
    const { assignmentId } = req.params;
    
    const submission = await Submission.findOne({
      assignment: assignmentId,
      student: req.user.id
    })
      .populate('assignment', 'title maxMarks deadline')
      .populate('gradedBy', 'name');
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'No submission found for this assignment'
      });
    }
    
    res.status(200).json({
      success: true,
      data: submission
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all submissions for a student
// @route   GET /api/v1/student/submissions
// @access  Private/Student
exports.getStudentSubmissions = async (req, res) => {
  try {
    const { batchId, status, graded, limit = 20, page = 1 } = req.query;
    
    // Build query
    const query = { student: req.user.id };
    
    if (batchId) {
      query.batch = batchId;
    }
    
    if (status) {
      query.status = status;
    }
    
    if (graded === 'true') {
      query.isGraded = true;
    } else if (graded === 'false') {
      query.isGraded = false;
    }
    
    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    
    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('assignment', 'title maxMarks week')
      .populate('batch', 'name')
      .populate('gradedBy', 'name');
    
    const total = await Submission.countDocuments(query);
    
    // Calculate statistics
    const gradedSubmissions = submissions.filter(s => s.isGraded);
    const averageScore = gradedSubmissions.length > 0
      ? gradedSubmissions.reduce((sum, s) => sum + (s.marksObtained || 0), 0) / gradedSubmissions.length
      : 0;
    
    res.status(200).json({
      success: true,
      count: submissions.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      statistics: {
        totalSubmissions: total,
        gradedSubmissions: gradedSubmissions.length,
        averageScore: Math.round(averageScore * 100) / 100
      },
      data: submissions
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single submission (for instructor or student owner)
// @route   GET /api/v1/submissions/:id
// @access  Private
exports.getSubmission = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id)
      .populate('assignment', 'title maxMarks passingMarks rubric')
      .populate('student', 'name email')
      .populate('batch', 'name')
      .populate('course', 'title')
      .populate('gradedBy', 'name email');
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    // Check authorization
    const isOwner = submission.student._id.toString() === req.user.id;
    const isInstructor = req.user.role === 'instructor' || req.user.role === 'admin' || req.user.role === 'superAdmin';
    
    if (!isOwner && !isInstructor) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to view this submission'
      });
    }
    
    // If instructor, also get other submissions for comparison
    let comparisonStats = null;
    if (isInstructor) {
      const Assignment = require('../models/Assignment');
      const assignment = await Assignment.findById(submission.assignment);
      
      if (assignment) {
        const allSubmissions = await Submission.find({
          assignment: submission.assignment,
          isGraded: true
        }).select('marksObtained percentage');
        
        if (allSubmissions.length > 0) {
          const scores = allSubmissions.map(s => s.marksObtained || 0);
          comparisonStats = {
            averageScore: scores.reduce((a, b) => a + b, 0) / scores.length,
            highestScore: Math.max(...scores),
            lowestScore: Math.min(...scores),
            percentile: 0
          };
          
          // Calculate percentile
          const lowerScores = scores.filter(s => s < (submission.marksObtained || 0)).length;
          comparisonStats.percentile = (lowerScores / scores.length) * 100;
        }
      }
    }
    
    res.status(200).json({
      success: true,
      data: {
        submission,
        comparisonStats
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update submission (draft save)
// @route   PUT /api/v1/submissions/:id
// @access  Private/Student
exports.updateSubmission = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    // Check authorization - only owner can update
    if (submission.student.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this submission'
      });
    }
    
    // Only allow updates for drafts
    if (submission.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft submissions can be updated'
      });
    }
    
    // Check assignment deadline
    const assignment = await Assignment.findById(submission.assignment);
    const now = new Date();
    if (now > assignment.deadline && (!assignment.allowLateSubmission || now > assignment.lateSubmissionDeadline)) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update submission after deadline'
      });
    }
    
    // Update submission
    submission.textContent = req.body.textContent || submission.textContent;
    submission.notes = req.body.notes || submission.notes;
    submission.githubRepo = req.body.githubRepo || submission.githubRepo;
    submission.deploymentUrl = req.body.deploymentUrl || submission.deploymentUrl;
    
    // Handle file uploads
    if (req.files && req.files.length > 0) {
      // Delete old files from Cloudinary
      if (submission.files && submission.files.length > 0) {
        for (const file of submission.files) {
          if (file.public_id) {
            await cloudinary.uploader.destroy(file.public_id);
          }
        }
      }
      
      submission.files = req.files.map(file => ({
        url: file.path,
        public_id: file.filename,
        originalName: file.originalname,
        size: file.size,
        mimeType: file.mimetype,
        uploadedAt: now
      }));
    }
    
    await submission.save();
    
    res.status(200).json({
      success: true,
      message: 'Submission draft updated successfully',
      data: submission
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete submission (only if draft)
// @route   DELETE /api/v1/submissions/:id
// @access  Private/Student
exports.deleteSubmission = async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    
    if (!submission) {
      return res.status(404).json({
        success: false,
        message: 'Submission not found'
      });
    }
    
    // Check authorization - only owner can delete
    if (submission.student.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this submission'
      });
    }
    
    // Only allow deletion for drafts
    if (submission.status !== 'draft') {
      return res.status(400).json({
        success: false,
        message: 'Only draft submissions can be deleted'
      });
    }
    
    // Delete files from Cloudinary
    if (submission.files && submission.files.length > 0) {
      for (const file of submission.files) {
        if (file.public_id) {
          await cloudinary.uploader.destroy(file.public_id);
        }
      }
    }
    
    await submission.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Submission deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};