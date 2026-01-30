const sgMail = require('../config/sendGrid');

const sendEmail = async (options) => {
  const msg = {
    to: options.email,
    from: process.env.EMAIL_FROM,
    subject: options.subject,
    text: options.message,
    html: options.html
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
  
  const message = `You requested a password reset. Please make a PUT request to: \n\n ${resetURL}`;
  
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Password Reset Request</h2>
      <p>Hello ${user.name},</p>
      <p>You requested to reset your password. Click the button below to reset it:</p>
      <a href="${resetURL}" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
        Reset Password
      </a>
      <p>This link will expire in 10 minutes.</p>
      <p>If you didn't request this, please ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
    </div>
  `;

  await sendEmail({
    email: user.email,
    subject: 'Your password reset token (valid for 10 minutes)',
    message,
    html
  });
};

const sendWelcomeEmail = async (user, password = null) => {
  let message = `Welcome to AlmaBetter Clone, ${user.name}!`;
  let html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <h2 style="color: #4F46E5;">Welcome to AlmaBetter Clone!</h2>
      <p>Hello ${user.name},</p>
      <p>Your account has been created successfully.</p>
  `;

  if (password) {
    message += ` Your temporary password is: ${password}`;
    html += `
      <p>Your temporary password is: <strong>${password}</strong></p>
      <p>Please login and change your password immediately.</p>
    `;
  }

  html += `
      <a href="${process.env.FRONTEND_URL}/login" style="background-color: #4F46E5; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block; margin: 20px 0;">
        Login to Your Account
      </a>
      <hr style="border: none; border-top: 1px solid #e0e0e0; margin: 20px 0;">
      <p style="color: #666; font-size: 12px;">AlmaBetter Clone Team</p>
    </div>
  `;

  await sendEmail({
    email: user.email,
    subject: 'Welcome to AlmaBetter Clone',
    message,
    html
  });
};

module.exports = { sendEmail, sendPasswordResetEmail, sendWelcomeEmail };