const jwt = require("jsonwebtoken");
const User = require("../models/User");

/**
 * protect – requires authentication via express-session (Google web login) OR JWT (mobile/API).
 * Session is checked first so that browser-based Google users work without a Bearer token.
 */
const protect = async (req, res, next) => {
  // ── 1. Session-based auth (Google Sign-In / web browser) ─────────────────
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select("-password");
      if (user && user.isActive) {
        req.user = user;
        return next();
      }
      // Stale session — destroy and fall through to JWT
      req.session.destroy(() => {});
    } catch (err) {
      console.error("❌ Session auth error:", err.message);
    }
  }

  // ── 2. JWT-based auth (mobile apps / API clients) ────────────────────────
  let token;
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) {
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = await User.findById(decoded.id).select("-password");

    if (!req.user || !req.user.isActive) {
      return res.status(401).json({
        success: false,
        message: "User not found or account is inactive",
      });
    }

    next();
  } catch (error) {
    console.log("❌ Token verification failed:", error.message);
    return res.status(401).json({
      success: false,
      message: "Not authorized to access this route",
    });
  }
};

/**
 * optionalProtect – attaches req.user if a valid session or JWT is present,
 * but never blocks the request. Use on public routes with role-dependent behaviour.
 */
const optionalProtect = async (req, res, next) => {
  // Session first
  if (req.session && req.session.userId) {
    try {
      const user = await User.findById(req.session.userId).select("-password");
      if (user?.isActive) {
        req.user = user;
        return next();
      }
    } catch { /* ignore */ }
  }

  // JWT fallback
  let token;
  if (req.headers.authorization?.startsWith("Bearer")) {
    token = req.headers.authorization.split(" ")[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    if (user?.isActive) req.user = user;
  } catch {
    // Invalid / expired token — treat as guest, don't block
  }

  next();
};

/**
 * requirePhoneVerifiedForWrites – blocks write operations (POST, PUT, PATCH, DELETE)
 * for authenticated users who have NOT yet verified their phone number.
 *
 * Google Sign-In users land here without a phone — they can read (GET) freely,
 * but any mutation is blocked until they add and verify a phone via:
 *   PUT  /api/v1/auth/update-details      → sends OTP
 *   POST /api/v1/auth/verify-phone-change → confirms OTP & sets phoneVerified = true
 */
const requirePhoneVerifiedForWrites = (req, res, next) => {
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];

  if (writeMethods.includes(req.method) && req.user && !req.user.phoneVerified) {
    return res.status(403).json({
      success: false,
      message:
        "Your account is in read-only mode. Please verify your phone number to perform this action.",
      hint: "Add your phone via PUT /api/v1/auth/update-details, then verify via POST /api/v1/auth/verify-phone-change.",
      phoneVerified: false,
    });
  }

  next();
};


};

module.exports = { protect, optionalProtect, requirePhoneVerifiedForWrites };
