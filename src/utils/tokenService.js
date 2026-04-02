const jwt = require('jsonwebtoken');
const crypto = require('crypto');

/**
 * generateAccessToken — short-lived JWT (default 15 min via JWT_ACCESS_EXPIRE).
 * Used in every API response as the bearer credential for protected routes.
 */
const generateAccessToken = (id, role) => {
  return jwt.sign(
    { id, role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRE || '15m' }
  );
};

/**
 * generateRefreshToken — returns a cryptographically random opaque hex string.
 * The CALLER must invoke user.createRefreshToken() to store the hash in the DB.
 * This function is a thin wrapper kept here for import consistency.
 */
const generateRefreshToken = () => {
  return crypto.randomBytes(40).toString('hex');
};

/**
 * verifyAccessToken — verifies a JWT access token. Throws on expiry / invalid sig.
 */
const verifyAccessToken = (token) => {
  return jwt.verify(token, process.env.JWT_SECRET);
};

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken };