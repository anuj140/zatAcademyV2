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

module.exports = { sendEmail, sendPasswordResetEmail, sendWelcomeEmail };