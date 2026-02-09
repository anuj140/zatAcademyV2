const tokenService = require('../utils/tokenService');
const User = require('../models/User');

/**
 * Protect routes - Verify access token
 */
const protect = async (req, res, next) => {
  let token;
  
  // Get token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  }
  
  // Get token from cookie (alternative method)
  else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }
  
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Access token required. Please login.'
    });
  }
  
  try {
    // Check if token is blacklisted
    const isBlacklisted = await tokenService.isAccessTokenBlacklisted(token);
    if (isBlacklisted) {
      return res.status(401).json({
        success: false,
        message: 'Token has been revoked. Please login again.'
      });
    }
    
    // Verify access token
    const decoded = tokenService.verifyAccessToken(token);
    
    // Check if user exists and is active
    const user = await User.findById(decoded.id).select('+refreshTokens');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User not found or account is inactive'
      });
    }
    
    // Check if user is locked
    if (user.isLocked()) {
      return res.status(423).json({
        success: false,
        message: 'Account is temporarily locked due to too many failed login attempts'
      });
    }
    
    // Check if password was changed after token was issued
    if (user.lastPasswordChange && decoded.iat) {
      const passwordChangedAt = Math.floor(user.lastPasswordChange.getTime() / 1000);
      if (passwordChangedAt > decoded.iat) {
        return res.status(401).json({
          success: false,
          message: 'Password was changed recently. Please login again.'
        });
      }
    }
    
    // Attach user to request
    req.user = user;
    req.token = token;
    
    // Check if token is about to expire
    if (tokenService.isTokenExpiringSoon(token)) {
      res.set('X-Token-Expiring-Soon', 'true');
    }
    
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Access token expired',
        code: 'TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid access token',
        code: 'INVALID_TOKEN'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
      error: error.message
    });
  }
};

/**
 * Optional authentication - Try to authenticate but don't fail
 */
const optionalAuth = async (req, res, next) => {
  let token;
  
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies && req.cookies.accessToken) {
    token = req.cookies.accessToken;
  }
  
  if (!token) {
    return next();
  }
  
  try {
    const decoded = tokenService.verifyAccessToken(token);
    const user = await User.findById(decoded.id);
    
    if (user && user.isActive && !user.isLocked()) {
      req.user = user;
      req.token = token;
    }
  } catch (error) {
    // Silently fail for optional auth
  }
  
  next();
};

/**
 * Refresh token validation middleware
 */
const validateRefreshToken = async (req, res, next) => {
  let refreshToken;
  
  // Get refresh token from Authorization header
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Refresh')
  ) {
    refreshToken = req.headers.authorization.split(' ')[1];
  }
  
  // Get refresh token from cookie
  else if (req.cookies && req.cookies.refreshToken) {
    refreshToken = req.cookies.refreshToken;
  }
  
  // Get refresh token from body
  else if (req.body && req.body.refreshToken) {
    refreshToken = req.body.refreshToken;
  }
  
  if (!refreshToken) {
    return res.status(400).json({
      success: false,
      message: 'Refresh token required'
    });
  }
  
  try {
    // Verify refresh token
    const decoded = tokenService.verifyRefreshToken(refreshToken);
    
    // Find user with this refresh token
    const user = await User.findOne({
      _id: decoded.id,
      'refreshTokens.token': refreshToken,
      'refreshTokens.isActive': true
    }).select('+refreshTokens');
    
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token or user not found'
      });
    }
    
    // Check if refresh token is expired
    const tokenDoc = user.refreshTokens.find(t => t.token === refreshToken);
    if (new Date() > new Date(tokenDoc.expiresAt)) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired'
      });
    }
    
    // Update last used timestamp
    tokenDoc.lastUsedAt = new Date();
    await user.save();
    
    // Attach to request
    req.refreshToken = refreshToken;
    req.user = user;
    
    next();
  } catch (error) {
    // Handle specific JWT errors
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Refresh token expired',
        code: 'REFRESH_TOKEN_EXPIRED'
      });
    }
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token',
        code: 'INVALID_REFRESH_TOKEN'
      });
    }
    
    return res.status(401).json({
      success: false,
      message: 'Refresh token validation failed',
      error: error.message
    });
  }
};

/**
 * Device info extraction middleware
 */
const extractDeviceInfo = (req, res, next) => {
  const deviceInfo = {
    deviceId: req.headers['x-device-id'] || req.body.deviceId,
    deviceName: req.headers['x-device-name'] || req.body.deviceName || 'Unknown Device',
    browser: req.useragent ? req.useragent.browser : 'Unknown Browser',
    os: req.useragent ? req.useragent.os : 'Unknown OS',
    ipAddress: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
    userAgent: req.headers['user-agent'] || 'Unknown'
  };
  
  req.deviceInfo = deviceInfo;
  next();
};

/**
 * Rate limiting middleware for auth endpoints
 */
const authRateLimit = require('express-rate-limit')({
  windowMs: (process.env.AUTH_RATE_LIMIT_WINDOW || 15) * 60 * 1000,
  max: process.env.AUTH_RATE_LIMIT_MAX || 10,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true
});

module.exports = {
  protect,
  optionalAuth,
  validateRefreshToken,
  extractDeviceInfo,
  authRateLimit
};