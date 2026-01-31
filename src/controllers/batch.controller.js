const Batch = require('../models/Batch');
const Course = require('../models/Course');
const User = require('../models/User');

// @desc    Create new batch
// @route   POST /api/v1/batches
// @access  Private/Admin
exports.createBatch = async (req, res) => {
  try {
    // Check if course exists
    const course = await Course.findById(req.body.course);
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Check if instructor exists and is actually an instructor
    const instructor = await User.findById(req.body.instructor);
    if (!instructor || instructor.role !== 'instructor') {
      return res.status(400).json({
        success: false,
        message: 'Invalid instructor selected'
      });
    }
    
    const batchData = {
      ...req.body,
      createdBy: req.user.id
    };
    
    const batch = await Batch.create(batchData);
    
    res.status(201).json({
      success: true,
      data: batch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get all batches
// @route   GET /api/v1/batches
// @access  Private (admin/instructor) / Limited (student)
exports.getBatches = async (req, res) => {
  try {
    let query;
    
    // Admin can see all batches
    if (req.user.role === 'admin' || req.user.role === 'superAdmin') {
      query = Batch.find().populate('course instructor');
    } 
    // Instructor can see only their batches
    else if (req.user.role === 'instructor') {
      query = Batch.find({ instructor: req.user.id }).populate('course instructor');
    }
    // Student can see active, non-full batches
    else if (req.user.role === 'student') {
      query = Batch.find({
        isActive: true,
        isFull: false,
        startDate: { $gt: new Date() } // Not started yet
      }).populate('course instructor');
    }
    
    // Filter by course if provided
    if (req.query.course) {
      query.find({ course: req.query.course });
    }
    
    // Filter by status
    if (req.query.status === 'upcoming') {
      query.find({ startDate: { $gt: new Date() } });
    } else if (req.query.status === 'ongoing') {
      query.find({ 
        startDate: { $lte: new Date() },
        endDate: { $gte: new Date() }
      });
    } else if (req.query.status === 'completed') {
      query.find({ endDate: { $lt: new Date() } });
    }
    
    const batches = await query;
    
    res.status(200).json({
      success: true,
      count: batches.length,
      data: batches
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single batch
// @route   GET /api/v1/batches/:id
// @access  Private
exports.getBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id)
      .populate('course instructor');
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }
    
    // Authorization checks
    if (req.user.role === 'student' && (!batch.isActive || batch.isFull)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this batch'
      });
    }
    
    if (req.user.role === 'instructor' && batch.instructor._id.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this batch'
      });
    }
    
    res.status(200).json({
      success: true,
      data: batch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update batch
// @route   PUT /api/v1/batches/:id
// @access  Private/Admin
exports.updateBatch = async (req, res) => {
  try {
    let batch = await Batch.findById(req.params.id);
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }
    
    // Check if trying to update instructor
    if (req.body.instructor && req.body.instructor !== batch.instructor.toString()) {
      const instructor = await User.findById(req.body.instructor);
      if (!instructor || instructor.role !== 'instructor') {
        return res.status(400).json({
          success: false,
          message: 'Invalid instructor selected'
        });
      }
    }
    
    batch = await Batch.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    }).populate('course instructor');
    
    res.status(200).json({
      success: true,
      data: batch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete batch
// @route   DELETE /api/v1/batches/:id
// @access  Private/Admin
exports.deleteBatch = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }
    
    // Check if batch has students enrolled
    if (batch.currentStudents > 0) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete batch with enrolled students'
      });
    }
    
    await batch.deleteOne();
    
    res.status(200).json({
      success: true,
      message: 'Batch deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Activate/deactivate batch
// @route   PUT /api/v1/batches/:id/toggle-active
// @access  Private/Admin
exports.toggleActive = async (req, res) => {
  try {
    const batch = await Batch.findById(req.params.id);
    
    if (!batch) {
      return res.status(404).json({
        success: false,
        message: 'Batch not found'
      });
    }
    
    // Can't deactivate batch that has started
    if (!batch.isActive && batch.startDate <= new Date()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate batch that has already started'
      });
    }
    
    batch.isActive = !batch.isActive;
    await batch.save();
    
    res.status(200).json({
      success: true,
      message: `Batch ${batch.isActive ? 'activated' : 'deactivated'} successfully`,
      data: batch
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get batches by course
// @route   GET /api/v1/courses/:courseId/batches
// @access  Public (for students to see available batches)
exports.getBatchesByCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.courseId);
    
    if (!course) {
      return res.status(404).json({
        success: false,
        message: 'Course not found'
      });
    }
    
    // Students can only see active, non-full batches
    const query = Batch.find({
      course: req.params.courseId,
      isActive: true,
      isFull: false
    }).populate('instructor', 'name email');
    
    if (req.user?.role === 'admin' || req.user?.role === 'superAdmin') {
      // Admin can see all batches
      query.find({});
    }
    
    const batches = await query;
    
    res.status(200).json({
      success: true,
      count: batches.length,
      data: {
        course,
        batches
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};