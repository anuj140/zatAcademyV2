const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");
const User = require("../models/User");
const Course = require("../models/Course");
const { generateAccessToken } = require("../utils/tokenService");
const { sendPasswordResetEmail, sendWelcomeEmail, sendEmailOtp } = require("../utils/emailService");
const { sendSmsOtp, verifySmsOtp } = require("../utils/smsService");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// ─────────────────────────────────────────────────────────────────────────────
// Helper: set refresh token in httpOnly cookie
// ─────────────────────────────────────────────────────────────────────────────
const setTokenCookie = (res, token) => {
  const cookieOptions = {
    httpOnly: process.env.REFRESH_TOKEN_COOKIE_HTTPONLY !== "false", // default true
    secure: process.env.REFRESH_TOKEN_COOKIE_SECURE === "true" || process.env.NODE_ENV === "production",
    sameSite: process.env.REFRESH_TOKEN_COOKIE_SAMESITE || "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  };
  res.cookie(process.env.REFRESH_TOKEN_COOKIE_NAME || "refreshToken", token, cookieOptions);
};

// ─────────────────────────────────────────────────────────────────────────────
// Helper: verify a Google ID token and return its payload
// ─────────────────────────────────────────────────────────────────────────────
const verifyGoogleToken = async (idToken) => {
  const ticket = await googleClient.verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });
  return ticket.getPayload(); // { sub, email, name, picture, email_verified, ... }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Sign in / register with Google
// @route   POST /api/v1/auth/google/signin
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.googleSignIn = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required" });
    }

    let payload;
    try {
      payload = await verifyGoogleToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired Google token" });
    }

    const { sub: googleId, email, name, picture } = payload;

    // ── Look up by email ───────────────────────────────────────────────────
    let user = await User.findOne({ email: email.toLowerCase() }).select("+googleId");

    if (user) {
      // Existing user with same email
      if (!user.googleId) {
        // Local account — prompt the frontend to link accounts
        return res.status(409).json({
          success: false,
          needsLinking: true,
          message:
            "An account with this email already exists. Please log in with your password first, then link your Google account via POST /api/v1/auth/google/link.",
        });
      }
      // If user is inactive 
      // - return unauthorized status with message "Acccount is inactive"
      if (!user.isActive) {
        return res.status(401).json({ success: false, message: "Account is inactive" });
      }
      //5. Generate access token by passing userId and user role
      const accessToken = generateAccessToken(user._id, user.role);
      //
      const refreshToken = user.createRefreshToken();
      await user.save({ validateBeforeSave: false });

      setTokenCookie(res, refreshToken);

      return res.status(200).json({
        success: true,
        message: "Signed in with Google successfully",
        accessToken,
        user: {
          id: user._id,
          name: user.name,
          email: user.email,
          role: user.role,
          authProvider: user.authProvider,
          emailVerified: user.emailVerified,
          phoneVerified: user.phoneVerified,
          picture: user.picture,
        },
      });
    }

    // ── New user — create with Google provider ─────────────────────────────
    user = await User.create({
      name,
      email: email.toLowerCase(),
      googleId,
      authProvider: "google",
      picture,
      emailVerified: true,   // Google already verified the email
      phoneVerified: false,  // phone must be added & verified separately
      role: "student",
    });

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, refreshToken);

    return res.status(201).json({
      success: true,
      message: "Account created with Google. You're in read-only mode until you verify your phone number.",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
        picture: user.picture,
      },
    });
  } catch (error) {
    console.error("[googleSignIn] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Link a Google account to an existing local (email/password) account
// @route   POST /api/v1/auth/google/link
// @access  Private (user must be logged in with email+password first)
// ─────────────────────────────────────────────────────────────────────────────
exports.linkGoogle = async (req, res) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required" });
    }

    let payload;
    try {
      payload = await verifyGoogleToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired Google token" });
    }

    const { sub: googleId, email } = payload;

    // Ensure the Google account email matches the logged-in user's email
    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "The Google account email does not match your account email. Please use the Google account associated with this email.",
      });
    }

    // Check if this googleId is already linked to a DIFFERENT account
    const existingLink = await User.findOne({ googleId }).select("+googleId");
    if (existingLink && existingLink._id.toString() !== req.user._id.toString()) {
      return res.status(409).json({
        success: false,
        message: "This Google account is already linked to a different user.",
      });
    }

    const user = await User.findById(req.user._id).select("+googleId");

    if (user.googleId) {
      return res.status(400).json({
        success: false,
        message: "Your account already has a Google account linked.",
      });
    }

    user.googleId = googleId;
    user.authProvider = "google"; // 'google' means Google-linked; password still works
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Google account linked successfully. You can now sign in with either Google or your email & password.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        authProvider: user.authProvider,
      },
    });
  } catch (error) {
    console.error("[linkGoogle] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Helper: format Indian phone to E.164 for Twilio
const toE164 = (phone) => `+91${phone}`;

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Register a new user (student only) — sends OTP to email AND phone
// @route   POST /api/v1/auth/register
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.register = async (req, res) => {
  try {
    const {
      name,
      email,
      password,
      confirmPassword,
      phone,
      interestedCourse,
      yearOfPassout,
      highestQualification,
    } = req.body;

    // Validate required fields
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide name, email, password, and confirm password",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    if (password.length < 8) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 8 characters long",
      });
    }

    // Phone is mandatory at registration
    if (!phone || !/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({
        success: false,
        message: "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
      });
    }

    if (!yearOfPassout || yearOfPassout < 2012 || yearOfPassout > 2029) {
      return res.status(400).json({
        success: false,
        message: "Year of passout must be between 2012 and 2029",
      });
    }

    const validQualifications = [
      "12th",
      "diploma",
      "bachelor's degree",
      "master's degree",
      "phd",
    ];
    if (!highestQualification || !validQualifications.includes(highestQualification)) {
      return res.status(400).json({
        success: false,
        message: `Highest qualification must be one of: ${validQualifications.join(", ")}`,
      });
    }

    // Check if email already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ success: false, message: "User already exists with this email" });
    }

    // Check phone uniqueness
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "User already exists with this phone number" });
    }

    // Validate interested course if provided
    let courseToEnroll = interestedCourse || null;
    if (courseToEnroll) {
      const course = await Course.findById(interestedCourse);
      if (!course) {
        return res.status(404).json({ success: false, message: "Interested course not found" });
      }
    }

    // Create user in unverified state
    const user = await User.create({
      name,
      email,
      password,
      phone,
      interestedCourse: courseToEnroll,
      yearOfPassout,
      highestQualification,
      role: "student",
      emailVerified: false,
      phoneVerified: false,
    });

    // Load OTP fields (they are select: false)
    const userWithOtp = await User.findById(user._id).select(
      "+emailOtp +emailOtpExpires"
    );

    // Generate email OTP
    const emailOtp = userWithOtp.generateOtp("emailOtp", "emailOtpExpires");
    await userWithOtp.save({ validateBeforeSave: false });

    // Send OTPs (failures don't block registration response)
    try {
      await sendEmailOtp(user, emailOtp, user.email, "verify");
    } catch (err) {
      console.error("[register] Failed to send email OTP:", err.message);
    }
    try {
      await sendSmsOtp(toE164(phone));
    } catch (err) {
      console.error("[register] Failed to send SMS OTP via Twilio Verify:", err.message);
    }

    // Send welcome email
    try {
      await sendWelcomeEmail(user);
    } catch (err) {
      console.error("[register] Failed to send welcome email:", err.message);
    }

    res.status(201).json({
      success: true,
      message:
        "Registration successful! Please verify your email and mobile number using the OTPs sent to complete your account setup.",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: false,
        phoneVerified: false,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify email OTP (registration)
// @route   POST /api/v1/auth/verify-email
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyEmailOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    if (!email || !otp) {
      return res.status(400).json({ success: false, message: "Email and OTP are required" });
    }

    const user = await User.findOne({ email }).select("+emailOtp +emailOtpExpires");
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    if (user.emailVerified) {
      return res.status(400).json({ success: false, message: "Email is already verified" });
    }

    if (!user.verifyOtp(otp, "emailOtp", "emailOtpExpires")) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.emailVerified = true;
    user.emailOtp = undefined;
    user.emailOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: "Email verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify phone OTP (registration)
// @route   POST /api/v1/auth/verify-phone
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyPhoneOtp = async (req, res) => {
  try {
    const { phone, otp } = req.body;
    if (!phone || !otp) {
      return res.status(400).json({ success: false, message: "Phone and OTP are required" });
    }

    const user = await User.findOne({ phone });
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found with this phone number" });
    }

    if (user.phoneVerified) {
      return res.status(400).json({ success: false, message: "Phone is already verified" });
    }

    const isValid = await verifySmsOtp(toE164(phone), otp);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.phoneVerified = true;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({ success: true, message: "Mobile number verified successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Resend OTP (email or phone) for registration verification
// @route   POST /api/v1/auth/resend-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.resendOtp = async (req, res) => {
  try {
    const { email, phone, type } = req.body; // type: 'email' | 'phone'

    if (!type || !["email", "phone"].includes(type)) {
      return res.status(400).json({ success: false, message: "type must be 'email' or 'phone'" });
    }

    let user;
    if (type === "email") {
      if (!email) return res.status(400).json({ success: false, message: "Email is required" });
      user = await User.findOne({ email }).select("+emailOtp +emailOtpExpires");
      if (!user) return res.status(404).json({ success: false, message: "User not found" });
      if (user.emailVerified) {
        return res.status(400).json({ success: false, message: "Email is already verified" });
      }
      const otp = user.generateOtp("emailOtp", "emailOtpExpires");
      await user.save({ validateBeforeSave: false });
      await sendEmailOtp(user, otp, user.email, "verify");

    } else {
      if (!phone) return res.status(400).json({ success: false, message: "Phone is required" });
      user = await User.findOne({ phone });
      if (!user) return res.status(404).json({ success: false, message: "User not found with this phone number" });
      if (user.phoneVerified) {
        return res.status(400).json({ success: false, message: "Phone is already verified" });
      }
      await sendSmsOtp(toE164(phone));
    }

    res.status(200).json({ success: true, message: `OTP resent to your ${type}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Login user
// @route   POST /api/v1/auth/login
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, message: "Please provide email and password" });
    }

    const user = await User.findOne({ email }).select("+password");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid credentials or account is inactive",
      });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Invalid credentials" });
    }

    // Enforce verification before allowing login
    if (!user.emailVerified || !user.phoneVerified) {
      return res.status(403).json({
        success: false,
        errorCode: "ACCOUNT_NOT_VERIFIED",
        message: "Please verify your email and mobile number before logging in.",
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      });
    }

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Forgot password
// @route   POST /api/v1/auth/forgot-password
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found with this email" });
    }

    const resetToken = user.createPasswordResetToken();
    await user.save({ validateBeforeSave: false });

    try {
      await sendPasswordResetEmail(user, resetToken);
      res.status(200).json({ success: true, message: "Password reset email sent successfully" });
    } catch (error) {
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save({ validateBeforeSave: false });
      return res.status(500).json({ success: false, message: "Email could not be sent" });
    }
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Reset password via token
// @route   PUT /api/v1/auth/reset-password/:resetToken
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.resetPassword = async (req, res) => {
  try {
    const { resetToken } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password) {
      return res.status(400).json({ success: false, message: "New password is required" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }

    const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() },
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Token is invalid or has expired" });
    }

    user.password = password;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      accessToken,
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Get current logged-in user
// @route   GET /api/v1/auth/me
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.getMe = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-__v");
    res.status(200).json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update user name (email/phone changes require OTP verification)
// @route   PUT /api/v1/auth/update-details
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.updateDetails = async (req, res) => {
  try {
    const { name, email, phone } = req.body;

    const user = await User.findById(req.user.id).select(
      "+pendingEmail +pendingEmailOtp +pendingEmailOtpExpires +pendingPhone"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const messages = [];

    // --- Direct name update ---
    if (name && name !== user.name) {
      user.name = name;
    }

    // --- Email change: send OTP to new email ---
    if (email && email !== user.email) {
      // Check new email is not already taken
      const existing = await User.findOne({ email });
      if (existing) {
        return res.status(400).json({ success: false, message: "Email already in use by another account" });
      }

      user.pendingEmail = email.toLowerCase();
      const otp = user.generateOtp("pendingEmailOtp", "pendingEmailOtpExpires");
      messages.push(`OTP sent to ${email}. Call /verify-email-change to apply the new email.`);

      try {
        await sendEmailOtp(user, otp, email.toLowerCase(), "change");
      } catch (err) {
        console.error("[updateDetails] Failed to send email change OTP:", err.message);
      }
    }

    // --- Phone change: send OTP to new phone ---
    if (phone && phone !== user.phone) {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
        });
      }
      // Check new phone is not already taken
      const existing = await User.findOne({ phone });
      if (existing) {
        return res.status(400).json({ success: false, message: "Phone number already in use by another account" });
      }

      user.pendingPhone = phone;
      messages.push(`OTP sent to +91${phone}. Call /verify-phone-change to apply the new number.`);

      try {
        await sendSmsOtp(toE164(phone));
      } catch (err) {
        console.error("[updateDetails] Failed to send phone change OTP via Twilio Verify:", err.message);
      }
    }

    await user.save({ validateBeforeSave: false });

    const responseMessage =
      messages.length > 0
        ? messages.join(" ")
        : "Details updated successfully.";

    res.status(200).json({
      success: true,
      message: responseMessage,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        emailVerified: user.emailVerified,
        phoneVerified: user.phoneVerified,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify and apply new email after change
// @route   POST /api/v1/auth/verify-email-change
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyEmailChange = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP is required" });
    }

    const user = await User.findById(req.user.id).select(
      "+pendingEmail +pendingEmailOtp +pendingEmailOtpExpires"
    );

    if (!user || !user.pendingEmail) {
      return res.status(400).json({ success: false, message: "No pending email change found. Please request a change first." });
    }

    if (!user.verifyOtp(otp, "pendingEmailOtp", "pendingEmailOtpExpires")) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.email = user.pendingEmail;
    user.emailVerified = true;
    user.pendingEmail = undefined;
    user.pendingEmailOtp = undefined;
    user.pendingEmailOtpExpires = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Email updated and verified successfully",
      user: { id: user._id, name: user.name, email: user.email, emailVerified: user.emailVerified },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Verify and apply new phone after change
// @route   POST /api/v1/auth/verify-phone-change
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.verifyPhoneChange = async (req, res) => {
  try {
    const { otp } = req.body;
    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP is required" });
    }

    const user = await User.findById(req.user.id).select(
      "+pendingPhone"
    );

    if (!user || !user.pendingPhone) {
      return res.status(400).json({ success: false, message: "No pending phone change found. Please request a change first." });
    }

    const isValid = await verifySmsOtp(toE164(user.pendingPhone), otp);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    user.phone = user.pendingPhone;
    user.phoneVerified = true;
    user.pendingPhone = undefined;
    await user.save({ validateBeforeSave: false });

    res.status(200).json({
      success: true,
      message: "Mobile number updated and verified successfully",
      user: { id: user._id, name: user.name, phone: user.phone, phoneVerified: user.phoneVerified },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Update profile — phone (with OTP), qualification & year of passout
//          Designed for Google Sign-In users who land without these fields,
//          but works for ALL authenticated users.
//
//          Phone changes go through OTP verification:
//            1. Call PUT /api/v1/auth/update-profile  { phone }
//               → stores in pendingPhone, sends SMS OTP
//            2. Call POST /api/v1/auth/verify-phone-change  { otp }
//               → verifies OTP, moves pendingPhone → phone, phoneVerified = true
//
//          Education fields (highestQualification, yearOfPassout) are saved
//          immediately — no OTP required.
//
// @route   PUT /api/v1/auth/update-profile
// @access  Private  (whitelisted even for phoneVerified: false users)
// ─────────────────────────────────────────────────────────────────────────────
exports.updateProfile = async (req, res) => {
  try {
    const { name, phone, highestQualification, yearOfPassout } = req.body;

    const user = await User.findById(req.user.id).select(
      "+pendingPhone"
    );

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    const messages = [];

    // ── Name (direct update) ────────────────────────────────────────────────
    if (name && name !== user.name) {
      user.name = name;
      messages.push("Name updated.");
    }

    // ── Highest qualification (direct update, validated) ────────────────────
    if (highestQualification !== undefined) {
      const validQualifications = [
        "12th",
        "diploma",
        "bachelor's degree",
        "master's degree",
        "phd",
      ];
      if (!validQualifications.includes(highestQualification)) {
        return res.status(400).json({
          success: false,
          message: `Highest qualification must be one of: ${validQualifications.join(", ")}`,
        });
      }
      user.highestQualification = highestQualification;
      messages.push("Highest qualification updated.");
    }

    // ── Year of passout (direct update, validated) ──────────────────────────
    if (yearOfPassout !== undefined) {
      const year = Number(yearOfPassout);
      if (isNaN(year) || year < 2012 || year > 2029) {
        return res.status(400).json({
          success: false,
          message: "Year of passout must be between 2012 and 2029",
        });
      }
      user.yearOfPassout = year;
      messages.push("Year of passout updated.");
    }

    // ── Phone: first-time add or change (requires OTP verification) ─────────
    if (phone && phone !== user.phone) {
      if (!/^[6-9]\d{9}$/.test(phone)) {
        return res.status(400).json({
          success: false,
          message: "Please provide a valid 10-digit Indian phone number (starting with 6-9)",
        });
      }

      // Uniqueness check — ignore the current user's own number
      const existing = await User.findOne({ phone, _id: { $ne: user._id } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: "Phone number is already in use by another account",
        });
      }

      user.pendingPhone = phone;

      try {
        await sendSmsOtp(toE164(phone));
        messages.push(
          `OTP sent to +91${phone}. Please verify via POST /api/v1/auth/verify-phone-change.`
        );
      } catch (err) {
        console.error("[updateProfile] Failed to send phone OTP:", err.message);
        messages.push(
          `Phone saved as pending, but OTP could not be sent. Please retry via POST /api/v1/auth/resend-otp.`
        );
      }
    }

    await user.save({ validateBeforeSave: false });

    const responseMessage =
      messages.length > 0 ? messages.join(" ") : "No changes were made.";

    return res.status(200).json({
      success: true,
      message: responseMessage,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone || null,
        highestQualification: user.highestQualification || null,
        yearOfPassout: user.yearOfPassout || null,
        phoneVerified: user.phoneVerified,
        pendingPhone: phone && phone !== user.phone ? phone : undefined,
      },
    });
  } catch (error) {
    console.error("[updateProfile] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Change password (requires current password)
// @route   PUT /api/v1/auth/update-password
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.updatePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmNewPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmNewPassword) {
      return res.status(400).json({
        success: false,
        message: "Please provide currentPassword, newPassword, and confirmNewPassword",
      });
    }

    if (newPassword !== confirmNewPassword) {
      return res.status(400).json({ success: false, message: "New passwords do not match" });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: "New password must be at least 8 characters long",
      });
    }

    if (newPassword === currentPassword) {
      return res.status(400).json({
        success: false,
        message: "New password must be different from the current password",
      });
    }

    const user = await User.findById(req.user.id).select("+password");

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: "Current password is incorrect" });
    }

    user.password = newPassword;
    await user.save();

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, refreshToken);

    res.status(200).json({ success: true, message: "Password changed successfully", accessToken });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Validate invite token (Step 1 of Setup)
// @route   POST /api/v1/auth/setup/validate
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.validateSetupToken = async (req, res) => {
  try {
    const { token } = req.body;
    if (!token) {
      return res.status(400).json({ success: false, message: "Token is required" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      inviteToken: hashedToken,
      inviteTokenExpires: { $gt: Date.now() },
      isSetupComplete: false
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Token is invalid or has expired" });
    }

    res.status(200).json({
      success: true,
      user: {
        email: user.email,
        name: user.name,
        role: user.role
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Send OTP to phone during setup (Step 2 of Setup)
// @route   POST /api/v1/auth/setup/send-otp
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.sendSetupOtp = async (req, res) => {
  try {
    const { token, phone } = req.body;
    if (!token || !phone) {
      return res.status(400).json({ success: false, message: "Token and phone are required" });
    }

    if (!/^[6-9]\d{9}$/.test(phone)) {
      return res.status(400).json({ success: false, message: "Please provide a valid 10-digit Indian phone number" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      inviteToken: hashedToken,
      inviteTokenExpires: { $gt: Date.now() },
      isSetupComplete: false
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Token is invalid or has expired" });
    }

    // Check if phone already in use
    const existingPhone = await User.findOne({ phone });
    if (existingPhone) {
      return res.status(400).json({ success: false, message: "Phone number already in use by another account" });
    }

    try {
      await sendSmsOtp(toE164(phone));
    } catch (err) {
      console.error("[sendSetupOtp] Failed to send SMS OTP via Twilio Verify:", err.message);
    }

    res.status(200).json({ success: true, message: `OTP sent to +91${phone}` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Complete account setup (Step 3 of Setup)
// @route   POST /api/v1/auth/setup/complete
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.completeSetup = async (req, res) => {
  try {
    const { token, phone, otp, password, confirmPassword, specialization, contract } = req.body;

    if (!token || !phone || !otp || !password || !confirmPassword) {
      return res.status(400).json({ success: false, message: "Please provide token, phone, otp, password, and confirmPassword" });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: "Passwords do not match" });
    }
    
    if (password.length < 8) {
      return res.status(400).json({ success: false, message: "Password must be at least 8 characters long" });
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({
      inviteToken: hashedToken,
      inviteTokenExpires: { $gt: Date.now() },
      isSetupComplete: false
    });

    if (!user) {
      return res.status(400).json({ success: false, message: "Token is invalid or has expired" });
    }

    // Verify OTP
    const isValid = await verifySmsOtp(toE164(phone), otp);
    if (!isValid) {
      return res.status(400).json({ success: false, message: "Invalid or expired OTP" });
    }

    // Assign generic fields
    user.password = password;
    user.phone = phone;
    user.phoneVerified = true;
    user.emailVerified = true; // Email is considered verified since it was an invite link
    
    // Assign instructor-specific fields
    if (user.role === 'instructor') {
      user.specialization = specialization;
      user.contract = contract;
    }

    // Clear invite data, mark complete
    user.isSetupComplete = true;
    user.inviteToken = undefined;
    user.inviteTokenExpires = undefined;

    await user.save();

    const accessToken = generateAccessToken(user._id, user.role);
    const refreshToken = user.createRefreshToken();
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, refreshToken);

    res.status(200).json({
      success: true,
      message: "Account setup complete. You are now logged in.",
      accessToken,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role
      }
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Refresh the access token using a valid refresh token
// @route   POST /api/v1/auth/refresh-token
// @access  Public
// ─────────────────────────────────────────────────────────────────────────────
exports.refreshAccessToken = async (req, res) => {
  try {
    const refreshToken = req.cookies[process.env.REFRESH_TOKEN_COOKIE_NAME || "refreshToken"];

    if (!refreshToken) {
      return res.status(401).json({ success: false, message: "Refresh token is missing" });
    }

    // Hash the incoming token to compare with the stored hash
    const hashed = crypto.createHash("sha256").update(refreshToken).digest("hex");

    const user = await User.findOne({
      refreshToken: hashed,
      refreshTokenExpires: { $gt: Date.now() },
    }).select("+refreshToken +refreshTokenExpires");

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please log in again.",
      });
    }

    // ── Rotate: invalidate the old refresh token and issue a fresh pair ──────────
    const newAccessToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = user.createRefreshToken(); // overwrites hash + expiry
    await user.save({ validateBeforeSave: false });

    setTokenCookie(res, newRefreshToken);

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
    });
  } catch (error) {
    console.error("[refreshAccessToken] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// @desc    Logout — invalidate the stored refresh token
// @route   POST /api/v1/auth/logout
// @access  Private
// ─────────────────────────────────────────────────────────────────────────────
exports.logout = async (req, res) => {
  try {
    // Revoke the stored refresh token so the client can no longer rotate
    const user = await User.findById(req.user.id).select("+refreshToken +refreshTokenExpires");
    if (user) {
      user.refreshToken = undefined;
      user.refreshTokenExpires = undefined;
      await user.save({ validateBeforeSave: false });
    }

    // Destroy express-session for web (Google) users
    if (req.session) {
      req.session.destroy(() => {});
    }

    res.clearCookie(process.env.REFRESH_TOKEN_COOKIE_NAME || "refreshToken");

    res.status(200).json({ success: true, message: "Logged out successfully" });
  } catch (error) {
    console.error("[logout] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
