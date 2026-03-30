```js
const verifyGoogleToken = async (idToken) => {
    //1. 
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
    //1. Extract Id token from req.body
    const { idToken } = req.body;
    //2. If there is not token return status bad-request with message "Google Id token is required"
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

      // Google-linked account — update googleId if somehow missing (edge case)
      if (!user.googleId) {
        user.googleId = googleId;
        await user.save({ validateBeforeSave: false });
      }

      if (!user.isActive) {
        return res.status(401).json({ success: false, message: "Account is inactive" });
      }

      const token = generateToken(user._id, user.role);
      return res.status(200).json({
        success: true,
        message: "Signed in with Google successfully",
        token,
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

    const token = generateToken(user._id, user.role);
    return res.status(201).json({
      success: true,
      message: "Account created with Google. You're in read-only mode until you verify your phone number.",
      token,
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
```
# linkGoogle

```js
exports.linkGoogle = async (req, res) => {
  try {
    //1. Extract idToken from req.body
    const { idToken } = req.body;
    //2. If there is no token return success false with message "Google Id token is required"
    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required" });
    }
    //3. Define payload variable
    let payload;
    try {
        //3.1 save payload after verifying token
      payload = await verifyGoogleToken(idToken);
    } catch (err) {
      return res.status(401).json({ success: false, message: "Invalid or expired Google token" });
    }
    //4. Extract googleId and email from payload
    const { sub: googleId, email } = payload;

    // Ensure the Google account email matches the logged-in user's email
    //5. If provided email address is not equal to user saved email address
    // - then throw error: "The google account email does not match your account email."
    if (email.toLowerCase() !== req.user.email.toLowerCase()) {
      return res.status(400).json({
        success: false,
        message: "The Google account email does not match your account email. Please use the Google account associated with this email.",
      });
    }

    // Check if this googleId is already linked to a DIFFERENT account
    //6. If the user with googleId (select gooleId)
    const existingLink = await User.findOne({ googleId }).select("+googleId");
    //7. If user exist (with given googleId) and existing user id and sign in google id does not match
    //  - return success false, with message 'The google account already link to differnt account'
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
```