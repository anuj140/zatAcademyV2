const tokenService = require('./tokenService');
const TokenBlacklist = require('../models/TokenBlacklist');

/**
 * Clean up expired tokens from database
 */
const cleanupTokens = async () => {
  try {
    console.log('Starting token cleanup...');
    
    // Clean up expired refresh tokens
    const refreshResult = await tokenService.cleanupExpiredTokens();
    console.log(`Cleaned up ${refreshResult.cleaned} expired refresh tokens`);
    
    // Clean up expired blacklisted tokens
    const blacklistResult = await TokenBlacklist.deleteMany({
      expiresAt: { $lt: new Date() }
    });
    console.log(`Cleaned up ${blacklistResult.deletedCount} expired blacklisted tokens`);
    
    // Clean up users with expired lock
    const User = require('../models/User');
    const userResult = await User.updateMany(
      { 
        lockUntil: { $lt: new Date(), $exists: true },
        loginAttempts: { $gte: 5 }
      },
      { 
        $set: { loginAttempts: 0, lockUntil: null }
      }
    );
    console.log(`Reset lock for ${userResult.modifiedCount} users`);
    
    console.log('Token cleanup completed');
  } catch (error) {
    console.error('Error during token cleanup:', error);
  }
};

module.exports = { cleanupTokens };