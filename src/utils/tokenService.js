const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');

class TokenService {
  /**
   * Generate access token
   */
  generateAccessToken(user) {
    const payload = {
      id: user._id,
      role: user.role,
      email: user.email,
      type: 'access'
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET,
      { 
        expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m',
        issuer: 'zatAcademy',
        audience: 'zatAcademy-users'
      }
    );
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(user, deviceInfo = {}) {
    const payload = {
      id: user._id,
      type: 'refresh',
      device: deviceInfo.deviceId || crypto.randomBytes(16).toString('hex')
    };

    return jwt.sign(
      payload,
      process.env.REFRESH_TOKEN_SECRET,
      { 
        expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
        issuer: 'zatAcademy',
        audience: 'zatAcademy-users'
      }
    );
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      return jwt.verify(token, process.env.JWT_SECRET, {
        issuer: 'zatAcademy',
        audience: 'zatAcademy-users'
      });
    } catch (error) {
      throw new Error(`Invalid access token: ${error.message}`);
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      return jwt.verify(token, process.env.REFRESH_TOKEN_SECRET, {
        issuer: 'zatAcademy',
        audience: 'zatAcademy-users'
      });
    } catch (error) {
      throw new Error(`Invalid refresh token: ${error.message}`);
    }
  }

  /**
   * Decode token without verification (for logging/auditing)
   */
  decodeToken(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token) {
    const decoded = this.decodeToken(token);
    if (decoded && decoded.exp) {
      return new Date(decoded.exp * 1000);
    }
    return null;
  }

  /**
   * Check if token is about to expire (within 5 minutes)
   */
  isTokenExpiringSoon(token) {
    const expiration = this.getTokenExpiration(token);
    if (!expiration) return false;
    
    const fiveMinutes = 5 * 60 * 1000; // 5 minutes in milliseconds
    return expiration.getTime() - Date.now() <= fiveMinutes;
  }

  /**
   * Generate token pair (access + refresh)
   */
  async generateTokenPair(user, deviceInfo = {}) {
    const accessToken = this.generateAccessToken(user);
    const refreshToken = this.generateRefreshToken(user, deviceInfo);
    
    // Store refresh token in database
    await this.storeRefreshToken(user._id, refreshToken, deviceInfo);
    
    return { accessToken, refreshToken };
  }

  /**
   * Store refresh token in database
   */
  async storeRefreshToken(userId, refreshToken, deviceInfo = {}) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }

    const decoded = this.decodeToken(refreshToken);
    const expiresAt = decoded ? new Date(decoded.exp * 1000) : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    
    const refreshTokenDoc = {
      token: refreshToken,
      deviceId: deviceInfo.deviceId || crypto.randomBytes(16).toString('hex'),
      deviceName: deviceInfo.deviceName || 'Unknown Device',
      browser: deviceInfo.browser || 'Unknown Browser',
      os: deviceInfo.os || 'Unknown OS',
      ipAddress: deviceInfo.ipAddress || 'Unknown',
      userAgent: deviceInfo.userAgent || 'Unknown',
      createdAt: new Date(),
      expiresAt: expiresAt,
      lastUsedAt: new Date(),
      isActive: true
    };

    // Add to user's refresh tokens array
    user.refreshTokens = user.refreshTokens || [];
    
    // Limit number of refresh tokens per user
    const maxTokens = parseInt(process.env.MAX_REFRESH_TOKENS_PER_USER) || 5;
    if (user.refreshTokens.length >= maxTokens) {
      // Remove oldest token
      user.refreshTokens.sort((a, b) => a.lastUsedAt - b.lastUsedAt);
      user.refreshTokens.shift();
    }
    
    user.refreshTokens.push(refreshTokenDoc);
    await user.save();
    
    return refreshTokenDoc;
  }

  /**
   * Verify and rotate refresh token
   */
  async rotateRefreshToken(oldRefreshToken, deviceInfo = {}) {
    try {
      // Verify old refresh token
      const decoded = this.verifyRefreshToken(oldRefreshToken);
      
      // Find user and the specific refresh token
      const user = await User.findById(decoded.id).select('+refreshTokens');
      
      if (!user || !user.refreshTokens) {
        throw new Error('User or refresh tokens not found');
      }

      // Find the specific refresh token
      const tokenIndex = user.refreshTokens.findIndex(
        token => token.token === oldRefreshToken && token.isActive
      );

      if (tokenIndex === -1) {
        throw new Error('Refresh token not found or revoked');
      }

      // Check if token is expired
      const tokenDoc = user.refreshTokens[tokenIndex];
      if (new Date() > new Date(tokenDoc.expiresAt)) {
        // Remove expired token
        user.refreshTokens.splice(tokenIndex, 1);
        await user.save();
        throw new Error('Refresh token expired');
      }

      // Revoke old token
      user.refreshTokens[tokenIndex].isActive = false;
      user.refreshTokens[tokenIndex].revokedAt = new Date();
      user.refreshTokens[tokenIndex].revokedReason = 'rotated';

      // Generate new token pair
      const { accessToken, refreshToken } = await this.generateTokenPair(user, {
        ...deviceInfo,
        deviceId: tokenDoc.deviceId // Keep same device ID
      });

      // Update device info if provided
      if (deviceInfo.deviceName) {
        user.refreshTokens[tokenIndex].deviceName = deviceInfo.deviceName;
      }
      if (deviceInfo.browser) {
        user.refreshTokens[tokenIndex].browser = deviceInfo.browser;
      }
      if (deviceInfo.os) {
        user.refreshTokens[tokenIndex].os = deviceInfo.os;
      }

      await user.save();

      return { accessToken, refreshToken, user };
    } catch (error) {
      throw new Error(`Token rotation failed: ${error.message}`);
    }
  }

  /**
   * Revoke refresh token
   */
  async revokeRefreshToken(userId, tokenToRevoke = null, deviceId = null) {
    const user = await User.findById(userId).select('+refreshTokens');
    
    if (!user || !user.refreshTokens) {
      return { revoked: 0 };
    }

    let revokedCount = 0;

    if (tokenToRevoke) {
      // Revoke specific token
      const tokenIndex = user.refreshTokens.findIndex(
        token => token.token === tokenToRevoke
      );
      
      if (tokenIndex !== -1) {
        user.refreshTokens[tokenIndex].isActive = false;
        user.refreshTokens[tokenIndex].revokedAt = new Date();
        user.refreshTokens[tokenIndex].revokedReason = 'user_revoked';
        revokedCount++;
      }
    } else if (deviceId) {
      // Revoke all tokens for specific device
      user.refreshTokens.forEach(token => {
        if (token.deviceId === deviceId && token.isActive) {
          token.isActive = false;
          token.revokedAt = new Date();
          token.revokedReason = 'device_revoked';
          revokedCount++;
        }
      });
    } else {
      // Revoke all tokens for user
      user.refreshTokens.forEach(token => {
        if (token.isActive) {
          token.isActive = false;
          token.revokedAt = new Date();
          token.revokedReason = 'all_revoked';
          revokedCount++;
        }
      });
    }

    await user.save();
    return { revoked: revokedCount };
  }

  /**
   * Clean up expired refresh tokens
   */
  async cleanupExpiredTokens() {
    const cutoffDate = new Date();
    
    const result = await User.updateMany(
      { 'refreshTokens.expiresAt': { $lt: cutoffDate } },
      { 
        $pull: { 
          refreshTokens: { expiresAt: { $lt: cutoffDate } } 
        } 
      }
    );

    return { cleaned: result.modifiedCount };
  }

  /**
   * Get active refresh tokens for user
   */
  async getActiveRefreshTokens(userId) {
    const user = await User.findById(userId).select('refreshTokens');
    
    if (!user || !user.refreshTokens) {
      return [];
    }

    const now = new Date();
    return user.refreshTokens.filter(token => 
      token.isActive && new Date(token.expiresAt) > now
    ).map(token => ({
      deviceId: token.deviceId,
      deviceName: token.deviceName,
      browser: token.browser,
      os: token.os,
      ipAddress: token.ipAddress,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
      expiresAt: token.expiresAt
    }));
  }

  /**
   * Blacklist access token (for logout before expiry)
   */
  async blacklistAccessToken(token, reason = 'logout') {
    const decoded = this.decodeToken(token);
    if (!decoded) return false;

    // In a production system with Redis:
    // await redis.setex(`blacklist:${token}`, TOKEN_BLACKLIST_TTL, reason);
    
    // For MongoDB implementation:
    const TokenBlacklist = require('../models/TokenBlacklist');
    const expiresAt = decoded.exp ? new Date(decoded.exp * 1000) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    
    await TokenBlacklist.create({
      token: crypto.createHash('sha256').update(token).digest('hex'),
      expiresAt,
      reason
    });

    return true;
  }

  /**
   * Check if access token is blacklisted
   */
  async isAccessTokenBlacklisted(token) {
    // In a production system with Redis:
    // const result = await redis.get(`blacklist:${token}`);
    // return result !== null;
    
    // For MongoDB implementation:
    const TokenBlacklist = require('../models/TokenBlacklist');
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const blacklisted = await TokenBlacklist.findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() }
    });

    return !!blacklisted;
  }
}

module.exports = new TokenService();