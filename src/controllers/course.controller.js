const Course = require("../models/Course");
const cloudinary = require("../config/cloudinary");

// @desc    Create new course
// @route   POST /api/v1/courses
// @access  Private/Admin
exports.createCourse = async (req, res) => {
  try {
    const courseData = {
      ...req.body,
      createdBy: req.user.id,
    };

    // Handle thumbnail upload
    if (req.file) {
      courseData.thumbnail = {
        url: req.file.path,
        public_id: req.file.filename,
      };
    }

    const course = await Course.create(courseData);

    res.status(201).json({
      success: true,
      data: course,
    });
  } catch (error) {
    console.log(error);
    console.log("error stack: ", error.stack);
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get all courses (with filtering and pagination)
// @route   GET /api/v1/courses
// @access  Public (published) / Private (all for admin)
exports.getCourses = async (req, res) => {
  try {
    // Copy req.query
    const reqQuery = { ...req.query };

    // Fields to exclude
    const removeFields = ["select", "sort", "page", "limit", "search"];
    removeFields.forEach((param) => delete reqQuery[param]);

    let query;

    // For students, only show published courses
    if (req.user?.role === "student" || !req.user) {
      reqQuery.isPublished = true;
    }

    // Search functionality
    if (req.query.search) {
      query = Course.find({
        $text: { $search: req.query.search },
        ...reqQuery,
      });
    } else {
      query = Course.find(reqQuery);
    }

    // Select fields
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      query = query.select(fields);
    }

    // Sort
    if (req.query.sort) {
      const sortBy = req.query.sort.split(",").join(" ");
      query = query.sort(sortBy);
    } else {
      query = query.sort("-createdAt");
    }

    // Pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const startIndex = (page - 1) * limit;
    const endIndex = page * limit;
    const total = await Course.countDocuments(query._conditions);

    query = query.skip(startIndex).limit(limit);

    // Execute query
    const courses = await query;

    // Pagination result
    const pagination = {};

    if (endIndex < total) {
      pagination.next = {
        page: page + 1,
        limit,
      };
    }

    if (startIndex > 0) {
      pagination.prev = {
        page: page - 1,
        limit,
      };
    }

    res.status(200).json({
      success: true,
      count: courses.length,
      pagination,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get single course
// @route   GET /api/v1/courses/:id
// @access  Public (if published) / Private (admin)
exports.getCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Check if student can access unpublished course
    if (
      !course.isPublished &&
      req.user?.role !== "admin" &&
      req.user?.role !== "superAdmin"
    ) {
      return res.status(403).json({
        success: false,
        message: "Not authorized to access this course",
      });
    }

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Update course
// @route   PUT /api/v1/courses/:id
// @access  Private/Admin
exports.updateCourse = async (req, res) => {
  try {
    let course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Handle thumbnail update
    if (req.file) {
      // Delete old thumbnail from Cloudinary
      if (course.thumbnail && course.thumbnail.public_id) {
        await cloudinary.uploader.destroy(course.thumbnail.public_id);
      }

      req.body.thumbnail = {
        url: req.file.path,
        public_id: req.file.filename,
      };
    }

    course = await Course.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true,
    });

    res.status(200).json({
      success: true,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Delete course
// @route   DELETE /api/v1/courses/:id
// @access  Private/Admin
exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    // Delete thumbnail from Cloudinary
    if (course.thumbnail && course.thumbnail.public_id) {
      await cloudinary.uploader.destroy(course.thumbnail.public_id);
    }

    await course.deleteOne();

    res.status(200).json({
      success: true,
      message: "Course deleted successfully",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Publish/unpublish course
// @route   PUT /api/v1/courses/:id/publish
// @access  Private/Admin
exports.togglePublish = async (req, res) => {
  try {
    const course = await Course.findById(req.params.id);

    if (!course) {
      return res.status(404).json({
        success: false,
        message: "Course not found",
      });
    }

    course.isPublished = !course.isPublished;
    await course.save();

    res.status(200).json({
      success: true,
      message: `Course ${course.isPublished ? "published" : "unpublished"} successfully`,
      data: course,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// @desc    Get course stats
// @route   GET /api/v1/courses/stats
// @access  Private/Admin
exports.getCourseStats = async (req, res) => {
  try {
    const stats = await Course.aggregate([
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalFee: { $sum: "$fee" },
          avgFee: { $avg: "$fee" },
        },
      },
      {
        $sort: { count: -1 },
      },
    ]);

    const publishedCount = await Course.countDocuments({ isPublished: true });
    const unpublishedCount = await Course.countDocuments({ isPublished: false });

    res.status(200).json({
      success: true,
      data: {
        stats,
        publishedCount,
        unpublishedCount,
        total: publishedCount + unpublishedCount,
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
