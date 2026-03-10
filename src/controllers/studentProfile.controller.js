const StudentProfile = require("../models/StudentProfile");
const User = require("../models/User");

// @desc    Check if student profile exists
// @route   GET /api/v1/student-profiles/check
// @access  Private/Student
exports.checkProfileExists = async (req, res) => {
  try {
    const studentId = req.user.id;

    const profile = await StudentProfile.findOne({ student: studentId });

    if (!profile) {
      return res.status(200).json({
        success: true,
        profileExists: false,
        message: "Profile does not exist. Please complete the profile form.",
      });
    }

    return res.status(200).json({
      success: true,
      profileExists: true,
      message: "Profile exists",
      profile: {
        id: profile._id,
        name: profile.name,
        phone: profile.phone,
        city: profile.city,
        state: profile.state,
        completedAt: profile.createdAt,
      },
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error checking profile",
      error: error.message,
    });
  }
};

// @desc    Get pre-fill data from User profile
// @route   GET /api/v1/student-profiles/pre-fill
// @access  Private/Student
exports.getPreFillData = async (req, res) => {
  try {
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Check if profile already exists
    const existingProfile = await StudentProfile.findOne({ student: user._id });

    return res.status(200).json({
      success: true,
      preFillData: {
        name: user.name,
        email: user.email,
        phone: user.phone || "",
        qualification: user.highestQualification || "",
        yearOfPassout: user.yearOfPassout || "",
      },
      profileExists: !!existingProfile,
      message: "Pre-fill data retrieved successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error retrieving pre-fill data",
      error: error.message,
    });
  }
};

// @desc    Submit student profile form (first-time submission)
// @route   POST /api/v1/student-profiles
// @access  Private/Student
exports.submitProfile = async (req, res) => {
  try {
    const {
      fathersName,
      birthDate,
      gender,
      alternatePhone,
      city,
      state,
      country,
      identificationType,
      aadharNumber,
      panNumber,
      termsAccepted,
      privacyAccepted,
    } = req.body;

    // Validation
    if (!fathersName || !birthDate || !gender || !city || !state) {
      return res.status(400).json({
        success: false,
        message:
          "Please provide all required fields: fathersName, birthDate, gender, city, state",
      });
    }

    if (!termsAccepted || !privacyAccepted) {
      return res.status(400).json({
        success: false,
        message: "You must accept terms and privacy policy",
      });
    }

    // At least one ID required
    if (!aadharNumber && !panNumber) {
      return res.status(400).json({
        success: false,
        message: "Please provide at least one identification (Aadhar or PAN)",
      });
    }

    // Validate Aadhar if provided
    if (aadharNumber && !/^\d{12}$/.test(aadharNumber)) {
      return res.status(400).json({
        success: false,
        message: "Aadhar number must be exactly 12 digits",
      });
    }

    // Validate PAN if provided
    if (panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(panNumber)) {
      return res.status(400).json({
        success: false,
        message: "PAN number must be in format AAAAA0000A (10 characters)",
      });
    }

    // Check if profile already exists
    const existingProfile = await StudentProfile.findOne({ student: req.user.id });

    if (existingProfile) {
      return res.status(400).json({
        success: false,
        message: "Profile already exists for this student. Use update endpoint instead.",
      });
    }

    // Get user data
    const user = await User.findById(req.user.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Create profile
    const profile = await StudentProfile.create({
      student: req.user.id,
      name: user.name,
      phone: user.phone,
      fathersName,
      birthDate,
      gender,
      qualification: user.highestQualification,
      alternatePhone,
      city,
      state,
      country: country || "India",
      identificationType,
      aadharNumber,
      panNumber,
      termsAccepted,
      termsAcceptedAt: termsAccepted ? Date.now() : null,
      privacyAccepted,
      privacyAcceptedAt: privacyAccepted ? Date.now() : null,
      profileStatus: "complete",
    });

    return res.status(201).json({
      success: true,
      message: "Profile submitted successfully",
      profile: {
        id: profile._id,
        name: profile.name,
        city: profile.city,
        state: profile.state,
        profileStatus: profile.profileStatus,
        submittedAt: profile.createdAt,
      },
    });
  } catch (error) {
    // Handle validation errors from mongoose
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error submitting profile",
      error: error.message,
    });
  }
};

// @desc    View student profile
// @route   GET /api/v1/student-profiles/:id
// @access  Private/Student (own) or Admin
exports.viewProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Check authorization - student can only view own, admin can view any
    if (req.user.role === "student" && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: "You can only view your own profile",
      });
    }

    const profile = await StudentProfile.findOne({ student: id }).populate(
      "student",
      "name email role",
    );

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile retrieved successfully",
      profile,
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error retrieving profile",
      error: error.message,
    });
  }
};

// @desc    Update student profile
// @route   PUT /api/v1/student-profiles/:id
// @access  Private/Student (own) or Admin
exports.updateProfile = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check authorization
    if (req.user.role === "student" && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: "You can only update your own profile",
      });
    }

    // Fields that cannot be updated
    const restrictedFields = ["student", "createdAt", "verifiedAt"];
    restrictedFields.forEach((field) => {
      delete updates[field];
    });

    // Validate Aadhar if provided
    if (updates.aadharNumber && !/^\d{12}$/.test(updates.aadharNumber)) {
      return res.status(400).json({
        success: false,
        message: "Aadhar number must be exactly 12 digits",
      });
    }

    // Validate PAN if provided
    if (updates.panNumber && !/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i.test(updates.panNumber)) {
      return res.status(400).json({
        success: false,
        message: "PAN number must be in format AAAAA0000A (10 characters)",
      });
    }

    // Validate alternate phone if provided
    if (updates.alternatePhone && !/^[6-9]\d{9}$/.test(updates.alternatePhone)) {
      return res.status(400).json({
        success: false,
        message: "Alternate phone must be a valid 10-digit Indian number",
      });
    }

    const profile = await StudentProfile.findOneAndUpdate({ student: id }, updates, {
      new: true,
      runValidators: true,
    });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      profile,
    });
  } catch (error) {
    // Handle validation errors
    if (error.name === "ValidationError") {
      const messages = Object.values(error.errors).map((err) => err.message);
      return res.status(400).json({
        success: false,
        message: "Validation error",
        errors: messages,
      });
    }

    return res.status(500).json({
      success: false,
      message: "Error updating profile",
      error: error.message,
    });
  }
};

// @desc    Delete student profile (admin only)
// @route   DELETE /api/v1/student-profiles/:id
// @access  Private/Admin
exports.deleteProfile = async (req, res) => {
  try {
    const { id } = req.params;

    // Check authorization
    if (!["admin", "superAdmin"].includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: "Only admins can delete profiles",
      });
    }

    const profile = await StudentProfile.findOneAndDelete({ student: id });

    if (!profile) {
      return res.status(404).json({
        success: false,
        message: "Profile not found",
      });
    }

    return res.status(200).json({
      success: true,
      message: "Profile deleted successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error deleting profile",
      error: error.message,
    });
  }
};
