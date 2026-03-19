const EmailTemplate = require('../models/EmailTemplate');

// ─── Hardcoded defaults (fallback when DB template is missing or inactive) ─────
const DEFAULTS = {
  enrollment_initiated: {
    subject: 'Enrollment Initiated - ZatAcademy',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Enrollment Initiated</h2>
  <p>Hello {{userName}},</p>
  <p>Your enrollment in <strong>{{courseTitle}}</strong> — batch <strong>{{batchName}}</strong> has been initiated.</p>
  <p><strong>Payment Details:</strong></p>
  <ul>
    <li>Total Amount: ₹{{totalAmount}}</li>
    <li>Payment Method: {{paymentMethodLabel}}</li>
    <li>First Payment Due: ₹{{firstPaymentAmount}}</li>
  </ul>
  <p>Please complete your payment to activate your enrollment.</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  payment_success: {
    subject: 'Payment Successful - ZatAcademy',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Payment Successful! 🎉</h2>
  <p>Hello {{userName}},</p>
  <p>Your payment of <strong>₹{{amount}}</strong> for <strong>{{courseTitle}}</strong> has been processed successfully.</p>
  {{#if isFullyPaid}}
  <p>Your course fee is now <strong>fully paid</strong>. Enjoy your learning journey!</p>
  {{else}}
  <p>Total paid so far: <strong>₹{{paidAmount}} / ₹{{totalAmount}}</strong>. Your next EMI will be due in 30 days.</p>
  {{/if}}
  <a href="{{dashboardUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    Go to Dashboard
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  password_reset: {
    subject: 'Your password reset token (valid for 10 minutes)',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Password Reset Request</h2>
  <p>Hello {{userName}},</p>
  <p>You requested to reset your password. Click the button below to reset it:</p>
  <a href="{{resetURL}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    Reset Password
  </a>
  <p>This link will expire in 10 minutes.</p>
  <p>If you didn't request this, please ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  welcome: {
    subject: 'Welcome to ZatAcademy',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Welcome to ZatAcademy!</h2>
  <p>Hello {{userName}},</p>
  <p>Your account has been created successfully.</p>
  {{#if tempPassword}}
  <p>Your temporary password is: <strong>{{tempPassword}}</strong></p>
  <p>Please login and change your password immediately.</p>
  {{/if}}
  <a href="{{loginUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    Login to Your Account
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  email_otp: {
    subject: 'Your ZatAcademy Verification Code',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Email Verification</h2>
  <p>Hello {{userName}},</p>
  <p>Please use the code below to {{purposeLabel}}:</p>
  <div style="text-align: center; margin: 30px 0;">
    <span style="font-size: 36px; font-weight: bold; letter-spacing: 8px; color: #4F46E5; background: #F0EFFF; padding: 16px 32px; border-radius: 8px; display: inline-block;">{{otp}}</span>
  </div>
  <p>This code is valid for <strong>{{expiryMinutes}} minutes</strong>. Do not share it with anyone.</p>
  <p>If you did not request this, please ignore this email.</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  staff_invite: {
    subject: 'You have been invited to join ZatAcademy as {{role}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Welcome to ZatAcademy!</h2>
  <p>Hello {{userName}},</p>
  <p>You have been invited to join ZatAcademy as an <strong>{{role}}</strong>.</p>
  <p>Please click the button below to set up your account, verify your phone number, and choose your password.</p>
  <a href="{{setupUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    Set Up Your Account
  </a>
  <p>This link will expire in 7 days.</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  assignment_graded: {
    subject: 'Assignment Graded: {{assignmentTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Assignment Graded</h2>
  <p>Hello {{userName}},</p>
  <p>Your submission for <strong>{{assignmentTitle}}</strong> has been graded.</p>
  <p><strong>Grade Details:</strong></p>
  <ul>
    <li><strong>Marks Obtained:</strong> {{marksObtained}} / {{maxMarks}}</li>
    <li><strong>Percentage:</strong> {{percentage}}%</li>
    <li><strong>Grade:</strong> {{grade}}</li>
    <li><strong>Status:</strong> {{passStatus}}</li>
  </ul>
  {{#if feedback}}<p><strong>Feedback:</strong> {{feedback}}</p>{{/if}}
  <a href="{{submissionUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Detailed Feedback
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  final_grades_published: {
    subject: 'Final Grades Published: {{courseTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Final Grades Published</h2>
  <p>Hello {{userName}},</p>
  <p>Your final grades for <strong>{{courseTitle}} - {{batchName}}</strong> have been published.</p>
  <p><strong>Final Grade Summary:</strong></p>
  <ul>
    <li><strong>Overall Percentage:</strong> {{overallPercentage}}%</li>
    <li><strong>Final Grade:</strong> {{finalGrade}}</li>
    <li><strong>Assignments Completed:</strong> {{assignmentsCompleted}} / {{assignmentsTotal}}</li>
  </ul>
  <a href="{{gradesUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Detailed Grades
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  assignment_created: {
    subject: 'New Assignment: {{assignmentTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">New Assignment Posted</h2>
  <p>Hello {{userName}},</p>
  <p>A new assignment has been posted for your batch <strong>{{batchName}}</strong>.</p>
  <p><strong>Assignment Details:</strong></p>
  <ul>
    <li><strong>Title:</strong> {{assignmentTitle}}</li>
    <li><strong>Deadline:</strong> {{deadline}}</li>
    <li><strong>Maximum Marks:</strong> {{maxMarks}}</li>
    {{#if passingMarks}}<li><strong>Passing Marks:</strong> {{passingMarks}}</li>{{/if}}
  </ul>
  <a href="{{assignmentUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Assignment
  </a>
  <p>Please submit your assignment before the deadline.</p>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  assignment_published: {
    subject: 'Assignment Now Available: {{assignmentTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Assignment Now Available</h2>
  <p>Hello {{userName}},</p>
  <p>An assignment has been published for your batch <strong>{{batchName}}</strong>.</p>
  <ul>
    <li><strong>Title:</strong> {{assignmentTitle}}</li>
    <li><strong>Start Date:</strong> {{startDate}}</li>
    <li><strong>Deadline:</strong> {{deadline}}</li>
    <li><strong>Maximum Marks:</strong> {{maxMarks}}</li>
  </ul>
  <a href="{{assignmentUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Assignment
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  assignment_updated: {
    subject: 'Assignment Updated: {{assignmentTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Assignment Updated</h2>
  <p>Hello {{userName}},</p>
  <p>An assignment for your batch <strong>{{batchName}}</strong> has been updated.</p>
  <ul>
    <li><strong>Title:</strong> {{assignmentTitle}}</li>
    <li><strong>New Deadline:</strong> {{deadline}}</li>
    {{#if lateDeadline}}<li><strong>Late Submission:</strong> Allowed until {{lateDeadline}}</li>{{/if}}
  </ul>
  <a href="{{assignmentUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Updated Assignment
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  doubt_created_instructor: {
    subject: 'New Doubt Posted: {{doubtTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">New Doubt Posted</h2>
  <p>Hello {{instructorName}},</p>
  <p>A student has posted a new doubt in your batch <strong>{{batchName}}</strong>.</p>
  <p><strong>Doubt Details:</strong></p>
  <ul>
    <li><strong>Title:</strong> {{doubtTitle}}</li>
    <li><strong>Student:</strong> {{studentName}}</li>
    <li><strong>Category:</strong> {{category}}</li>
    <li><strong>Posted:</strong> {{postedAt}}</li>
  </ul>
  <a href="{{doubtUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Doubt
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  doubt_resolved_student: {
    subject: 'Doubt Resolved: {{doubtTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">Doubt Resolved</h2>
  <p>Hello {{userName}},</p>
  <p>Your doubt has been marked as resolved by the instructor.</p>
  <p><strong>Doubt:</strong> {{doubtTitle}}</p>
  <p><strong>Resolved At:</strong> {{resolvedAt}}</p>
  <a href="{{doubtUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Resolution
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },

  doubt_reply_notification: {
    subject: 'New Reply to Your Doubt: {{doubtTitle}}',
    htmlBody: `<div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
  <h2 style="color: #4F46E5;">New Reply to Your Doubt</h2>
  <p>Hello {{userName}},</p>
  <p>{{replyContext}}</p>
  <p><strong>Doubt:</strong> {{doubtTitle}}</p>
  {{#if repliedBy}}<p><strong>Replied By:</strong> {{repliedBy}}</p>{{/if}}
  <a href="{{doubtUrl}}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
    View Reply
  </a>
  <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
  <p style="color: #666; font-size: 12px;">ZatAcademy Team</p>
</div>`,
  },
};

// ─── Core interpolation ────────────────────────────────────────────────────────

/**
 * Replace {{key}} and basic {{#if key}}...{{/if}} blocks in a template string.
 */
function interpolate(template, vars = {}) {
  let result = template;

  // Handle {{#if key}}...{{/if}} blocks
  result = result.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_, key, inner) => {
    return vars[key] ? inner : '';
  });

  // Replace {{key}} with value (or empty string if undefined)
  result = result.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    const val = vars[key];
    return val !== undefined && val !== null ? String(val) : '';
  });

  return result;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Render an email template by slug.
 *
 * Fetches from DB. If not found or inactive, uses hardcoded default.
 * Interpolates {{variable}} placeholders with the provided vars object.
 *
 * @param {string} slug     Template slug (e.g. 'payment_success')
 * @param {object} vars     Key-value pairs for placeholder substitution
 * @returns {{ subject: string, html: string }}
 */
async function renderTemplate(slug, vars = {}) {
  const fallback = DEFAULTS[slug];

  try {
    const dbTemplate = await EmailTemplate.findOne({ slug, isActive: true });
    const tpl = dbTemplate || fallback;

    if (!tpl) {
      console.warn(`[templateService] No template found for slug: ${slug}`);
      return { subject: '', html: '' };
    }

    const subject = interpolate(tpl.subject, vars);
    const html = interpolate(tpl.htmlBody, vars);
    return { subject, html };
  } catch (err) {
    console.error(`[templateService] Error fetching template "${slug}":`, err.message);
    // Fall back to hardcoded default on DB error
    if (fallback) {
      return {
        subject: interpolate(fallback.subject, vars),
        html: interpolate(fallback.htmlBody, vars),
      };
    }
    return { subject: '', html: '' };
  }
}

/**
 * Render a template using only the in-memory defaults (no DB call).
 * Used by the seeder and for testing.
 */
function renderDefault(slug, vars = {}) {
  const fallback = DEFAULTS[slug];
  if (!fallback) return { subject: '', html: '' };
  return {
    subject: interpolate(fallback.subject, vars),
    html: interpolate(fallback.htmlBody, vars),
  };
}

module.exports = { renderTemplate, renderDefault, DEFAULTS, interpolate };
