const moment = require('moment');
const { sendEmail } = require('./emailService');

/**
 * Check if user can access a session
 */
exports.canAccessSession = async (session, userId, userRole) => {
  // Admin and super admin can access any session
  if (userRole === 'admin' || userRole === 'superAdmin') {
    return true;
  }

  // Instructor can access their own sessions
  if (userRole === 'instructor' && session.instructor.toString() === userId) {
    return true;
  }

  // Students can access if enrolled in the batch
  if (userRole === 'student') {
    const Enrollment = require('../models/Enrollment');
    const enrollment = await Enrollment.findOne({
      student: userId,
      batch: session.batch,
      enrollmentStatus: 'active'
    });
    
    return !!enrollment && !enrollment.accessRevoked;
  }

  return false;
};

/**
 * Validate session timing (no conflicts)
 */
exports.validateSessionTiming = async (batchId, startTime, endTime, excludeSessionId = null) => {
  const LiveSession = require('../models/LiveSession');
  
  const query = {
    batch: batchId,
    status: { $in: ['scheduled', 'ongoing'] },
    $or: [
      // Session starts during another session
      { startTime: { $lte: startTime }, endTime: { $gt: startTime } },
      // Session ends during another session
      { startTime: { $lt: endTime }, endTime: { $gte: endTime } },
      // Session completely contains another session
      { startTime: { $gte: startTime }, endTime: { $lte: endTime } }
    ]
  };

  if (excludeSessionId) {
    query._id = { $ne: excludeSessionId };
  }

  const conflictingSessions = await LiveSession.find(query);
  
  if (conflictingSessions.length > 0) {
    const conflicts = conflictingSessions.map(s => ({
      id: s._id,
      title: s.title,
      startTime: s.startTime,
      endTime: s.endTime
    }));
    
    return {
      valid: false,
      conflicts,
      message: 'Session conflicts with existing sessions'
    };
  }

  return { valid: true };
};

/**
 * Send session notification emails
 */
exports.sendSessionNotifications = async (session, action) => {
  const Batch = require('../models/Batch');
  const Enrollment = require('../models/Enrollment');
  const User = require('../models/User');

  try {
    const batch = await Batch.findById(session.batch).populate('instructor');
    const enrollments = await Enrollment.find({
      batch: session.batch,
      enrollmentStatus: 'active'
    }).populate('student');

    const instructor = await User.findById(session.instructor);

    // Email templates based on action
    const templates = {
      created: {
        subject: `New Live Session Scheduled: ${session.title}`,
        studentTemplate: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">New Live Session Scheduled</h2>
            <p>Hello ${student.name},</p>
            <p>A new live session has been scheduled for your batch.</p>
            <p><strong>Session Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${session.title}</li>
              <li><strong>Instructor:</strong> ${instructor.name}</li>
              <li><strong>Date & Time:</strong> ${moment(session.startTime).format('MMMM Do YYYY, h:mm A')}</li>
              <li><strong>Duration:</strong> ${session.duration} minutes</li>
            </ul>
            <p>The session link will be available 15 minutes before the scheduled time.</p>
            <a href="${process.env.FRONTEND_URL}/dashboard/sessions" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View in Dashboard
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `
      },
      updated: {
        subject: `Live Session Updated: ${session.title}`,
        studentTemplate: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #4F46E5;">Live Session Updated</h2>
            <p>Hello ${student.name},</p>
            <p>A live session in your batch has been updated.</p>
            <p><strong>Updated Session Details:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${session.title}</li>
              <li><strong>Instructor:</strong> ${instructor.name}</li>
              <li><strong>Date & Time:</strong> ${moment(session.startTime).format('MMMM Do YYYY, h:mm A')}</li>
              <li><strong>Duration:</strong> ${session.duration} minutes</li>
            </ul>
            <a href="${process.env.FRONTEND_URL}/dashboard/sessions" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
              View Updated Session
            </a>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `
      },
      cancelled: {
        subject: `Live Session Cancelled: ${session.title}`,
        studentTemplate: (student) => `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #FF6B6B;">Live Session Cancelled</h2>
            <p>Hello ${student.name},</p>
            <p>The following live session has been cancelled:</p>
            <p><strong>Cancelled Session:</strong></p>
            <ul>
              <li><strong>Title:</strong> ${session.title}</li>
              <li><strong>Instructor:</strong> ${instructor.name}</li>
              <li><strong>Originally Scheduled:</strong> ${moment(session.startTime).format('MMMM Do YYYY, h:mm A')}</li>
              ${session.cancellationReason ? `<li><strong>Reason:</strong> ${session.cancellationReason}</li>` : ''}
            </ul>
            <p>A new session may be scheduled for this topic. Please check your dashboard for updates.</p>
            <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
            <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
          </div>
        `
      }
    };

    const template = templates[action];
    if (!template) return;

    // Send to instructor
    await sendEmail({
      email: instructor.email,
      subject: template.subject,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #4F46E5;">${template.subject}</h2>
          <p>Hello ${instructor.name},</p>
          <p>You have ${action} a live session.</p>
          <p><strong>Session Details:</strong></p>
          <ul>
            <li><strong>Title:</strong> ${session.title}</li>
            <li><strong>Batch:</strong> ${batch.name}</li>
            <li><strong>Date & Time:</strong> ${moment(session.startTime).format('MMMM Do YYYY, h:mm A')}</li>
            <li><strong>Duration:</strong> ${session.duration} minutes</li>
            ${session.cancellationReason ? `<li><strong>Cancellation Reason:</strong> ${session.cancellationReason}</li>` : ''}
          </ul>
          <a href="${process.env.FRONTEND_URL}/instructor/sessions" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
            Manage Sessions
          </a>
        </div>
      `
    });

    // Send to students
    for (const enrollment of enrollments) {
      if (enrollment.student && enrollment.student.email) {
        await sendEmail({
          email: enrollment.student.email,
          subject: template.subject,
          html: template.studentTemplate(enrollment.student)
        });
      }
    }

    console.log(`Session ${action} notifications sent to ${enrollments.length} students`);
  } catch (error) {
    console.error('Error sending session notifications:', error);
  }
};

/**
 * Generate session access token
 */
exports.generateSessionAccessToken = (userId, sessionId, role) => {
  const crypto = require('crypto');
  
  const payload = {
    userId,
    sessionId,
    role,
    timestamp: Date.now(),
    exp: Date.now() + (2 * 60 * 60 * 1000) // 2 hours
  };
  
  const signature = crypto
    .createHmac('sha256', process.env.SESSION_LINK_SECRET)
    .update(JSON.stringify(payload))
    .digest('hex');
  
  return Buffer.from(JSON.stringify(payload)).toString('base64') + '.' + signature;
};

/**
 * Verify session access token
 */
exports.verifySessionAccessToken = (token) => {
  try {
    const crypto = require('crypto');
    const [payloadBase64, signature] = token.split('.');
    
    if (!payloadBase64 || !signature) {
      throw new Error('Invalid token format');
    }
    
    const payloadString = Buffer.from(payloadBase64, 'base64').toString('utf-8');
    const payload = JSON.parse(payloadString);
    
    const expectedSignature = crypto
      .createHmac('sha256', process.env.SESSION_LINK_SECRET)
      .update(payloadString)
      .digest('hex');
    
    if (signature !== expectedSignature) {
      throw new Error('Invalid signature');
    }
    
    if (payload.exp < Date.now()) {
      throw new Error('Token expired');
    }
    
    return payload;
  } catch (error) {
    throw new Error('Invalid token: ' + error.message);
  }
};