const sgMail = require('../config/sendGrid');
const { renderTemplate } = require('./templateService');

const sendEmail = async (options) => {
  const msg = {
    to: options.email,
    from: process.env.EMAIL_FROM,
    subject: options.subject,
    text: options.message,
    html: options.html,
  };

  try {
    await sgMail.send(msg);
    console.log('Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error('Email could not be sent');
  }
};

const sendPasswordResetEmail = async (user, resetToken) => {
  const resetURL = `${process.env.FRONTEND_URL}/reset-password/${resetToken}`;

  const { subject, html } = await renderTemplate('password_reset', {
    userName: user.name,
    resetURL,
  });

  await sendEmail({ email: user.email, subject, html });
};

const sendWelcomeEmail = async (user, password = null) => {
  const { subject, html } = await renderTemplate('welcome', {
    userName: user.name,
    tempPassword: password || '',
    loginUrl: `${process.env.FRONTEND_URL}/login`,
  });

  await sendEmail({ email: user.email, subject, html });
};

/**
 * Send an OTP email for email verification or email change.
 * @param {object} user    - User document (needs .name, .email or provided email)
 * @param {string} otp     - Plain OTP
 * @param {string} toEmail - Destination email address
 * @param {string} purpose - 'verify' | 'change' (controls the message copy)
 */
const sendEmailOtp = async (user, otp, toEmail, purpose = 'verify') => {
  const purposeLabel = purpose === 'change'
    ? 'confirm your new email address'
    : 'verify your email address';

  const { subject, html } = await renderTemplate('email_otp', {
    userName: user.name,
    otp,
    purposeLabel,
    expiryMinutes: 10,
  });

  await sendEmail({ email: toEmail, subject, html });
};

const sendStaffInviteEmail = async (user, inviteToken) => {
  const setupUrl = `${process.env.FRONTEND_URL}/setup-account?token=${inviteToken}`;

  const { subject, html } = await renderTemplate('staff_invite', {
    userName: user.name,
    role: user.role,
    setupUrl,
  });

  await sendEmail({ email: user.email, subject, html });
};

module.exports = { sendEmail, sendPasswordResetEmail, sendWelcomeEmail, sendEmailOtp, sendStaffInviteEmail };