const { verifySessionAccessToken } = require('../utils/sessionUtils');
const { canAccessSession } = require('../utils/sessionUtils');
const LiveSession = require('../models/LiveSession');

/**
 * Middleware to validate session access via token
 */
exports.validateSessionToken = async (req, res, next) => {
  try {
    const { token } = req.query;
    
    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Session access token required'
      });
    }
    
    const payload = verifySessionAccessToken(token);
    
    // Attach to request
    req.sessionAccess = payload;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid session access token',
      error: error.message
    });
  }
};

/**
 * Middleware to check if user can join session
 */
exports.canJoinSession = async (req, res, next) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user ? req.user.id : req.sessionAccess.userId;
    const userRole = req.user ? req.user.role : req.sessionAccess.role;
    
    const session = await LiveSession.findById(sessionId);
    
    if (!session) {
      return res.status(404).json({
        success: false,
        message: 'Session not found'
      });
    }
    
    // Check access permissions
    const hasAccess = await canAccessSession(session, userId, userRole);
    
    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to join this session'
      });
    }
    
    // Check if session is ongoing or upcoming
    const now = new Date();
    const fifteenMinutesBefore = new Date(session.startTime);
    fifteenMinutesBefore.setMinutes(fifteenMinutesBefore.getMinutes() - 15);
    
    if (now < fifteenMinutesBefore && userRole !== 'instructor') {
      return res.status(400).json({
        success: false,
        message: 'Session is not open yet. Please join 15 minutes before start time.'
      });
    }
    
    // Check if session has ended
    if (now > session.endTime && session.status !== 'ongoing') {
      return res.status(400).json({
        success: false,
        message: 'Session has ended'
      });
    }
    
    // Check if session is cancelled
    if (session.status === 'cancelled') {
      return res.status(400).json({
        success: false,
        message: 'Session has been cancelled'
      });
    }
    
    req.session = session;
    next();
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

/**
 * Middleware for instructor-only session actions
 */
exports.instructorOnly = (req, res, next) => {
  const userRole = req.user ? req.user.role : req.sessionAccess.role;
  
  if (userRole !== 'instructor' && userRole !== 'admin' && userRole !== 'superAdmin') {
    return res.status(403).json({
      success: false,
      message: 'Only instructors can perform this action'
    });
  }
  
  // Check if instructor owns the session
  if (req.session && req.session.instructor.toString() !== req.user.id && 
      userRole !== 'admin' && userRole !== 'superAdmin') {
    return res.status(403).json({
      success: false,
      message: 'You can only manage your own sessions'
    });
  }
  
  next();
};