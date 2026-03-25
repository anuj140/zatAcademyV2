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
const ADMIN_ROLES = ["admin", "superAdmin"];

exports.getCourses = async (req, res) => {
  try {
    const isAdmin = req.user && ADMIN_ROLES.includes(req.user.role);

    // ── 1. Base filter ────────────────────────────────────────────────────────
    const filter = {};

    // Non-admins (students + guests) can only ever see published courses
    if (!isAdmin) {
      //  - create new property with isPulished set to true
      filter.isPublished = true;
      // - if no value provide for isPublished
    } else if (req.query.isPublished !== undefined) {
      // Admins may explicitly filter: ?isPublished=false  or  ?isPublished=true
      filter.isPublished = req.query.isPublished === "true";
    }
    // If admin sends no isPublished param → return ALL courses (both states)

    // ── 2. Category filter (?category=web-development) ───────────────────────
    if (req.query.category) {
      filter.category = req.query.category;
    }

    // ── 3. Text search (?search=react) ───────────────────────────────────────
    let query;
    if (req.query.search) {
      query = Course.find({ $text: { $search: req.query.search }, ...filter });
    } else {
      query = Course.find(filter);
    }

    // ── 4. Field selection (?select=title,fee,category) ──────────────────────
    if (req.query.select) {
      const fields = req.query.select.split(",").join(" ");
      query = query.select(fields);
    }

    // ── 5. Sorting (?sort=fee or ?sort=-createdAt or ?sort=fee,-createdAt) ────
    const ALLOWED_SORT_FIELDS = isAdmin
      ? ["fee", "-fee", "createdAt", "-createdAt", "title", "-title"]
      : ["fee", "-fee", "createdAt", "-createdAt"]; // guests/students: safe subset
    //6. If sort query provided
    if (req.query.sort) {
      //6.1 Split the value by comma
      const requested = req.query.sort.split(",");
      //6.2 Only include fields predefined in allow_sort_fields
      const safe = requested.filter((f) => ALLOWED_SORT_FIELDS.includes(f));
      //6.3 If safe (arr) length is greater than zero then join the all value by space, otherwise sort createdAt(by descending order)
      query = query.sort(safe.length ? safe.join(" ") : "-createdAt");
    } else {
      //Else if sort query is not provided
      //  - then sort createdAt by descending order
      query = query.sort("-createdAt");
    }

    // ── 6. Pagination ─────────────────────────────────────────────────────────
    //7. If page is provided - then whatever value provided otherwise 1 (if page value provided in negative then replace with positive 1)
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    //8. If limit is provided - then whatever value provided (but cap at 100), otherwise 10
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 100); // cap at 100
    const skip = (page - 1) * limit;

    const total = await Course.countDocuments(filter);
    query = query.skip(skip).limit(limit);

    // ── 7. Execute ────────────────────────────────────────────────────────────
    const courses = await query;

    const pagination = {};
    if (skip + limit < total) pagination.next = { page: page + 1, limit };
    if (skip > 0) pagination.prev = { page: page - 1, limit };

    res.status(200).json({
      success: true,
      count: courses.length,
      total,
      pagination,
      data: courses,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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
