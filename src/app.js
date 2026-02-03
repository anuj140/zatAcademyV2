const express = require("express");
const cors = require("cors");
// const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
// const mongoSanitize = require("express-mongo-sanitize");
// const xss = require("xss-clean");
const connectDB = require("./config/database");

// Route files
const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/user.routes");
const courseRoutes = require("./routes/course.routes");
const batchRoutes = require("./routes/batch.routes");
const enrollmentRoutes = require("./routes/enrollment.routes");
const liveSessionRoutes = require("./routes/liveSession.routes");
const sessionMaterialRoutes = require("./routes/liveSessionMaterial.routes");
const learningMaterialRoutes = require("./routes/learningMaterial.routes"); // NEW
const assignmentRoutes = require("./routes/assignment.routes"); // NEW
const submissionRoutes = require("./routes/submission.routes"); // NEW
const gradeRoutes = require("./routes/grade.routes"); // NEW

const app = express();

// Connect to database
connectDB();

// Security middleware
// app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use("/api", limiter);

// Body parser
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Data sanitization against NoSQL query injection
// app.use(mongoSanitize());

// Data sanitization against XSS
// app.use(xss());

// Enable CORS
app.use(cors());

// Mount routers
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/users", userRoutes);
app.use("/api/v1/courses", courseRoutes);
app.use("/api/v1/batches", batchRoutes);
app.use("/api/v1/enrollments", enrollmentRoutes);
app.use("/api/v1/live-sessions", liveSessionRoutes);
app.use("/api/v1/session-materials", sessionMaterialRoutes);
app.use("/api/v1/learning-materials", learningMaterialRoutes); // NEW
app.use("/api/v1/assignments", assignmentRoutes); // NEW
app.use("/api/v1/submissions", submissionRoutes); // NEW
app.use("/api/v1/grades", gradeRoutes); // NEW

// Health check route
app.get("/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is running",
    timestamp: new Date().toISOString(),
    phase: 3,
  });
});

// 404 handler
app.use("/*splat", (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`,
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || "Internal Server Error",
    stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
  });
});

module.exports = app;
