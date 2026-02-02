const SessionMaterial = require('../models/SessionMaterial');
const LiveSession = require('../models/LiveSession');
const cloudinary = require('../config/cloudinary');

// @desc    Upload session material
// @route   POST /api/v1/session-materials
// @access  Private/Instructor
exports.uploadMaterial = async (req, res) => {
  try {
    const { liveSessionId, title, description, materialType, availableFrom, availableUntil } = req.body;
    
    // Validate session exists
    const session = await LiveSession.findById(liveSessionId);
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Check authorization
    if (session.instructor.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to upload materials for this session'
      });
    }
    
    let materialData = {
      title,
      description,
      liveSession: liveSessionId,
      batch: session.batch,
      course: session.course,
      materialType,
      uploadedBy: req.user.id
    };
    
    // Handle file upload or link
    if (req.file) {
      materialData.fileType = getFileType(req.file.mimetype);
      materialData.file = {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      };
    } else if (req.body.linkUrl) {
      materialData.fileType = 'link';
      materialData.linkUrl = req.body.linkUrl;
      materialData.linkTitle = req.body.linkTitle || title;
    } else {
      return res.status(400).json({
        success: false,
        message: 'Please provide either a file or a link'
      });
    }
    
    // Set availability
    if (availableFrom) materialData.availableFrom = new Date(availableFrom);
    if (availableUntil) materialData.availableUntil = new Date(availableUntil);
    
    const material = await SessionMaterial.create(materialData);
    
    // Update session material count
    session.hasMaterials = true;
    session.materialsCount = await SessionMaterial.countDocuments({ liveSession: liveSessionId });
    await session.save();
    
    res.status(201).json({
      success: true,
      message: 'Material uploaded successfully',
      data: material
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get session materials
// @route   GET /api/v1/live-sessions/:sessionId/materials
// @access  Private (enrolled students/instructor)
exports.getSessionMaterials = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const { materialType, fileType } = req.query;
    
    // Build query
    const query = { liveSession: sessionId };
    
    if (materialType) {
      query.materialType = materialType;
    }
    
    if (fileType) {
      query.fileType = fileType;
    }
    
    // For students, only show available materials
    if (req.user.role === 'student') {
      query.isPublic = true;
      query.$or = [
        { availableFrom: { $lte: new Date() } },
        { availableFrom: { $exists: false } }
      ];
      query.$or.push(
        { availableUntil: { $gte: new Date() } },
        { availableUntil: { $exists: false } }
      );
    }
    
    const materials = await SessionMaterial.find(query)
      .sort({ createdAt: -1 })
      .populate('uploadedBy', 'name');
    
    res.status(200).json({
      success: true,
      count: materials.length,
      data: materials
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get single material
// @route   GET /api/v1/session-materials/:id
// @access  Private (enrolled students/instructor)
exports.getMaterial = async (req, res) => {
  try {
    const material = await SessionMaterial.findById(req.params.id)
      .populate('liveSession', 'title startTime')
      .populate('uploadedBy', 'name email');
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Increment view count
    material.viewCount += 1;
    await material.save();
    
    res.status(200).json({
      success: true,
      data: material
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update material
// @route   PUT /api/v1/session-materials/:id
// @access  Private/Instructor
exports.updateMaterial = async (req, res) => {
  try {
    const material = await SessionMaterial.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check authorization
    if (material.uploadedBy.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this material'
      });
    }
    
    // Handle file update if provided
    if (req.file) {
      // Delete old file from Cloudinary
      if (material.file && material.file.public_id) {
        await cloudinary.uploader.destroy(material.file.public_id);
      }
      
      req.body.file = {
        url: req.file.path,
        public_id: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimeType: req.file.mimetype
      };
      req.body.fileType = getFileType(req.file.mimetype);
    }
    
    const updatedMaterial = await SessionMaterial.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    
    res.status(200).json({
      success: true,
      message: 'Material updated successfully',
      data: updatedMaterial
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Delete material
// @route   DELETE /api/v1/session-materials/:id
// @access  Private/Instructor
exports.deleteMaterial = async (req, res) => {
  try {
    const material = await SessionMaterial.findById(req.params.id);
    
    if (!material) {
      return res.status(404).json({
        success: false,
        message: 'Material not found'
      });
    }
    
    // Check authorization
    if (material.uploadedBy.toString() !== req.user.id && 
        req.user.role !== 'admin' && 
        req.user.role !== 'superAdmin') {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this material'
      });
    }
    
    // Delete file from Cloudinary if exists
    if (material.file && material.file.public_id) {
      await cloudinary.uploader.destroy(material.file.public_id);
    }
    
    await material.deleteOne();
    
    // Update session material count
    const LiveSession = require('../models/LiveSession');
    const session = await LiveSession.findById(material.liveSession);
    if (session) {
      session.materialsCount = await SessionMaterial.countDocuments({ 
        liveSession: material.liveSession 
      });
      session.hasMaterials = session.materialsCount > 0;
      await session.save();
    }
    
    res.status(200).json({
      success: true,
      message: 'Material deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get student session dashboard
// @route   GET /api/v1/student/sessions
// @access  Private/Student
exports.getStudentSessions = async (req, res) => {
  try {
    // Get student's active enrollments
    const Enrollment = require('../models/Enrollment');
    const enrollments = await Enrollment.find({
      student: req.user.id,
      enrollmentStatus: 'active'
    }).select('batch');
    
    const batchIds = enrollments.map(e => e.batch);
    
    if (batchIds.length === 0) {
      return res.status(200).json({
        success: true,
        data: {
          upcomingSessions: [],
          ongoingSessions: [],
          pastSessions: [],
          materials: []
        }
      });
    }
    
    // Get upcoming sessions (next 7 days)
    const sevenDaysLater = new Date();
    sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
    
    const upcomingSessions = await LiveSession.find({
      batch: { $in: batchIds },
      startTime: { $gt: new Date(), $lte: sevenDaysLater },
      status: 'scheduled'
    })
      .sort({ startTime: 1 })
      .populate('batch', 'name')
      .populate('course', 'title')
      .populate('instructor', 'name');
    
    // Get ongoing sessions
    const ongoingSessions = await LiveSession.find({
      batch: { $in: batchIds },
      startTime: { $lte: new Date() },
      endTime: { $gte: new Date() },
      status: { $in: ['scheduled', 'ongoing'] }
    })
      .populate('batch', 'name')
      .populate('course', 'title')
      .populate('instructor', 'name');
    
    // Get past sessions (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const pastSessions = await LiveSession.find({
      batch: { $in: batchIds },
      endTime: { $gte: thirtyDaysAgo, $lt: new Date() }
    })
      .sort({ startTime: -1 })
      .limit(20)
      .populate('batch', 'name')
      .populate('course', 'title')
      .populate('instructor', 'name');
    
    // Get recent materials
    const recentMaterials = await SessionMaterial.find({
      batch: { $in: batchIds },
      isPublic: true,
      $or: [
        { availableFrom: { $lte: new Date() } },
        { availableFrom: { $exists: false } }
      ]
    })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('liveSession', 'title');
    
    res.status(200).json({
      success: true,
      data: {
        upcomingSessions,
        ongoingSessions,
        pastSessions,
        recentMaterials,
        enrollmentCount: batchIds.length
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Helper function to determine file type from mime type
function getFileType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType === 'application/pdf') return 'pdf';
  if (mimeType.includes('presentation')) return 'presentation';
  if (mimeType.includes('document')) return 'document';
  return 'other';
}