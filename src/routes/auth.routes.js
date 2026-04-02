const express = require('express');
const router = express.Router();
const {
  register,
  login,
  forgotPassword,
  resetPassword,
  getMe,
  updateDetails,
  updateProfile,
  updatePassword,
  verifyEmailOtp,
  verifyPhoneOtp,
  resendOtp,
  verifyEmailChange,
  verifyPhoneChange,
  validateSetupToken,
  sendSetupOtp,
  completeSetup,
  googleSignIn,
  linkGoogle,
  refreshAccessToken,
  logout,
} = require('../controllers/auth.controller');
const { protect } = require('../middleware/auth');

// ── Public routes ─────────────────────────────────────────────────────────────
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.put('/reset-password/:resetToken', resetPassword);


// OTP verification during registration (no auth required)
router.post('/verify-email', verifyEmailOtp);
router.post('/verify-phone', verifyPhoneOtp);
router.post('/resend-otp', resendOtp);

// Account setup via invite token (no auth required)
router.post('/setup/validate', validateSetupToken);
router.post('/setup/send-otp', sendSetupOtp);
router.post('/setup/complete', completeSetup);

// ── Protected routes ──────────────────────────────────────────────────────────
router.get('/me', protect, getMe);
router.put('/update-details', protect, updateDetails);
// Update phone (with OTP) + education fields — whitelisted for phoneVerified:false users
router.put('/update-profile', protect, updateProfile);
router.put('/update-password', protect, updatePassword);

// OTP verification for email/phone change (auth required)
router.post('/verify-email-change', protect, verifyEmailChange);
router.post('/verify-phone-change', protect, verifyPhoneChange);

// ── Google OAuth routes ────────────────────────────────────────────────────────
// POST /api/v1/auth/google/signin  — verify Google ID token, return JWT (public)
// POST /api/v1/auth/google/link    — link Google to existing account (protected)
router.post('/google/signin', googleSignIn);
router.post('/google/link', protect, linkGoogle);

// ── Token management ──────────────────────────────────────────────────────────────────
router.post('/refresh-token', refreshAccessToken);  // public — uses refresh token as credential
router.post('/logout', protect, logout);             // protected — revokes refresh token

module.exports = router;