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


```js
const requirePhoneVerifiedForWrites = (req, res, next) => {
  //1. List HTTP method (verbs) -- in array
  const writeMethods = ["POST", "PUT", "PATCH", "DELETE"];

  // Allow phone-setup endpoints through regardless of phoneVerified status
  if (PHONE_SETUP_WHITELIST.some((path) => req.path === path || req.originalUrl.startsWith(path))) {
    return next();
  }

  if (writeMethods.includes(req.method) && req.user && !req.user.phoneVerified) {
    return res.status(403).json({
      success: false,
      message:
        "Your account is in read-only mode. Please verify your phone number to perform this action.",
      hint: "Add your phone via PUT /api/v1/auth/update-profile, then verify via POST /api/v1/auth/verify-phone-change.",
      phoneVerified: false,
    });
  }

  next();
};
```

# updateProfile

```js
exports.updateProfile = async (req, res) => {
  try {
    //1. Extract name, phone, highest qualification, yearOfPassout from req.body
    const { name, phone, highestQualification, yearOfPassout } = req.body;
    //2. Find the login in user - retrive pendingPhone
    const user = await User.findById(req.user.id).select(
      "+pendingPhone"
    );
    //3. If there is no user found
    //  - return status (not found) with message 'User not found'
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    //4. Create empty array to store message
    const messages = [];

    // ── Name (direct update) ────────────────────────────────────────────────
    //4. If name provided and name is not equal to prev store name
    // - then update name with message 'Name updated.'
    if (name && name !== user.name) {
      user.name = name;
      messages.push("Name updated.");
    }

    // ── Highest qualification (direct update, validated) ────────────────────
    //5. If highestQualification is provided
    if (highestQualification !== undefined) {
      //5.1 Store valid qualification
      const validQualifications = [
        "12th",
        "diploma",
        "bachelor's degree",
        "master's degree",
        "phd",
      ];
      //5.2 If provided value for hightestQaulifcation is not valid - by checking against [valid qualification]
      // - return bad request status with message "Hight qualifcation must be one of .... these value"
      if (!validQualifications.includes(highestQualification)) {
        return res.status(400).json({
          success: false,
          message: `Highest qualification must be one of: ${validQualifications.join(", ")}`,
        });
      }
      //5.3 If value valid the store value in users highestQualification and push message 'Highest qualification updated'
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
```

# verifyPhoneChange

```js
exports.verifyPhoneChange = async (req, res) => {
  try {
    //1. Extract otp from req.body
    const { otp } = req.body;
    //2. If there is no otp
    //  - return status bad request with message 'OTP is required'
    if (!otp) {
      return res.status(400).json({ success: false, message: "OTP is required" });
    }
    //3. Find the login user with their pendingPhone field (value)
    const user = await User.findById(req.user.id).select(
      "+pendingPhone"
    );
    //4. If user not found or there is pending phone number
    // - return bad request with message 'No pending phone change found'
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
      user: { id: user._id, name: user.name, phone: user.phone },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```

```js
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
    //1. Extract idToken from req.boy
    const { idToken } = req.body;
    //2. If there is no token provided
    //  - return bad request status with message "Google Id token is required"
    if (!idToken) {
      return res.status(400).json({ success: false, message: "Google ID token is required" });
    }
    //3. Initialize the payload variable
    let payload;
    try {
      //3.1 If returns from verifyGoogleToken into payload 
      payload = await verifyGoogleToken(idToken);
    } catch (err) {
      //3.2 If there any error occur while verifyingGoogleToken return unauthorized status
      return res.status(401).json({ success: false, message: "Invalid or expired Google token" });
    }
    //4. Extract googleId, email, name, picture from payload
    const { sub: googleId, email, name, picture } = payload;

    // ── Look up by email ───────────────────────────────────────────────────
    //5. Find existing user with exact email and retrive googlId
    let user = await User.findOne({ email: email.toLowerCase() }).select("+googleId");
    //6. If user found
    if (user) {
      // Existing user with same email but there is no googleId
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

      const accessToken = generateAccessToken(user._id, user.role);
      const refreshToken = user.createRefreshToken();
      await user.save({ validateBeforeSave: false });

      return res.status(200).json({
        success: true,
        message: "Signed in with Google successfully",
        accessToken,
        refreshToken,
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

    return res.status(201).json({
      success: true,
      message: "Account created with Google. You're in read-only mode until you verify your phone number.",
      accessToken,
      refreshToken,
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

```js
exports.refreshAccessToken = async (req, res) => {
  try {
    //1. Extract refreshToken from req.body
    const { refreshToken } = req.body;
    //2. If there is no refreshToken
    //  - return bad-request status with message 'Refresh token is required'
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: "Refresh token is required" });
    }

    // Hash the incoming token to compare with the stored hash
    //3. Hash the incoming refreshToken
    const hashed = crypto.createHash("sha256").update(refreshToken).digest("hex");

    //4. Find the user with hased refreshToken and refreshToken expiry is greater than today
    // - retrive refreshToken and refreshTokenExpires
    const user = await User.findOne({
      refreshToken: hashed,
      refreshTokenExpires: { $gt: Date.now() },
    }).select("+refreshToken +refreshTokenExpires");

    //5. If there is no user or user is inActive
    // - return unauthorize status with message 'Invalid or expired refresh token'
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired refresh token. Please log in again.",
      });
    }

    // ── Rotate: invalidate the old refresh token and issue a fresh pair ──────────
    //6. Generate new access token by passing userId and user role
    const newAccessToken = generateAccessToken(user._id, user.role);
    const newRefreshToken = user.createRefreshToken(); // overwrites hash + expiry
    await user.save({ validateBeforeSave: false });

    return res.status(200).json({
      success: true,
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
    });
  } catch (error) {
    console.error("[refreshAccessToken] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
```
---
RefreshAccesToken

```js
exports.refreshAccessToken = async (req, res) => {
  try {
    // Try to get refresh token from multiple sources (priority order)
    let refreshToken = 
      req.cookies[process.env.REFRESH_TOKEN_COOKIE_NAME || "refreshToken"] || // HttpOnly cookie (same-origin)
      (req.headers.authorization?.startsWith("Bearer ") ? 
        req.headers.authorization.slice(7) : null) || // Authorization header (cross-origin)
      req.body?.refreshToken; // Request body (fallback)

    if (!refreshToken) {
      return res.status(401).json({ 
        success: false, 
        message: "Refresh token is required. Send it via cookie, Authorization header, or request body." 
      });
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
      refreshToken: newRefreshToken, // Include for cross-origin scenarios
    });
  } catch (error) {
    console.error("[refreshAccessToken] Error:", error.message);
    res.status(500).json({ success: false, message: error.message });
  }
};
```
---

```js
exports.downloadAssignmentFile = async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id);

    if (!assignment) {
      return res.status(404).json({ success: false, message: 'Assignment not found' });
    }

    // Must have a stored file to download
    if (!assignment.file || !assignment.file.url) {
      return res.status(400).json({
        success: false,
        message: 'This assignment has no downloadable file attached',
      });
    }

    const downloadData = buildDownloadResponse(assignment.file, assignment.title);

    return res.status(200).json({
      success: true,
      data: downloadData,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
```
---
Submit Assignment

```js
exports.submitAssignment = async (req, res) => {
  try {
    //1. Extract assignmentId from url - params
    const { assignmentId } = req.params;

    // Check if assignment exists and is open for submission
    //2. Find the assignment by it's id
    const assignment = await Assignment.findById(assignmentId);
    //3. If there is no assignment return 'Assignment not found'
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }
    //4. If assignment is not published or assignment is not active - return 'Assignment is not open for submission'
    if (!assignment.isPublished || !assignment.isActive) {
      return res.status(400).json({
        success: false,
        message: "Assignment is not open for submission",
      });
    }
    const now = new Date();
    //5. If today date is less than assignment startDate return - Assignment submission has not started yet
    if (now < assignment.startDate) {
      return res.status(400).json({
        success: false,
        message: "Assignment submission has not started yet",
      });
    }
    //6. If deadline is passed and there is no allowed late submission or late submission deadline is passed 
    // return - Assignment submission deadline is passed 
    if (
      now > assignment.deadline &&
      (!assignment.allowLateSubmission || now > assignment.lateSubmissionDeadline)
    ) {
      return res.status(400).json({
        success: false,
        message: "Assignment submission deadline has passed",
      });
    }

    // Check if student has already submitted
    //7. Find the existing submission with assignment id and login student id
    const existingSubmission = await Submission.findOne({
      assignment: assignmentId,
      student: req.user.id,
    });

    let submission;
    const isResubmission = !!existingSubmission;

    if (isResubmission) {
      // Check if resubmission is allowed
      if (existingSubmission.status === "graded" && !assignment.allowResubmission) {
        return res.status(400).json({
          success: false,
          message: "Resubmission is not allowed after grading",
        });
      }

      // Update existing submission
      existingSubmission.textContent =
        req.body.textContent || existingSubmission.textContent;
      existingSubmission.notes = req.body.notes || existingSubmission.notes;
      existingSubmission.githubRepo =
        req.body.githubRepo || existingSubmission.githubRepo;
      existingSubmission.deploymentUrl =
        req.body.deploymentUrl || existingSubmission.deploymentUrl;
      existingSubmission.submittedAt = now;
      existingSubmission.version += 1;
      existingSubmission.status = "submitted";
      existingSubmission.isGraded = false;
      existingSubmission.gradedAt = null;
      existingSubmission.gradedBy = null;
      existingSubmission.score = null;
      existingSubmission.marksObtained = null;
      existingSubmission.percentage = null;
      existingSubmission.grade = null;
      existingSubmission.feedback = null;
      existingSubmission.rubricScores = [];
      existingSubmission.resubmissionCount += 1;
      existingSubmission.previousSubmission = existingSubmission._id;

      // Handle file uploads
      if (req.files && req.files.length > 0) {
        // Delete old files from Cloudinary
        if (existingSubmission.files && existingSubmission.files.length > 0) {
          for (const file of existingSubmission.files) {
            if (file.public_id) {
              await cloudinary.uploader.destroy(file.public_id);
            }
          }
        }

        existingSubmission.files = req.files.map((file) => ({
          url: file.path,
          public_id: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: now,
        }));
      }

      submission = await existingSubmission.save();
    } else {
      // Create new submission
      const submissionData = {
        assignment: assignmentId,
        batch: assignment.batch,
        course: assignment.course,
        student: req.user.id,
        textContent: req.body.textContent,
        notes: req.body.notes,
        githubRepo: req.body.githubRepo,
        deploymentUrl: req.body.deploymentUrl,
        submittedAt: now,
        status: "submitted",
      };

      // Determine submission type
      if (req.body.textContent && (!req.files || req.files.length === 0)) {
        submissionData.submissionType = "text";
      } else if (!req.body.textContent && req.files && req.files.length > 0) {
        submissionData.submissionType = "file";
      } else if (req.body.textContent && req.files && req.files.length > 0) {
        submissionData.submissionType = "both";
      } else if (req.body.githubRepo) {
        submissionData.submissionType = "github";
      }

      // Handle file uploads
      if (req.files && req.files.length > 0) {
        submissionData.files = req.files.map((file) => ({
          url: file.path,
          public_id: file.filename,
          originalName: file.originalname,
          size: file.size,
          mimeType: file.mimetype,
          uploadedAt: now,
        }));
      }

      submission = await Submission.create(submissionData);
    }

    res.status(isResubmission ? 200 : 201).json({
      success: true,
      message: isResubmission
        ? "Assignment resubmitted successfully"
        : "Assignment submitted successfully",
      data: submission,
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```


```js
exports.getBatchMaterials = async (req, res) => {
  //1. Extract batchId from url
  try {
    const { batchId } = req.params;
    //2. Extract week, materialType, contentType, isPublished = true, limit, page
    const {
      week,
      materialType,
      contentType,
      isPublished = true,
      limit = 20,
      page = 1,
    } = req.query;

    // Build query
    //3. Store bachId as batch in query obj
    const query = { batch: batchId };

    // Filter by week if provided
    //4. If week provided
    //  - create week property and parse int 
    if (week) {
      query.week = parseInt(week);
    }

    // Filter by material type
    //5. If materialType provided
    //  - create materialType with provided value (for material type)
    if (materialType) {
      query.materialType = materialType;
    }

    // Filter by content type
    //6. If contentType provided
    //  - create contentType prop and set with provided value
    if (contentType) {
      query.contentType = contentType;
    }

    // For students, only show published materials
    //7. If role is student role 
    //  - create isPublised prop and set to true
    if (req.user.role === "student") {
      query.isPublished = true;

      // Check availability dates
      const now = new Date();
      query.$or = [
        {
          $and: [{ availableFrom: { $lte: now } }, { availableUntil: { $gte: now } }],
        },
        {
          $and: [
            { availableFrom: { $exists: false } },
            { availableUntil: { $exists: false } },
          ],
        },
        {
          $and: [
            { availableFrom: { $lte: now } },
            { availableUntil: { $exists: false } },
          ],
        },
        {
          $and: [
            { availableFrom: { $exists: false } },
            { availableUntil: { $gte: now } },
          ],
        },
      ];
    } else {
      // Instructor/admin can see all, filtered by isPublished if specified
      if (isPublished !== undefined) {
        query.isPublished = isPublished === "true";
      }
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute query with sorting
    const materials = await LearningMaterial.find(query)
      .sort({ week: 1, moduleOrder: 1, createdAt: 1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("createdBy", "name");

    const total = await LearningMaterial.countDocuments(query);

    // Get week distribution for navigation
    const weekDistribution = await LearningMaterial.aggregate([
      { $match: query },
      {
        $group: {
          _id: "$week",
          count: { $sum: 1 },
          completed: { $sum: { $cond: [{ $eq: ["$materialType", "quiz"] }, 1, 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      success: true,
      count: materials.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      weekDistribution,
      data: materials,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```
```js
exports.getAssignmentSubmissions = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, graded, late, limit = 20, page = 1 } = req.query;

    const assignment = await Assignment.findById(id);
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Check authorization
    const batch = await Batch.findById(assignment.batch);
    if (
      batch.instructor.toString() !== req.user.id &&
      req.user.role !== "admin" &&
      req.user.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view submissions for this assignment",
      });
    }

    // Build query
    const query = { assignment: id };

    if (status) {
      query.status = status;
    }

    if (graded === "true") {
      query.isGraded = true;
    } else if (graded === "false") {
      query.isGraded = false;
    }

    if (late === "true") {
      query.isLate = true;
    } else if (late === "false") {
      query.isLate = false;
    }

    // Pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const submissions = await Submission.find(query)
      .sort({ submittedAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate("student", "name email")
      .populate("gradedBy", "name");

    const total = await Submission.countDocuments(query);

    // Enhance submissions with file metadata
    const enhancedSubmissions = submissions.map(submission => {
      const submissionObj = submission.toObject();
      
      // Add file metadata with indices and URLs
      submissionObj.filesMetadata = (submission.files || []).map((file, index) => ({
        index,
        originalName: file.originalName,
        size: file.size,
        mimeType: file.mimeType,
        uploadedAt: file.uploadedAt || submission.submittedAt,
        downloadUrl: `/api/v1/submissions/${submission._id}/files/${index}/download`,
        previewUrl: `/api/v1/submissions/${submission._id}/files/${index}/preview`,
      }));
      submissionObj.filesCount = submission.files ? submission.files.length : 0;
      
      return submissionObj;
    });

    // Get statistics
    const stats = await calculateSubmissionStats(id);

    res.status(200).json({
      success: true,
      count: enhancedSubmissions.length,
      total,
      pages: Math.ceil(total / limit),
      currentPage: parseInt(page),
      stats,
      data: enhancedSubmissions,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
```

```js
xports.getAssignmentSubmissionsAnalytics = async (req, res) => {
  try {
    //1. Extract assignmentId from url 
    const { assignmentId } = req.params;
    //2. Set the default value for limit and page
    const { limit = 100, page = 1 } = req.query;

    // Get assignment
    //3. Find the assignment by Id
    //   -return batch name and instructor and course title
    const assignment = await Assignment.findById(assignmentId)
      .populate("batch", "name instructor")
      .populate("course", "title");
    //4. If there is no assignment - return 'Assignment not found'
    if (!assignment) {
      return res.status(404).json({
        success: false,
        message: "Assignment not found",
      });
    }

    // Authorization: Only instructor of the batch, admin, or superAdmin
    //5. Check if instructor (assigned to batch) is equal to login user or login user role is admin or superAdmin 
    const isInstructor =
      assignment.batch.instructor.toString() === req.user.id ||
      req.user.role === "admin" ||
      req.user.role === "superAdmin";
    //6. If instructor is not authorize or login user role is not instructor -- return message 'Not authorized ot view this assignment submission
    if (!isInstructor && req.user.role !== "instructor") {
      return res.status(403).json({
        success: false,
        message: "Not authorized to view this assignment submissions",
      });
    }

    // Get all enrolled students in the batch
    //7. Find the enrollment by assignment batch id and enrollmentStatus to true
    const Enrollment = require("../models/Enrollment");
    const enrolledStudents = await Enrollment.find({
      batch: assignment.batch._id,
      enrollmentStatus: "active",
    })
      .select("student")
      .populate("student", "id name email phone");
    //8. Collect enrollement student ids
    const studentIds = enrolledStudents.map((e) => e.student._id.toString());
    //9. Count the total enrolled student
    const totalStudents = studentIds.length;

    // Get all submissions for this assignment
    //10. Find the submission by assignment Id
    const submissions = await Submission.find({
      assignment: assignmentId,
    })
      .select(
        "student submittedAt isGraded marksObtained percentage status isLate submissionType version files"
      )
      .populate("student", "id name email phone");

    // Build submission map for quick lookup
    //11. Create key by student id by it's submission
    const submissionMap = {};
    submissions.forEach((sub) => {
      submissionMap[sub.student._id.toString()] = sub;
    });

    // Identify submitted vs pending
    const submitted = [];
    const pending = [];
    //12. Find the 
    enrolledStudents.forEach((enrollment) => {
      const studentId = enrollment.student._id.toString();
      const submission = submissionMap[studentId];

      if (submission) {
        submitted.push({
          studentId: enrollment.student._id,
          name: enrollment.student.name,
          email: enrollment.student.email,
          phone: enrollment.student.phone,
          submittedAt: submission.submittedAt,
          status: submission.status,
          isGraded: submission.isGraded,
          marksObtained: submission.marksObtained,
          percentage: submission.percentage,
          isLate: submission.isLate,
          submissionType: submission.submissionType,
          version: submission.version,
          filesCount: submission.files ? submission.files.length : 0,
          submissionId: submission._id,
        });
      } else {
        pending.push({
          studentId: enrollment.student._id,
          name: enrollment.student.name,
          email: enrollment.student.email,
          phone: enrollment.student.phone,
        });
      }
    });

    // Calculate statistics
    const submittedCount = submitted.length;
    const pendingCount = pending.length;
    const gradedSubmissions = submitted.filter((s) => s.isGraded);
    const gradedCount = gradedSubmissions.length;
    const ungradedCount = submittedCount - gradedCount;
    const lateSubmissions = submitted.filter((s) => s.isLate);
    const lateCount = lateSubmissions.length;

    // Calculate scores
    const scores = gradedSubmissions.map((s) => s.marksObtained || 0);
    const averageScore =
      scores.length > 0
        ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 100) /
          100
        : 0;
    const highestScore =
      scores.length > 0 ? Math.max(...scores) : 0;
    const lowestScore =
      scores.length > 0 ? Math.min(...scores) : 0;

    // Calculate percentages
    const submissionRate =
      totalStudents > 0
        ? Math.round((submittedCount / totalStudents) * 100)
        : 0;
    const gradingRate =
      submittedCount > 0
        ? Math.round((gradedCount / submittedCount) * 100)
        : 0;
    const lateRate =
      submittedCount > 0
        ? Math.round((lateCount / submittedCount) * 100)
        : 0;

    // Pagination for submitted list
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const paginatedSubmitted = submitted.slice(skip, skip + parseInt(limit));

    res.status(200).json({
      success: true,
      data: {
        assignment: {
          _id: assignment._id,
          title: assignment.title,
          description: assignment.description,
          maxMarks: assignment.maxMarks,
          deadline: assignment.deadline,
          passingMarks: assignment.passingMarks,
        },
        batch: {
          _id: assignment.batch._id,
          name: assignment.batch.name,
        },
        course: {
          _id: assignment.course._id,
          title: assignment.course.title,
        },
        analytics: {
          totalStudents,
          submittedCount,
          pendingCount,
          gradedCount,
          ungradedCount,
          lateCount,
          submissionRate: `${submissionRate}%`,
          gradingRate: `${gradingRate}%`,
          lateRate: `${lateRate}%`,
          averageScore,
          highestScore,
          lowestScore,
        },
        submissions: {
          submitted: paginatedSubmitted,
          submittedTotal: submittedCount,
          pages: Math.ceil(submittedCount / parseInt(limit)),
          currentPage: parseInt(page),
        },
        pending: {
          students: pending,
          total: pendingCount,
        },
      },
    });
  } catch (error) {
    console.error("Error in getAssignmentSubmissionsAnalytics:", error);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
```