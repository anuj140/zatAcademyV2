const crypto = require('crypto');
const User = require('../models/User');
const tokenService = require('../utils/tokenService');
const { sendPasswordResetEmail, sendWelcomeEmail } = require('../utils/emailService');

// @desc    Register a new user (Only student registration allowed publicly)
// @route   POST /api/v1/auth/register
// @access  Public
exports.register = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }
    
    // Only allow student registration from public route
    const user = await User.create({
      name,
      email,
      password,
      role: 'student' // Force student role for public registration
    });
    
    // Send welcome email
    await sendWelcomeEmail(user);
    
    // Generate token pair
    const { accessToken, refreshToken } = await tokenService.generateTokenPair(
      user,
      req.deviceInfo
    );
    
    // Set refresh token as HTTP-only cookie
    res.cookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      refreshToken,
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    );
    
    res.status(201).json({
      success: true,
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;
    
    // Validate email & password
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Please provide email and password'
      });
    }
    
    // Check for user with password
    const user = await User.findOne({ email }).select('+password +loginAttempts +lockUntil');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials or account is inactive'
      });
    }
    
    // Check if account is locked
    if (user.isLocked()) {
      const lockTime = Math.ceil((user.lockUntil - Date.now()) / (1000 * 60));
      return res.status(423).json({
        success: false,
        message: `Account is temporarily locked. Try again in ${lockTime} minutes.`
      });
    }
    
    // Check if password matches
    const isMatch = await user.comparePassword(password);
    
    if (!isMatch) {
      // Increment failed login attempts
      user.incrementLoginAttempts();
      await user.save();
      
      const attemptsLeft = 5 - user.loginAttempts;
      
      return res.status(401).json({
        success: false,
        message: `Invalid credentials. ${attemptsLeft > 0 ? `${attemptsLeft} attempts left` : 'Account locked for 30 minutes'}`
      });
    }
    
    // Reset login attempts on successful login
    user.resetLoginAttempts();
    user.lastLogin = new Date();
    
    // Add device as trusted if rememberMe is true
    if (rememberMe && req.deviceInfo.deviceId) {
      user.addTrustedDevice(req.deviceInfo);
    }
    
    await user.save();
    
    // Generate token pair
    const { accessToken, refreshToken } = await tokenService.generateTokenPair(
      user,
      req.deviceInfo
    );
    
    // Set refresh token as HTTP-only cookie
    const refreshTokenExpiry = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000; // 30 days or 7 days
    
    res.cookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      refreshToken,
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict',
        maxAge: refreshTokenExpiry
      }
    );
    
    res.status(200).json({
      success: true,
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Refresh access token
// @route   POST /api/v1/auth/refresh
// @access  Public (requires valid refresh token)
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req;
    
    // Rotate refresh token (issue new access and refresh tokens)
    const { accessToken, newRefreshToken, user } = await tokenService.rotateRefreshToken(
      refreshToken,
      req.deviceInfo
    );
    
    // Set new refresh token as HTTP-only cookie
    res.cookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      newRefreshToken,
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    );
    
    res.status(200).json({
      success: true,
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message,
      code: 'REFRESH_TOKEN_INVALID'
    });
  }
};

// @desc    Logout user
// @route   POST /api/v1/auth/logout
// @access  Private
exports.logout = async (req, res) => {
  try {
    const { token, user } = req;
    
    // Blacklist the current access token
    if (token) {
      await tokenService.blacklistAccessToken(token, 'logout');
    }
    
    // Clear refresh token cookie
    res.clearCookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict'
      }
    );
    
    // If user is authenticated, revoke their refresh token
    if (user && req.cookies && req.cookies.refreshToken) {
      await tokenService.revokeRefreshToken(user._id, req.cookies.refreshToken);
    }
    
    res.status(200).json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Logout from all devices
// @route   POST /api/v1/auth/logout-all
// @access  Private
exports.logoutAll = async (req, res) => {
  try {
    const { token, user } = req;
    
    // Blacklist the current access token
    if (token) {
      await tokenService.blacklistAccessToken(token, 'logout_all');
    }
    
    // Clear refresh token cookie
    res.clearCookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict'
      }
    );
    
    // Revoke all refresh tokens for this user
    if (user) {
      await tokenService.revokeRefreshToken(user._id);
    }
    
    res.status(200).json({
      success: true,
      message: 'Logged out from all devices successfully'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get active sessions/devices
// @route   GET /api/v1/auth/sessions
// @access  Private
exports.getActiveSessions = async (req, res) => {
  try {
    const activeTokens = await tokenService.getActiveRefreshTokens(req.user.id);
    
    res.status(200).json({
      success: true,
      data: activeTokens
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Revoke specific session/device
// @route   DELETE /api/v1/auth/sessions/:deviceId
// @access  Private
exports.revokeSession = async (req, res) => {
  try {
    const { deviceId } = req.params;
    
    const result = await tokenService.revokeRefreshToken(req.user.id, null, deviceId);
    
    // If current device is being revoked, also blacklist current access token
    const currentDevice = req.user.refreshTokens?.find(
      token => token.deviceId === deviceId && token.isActive
    );
    
    if (currentDevice && req.token) {
      await tokenService.blacklistAccessToken(req.token, 'session_revoked');
    }
    
    res.status(200).json({
      success: true,
      message: `Revoked ${result.revoked} session(s)`,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found with this email'
      });
    }
    
    // Generate reset token
    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });
    
    // Send email
    try {
      await sendPasswordResetEmail(user, resetToken);
      
      res.status(200).json({
        success: true,
        message: 'Password reset email sent successfully'
      });
    } catch (error) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(500).json({
        success: false,
        message: 'Email could not be sent'
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Reset password
// @route   PUT /api/v1/auth/reset-password/:resetToken
// @access  Public
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { password } = req.body;
    
    // Hash token
    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    
    // Find user by token and check expiration
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });
    
    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token is invalid or has expired'
      });
    }
    
    // Set new password (this will trigger password change timestamp)
    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    
    // Revoke all existing refresh tokens (security measure)
    await tokenService.revokeRefreshToken(user._id);
    
    await user.save();
    
    // Generate new token pair
    const { accessToken, refreshToken } = await tokenService.generateTokenPair(
      user,
      req.deviceInfo
    );
    
    // Set refresh token as HTTP-only cookie
    res.cookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      refreshToken,
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    );
    
    res.status(200).json({
      success: true,
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Get current logged in user
// @route   GET /api/v1/auth/me
// @access  Private
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);
    
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update user details
// @route   PUT /api/v1/auth/update-details
// @access  Private
exports.updateDetails = async (req, res) => {
  try {
    const fieldsToUpdate = {
      name: req.body.name,
      email: req.body.email
    };
    
    const user = await User.findByIdAndUpdate(req.user.id, fieldsToUpdate, {
      new: true,
      runValidators: true
    });
    
    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Update password
// @route   PUT /api/v1/auth/update-password
// @access  Private
exports.updatePassword = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('+password');
    
    // Check current password
    const isMatch = await user.comparePassword(req.body.currentPassword);
    
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Current password is incorrect'
      });
    }
    
    // Update password (this will trigger password change timestamp)
    user.password = req.body.newPassword;
    
    // Revoke all existing refresh tokens (security measure)
    await tokenService.revokeRefreshToken(user._id);
    
    // Blacklist current access token
    if (req.token) {
      await tokenService.blacklistAccessToken(req.token, 'password_change');
    }
    
    await user.save();
    
    // Generate new token pair
    const { accessToken, refreshToken } = await tokenService.generateTokenPair(
      user,
      req.deviceInfo
    );
    
    // Set refresh token as HTTP-only cookie
    res.cookie(
      process.env.REFRESH_TOKEN_COOKIE_NAME || 'refreshToken',
      refreshToken,
      {
        httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY === 'true',
        secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === 'true',
        sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      }
    );
    
    res.status(200).json({
      success: true,
      message: 'Password updated successfully',
      accessToken,
      expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m'
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// @desc    Verify access token (health check)
// @route   GET /api/v1/auth/verify
// @access  Private
exports.verifyToken = async (req, res) => {
  try {
    const decoded = tokenService.verifyAccessToken(req.token);
    
    res.status(200).json({
      success: true,
      message: 'Token is valid',
      user: {
        id: decoded.id,
        role: decoded.role,
        email: decoded.email
      },
      expiresAt: tokenService.getTokenExpiration(req.token)
    });
  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
};