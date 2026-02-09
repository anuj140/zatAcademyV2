const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const connectDB = require('./config/database');
const cron = require('node-cron');
const cookieParser = require('cookie-parser'); // NEW
const { cleanupTokens } = require('./utils/tokenCleanup'); // NEW

// Import route files
const authRoutes = require('./routes/auth.routes');
const userRoutes = require('./routes/user.routes');
const courseRoutes = require('./routes/course.routes');
const batchRoutes = require('./routes/batch.routes');
const enrollmentRoutes = require('./routes/enrollment.routes');
const liveSessionRoutes = require('./routes/liveSession.routes');
const sessionMaterialRoutes = require('./routes/liveSessionMaterial.routes');
const learningMaterialRoutes = require('./routes/learningMaterial.routes');
const assignmentRoutes = require('./routes/assignment.routes');
const submissionRoutes = require('./routes/submission.routes');
const gradeRoutes = require('./routes/grade.routes');
const doubtRoutes = require('./routes/doubt.routes');
const progressRoutes = require('./routes/progress.routes');
const analyticsRoutes = require('./routes/analytics.routes');

const app = express();

// Connect to database
connectDB();

// Cookie parser middleware
app.use(cookieParser());

// Security middleware
// app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://localhost:3001'],
  credentials: process.env.CORS_CREDENTIALS === 'true' || true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api', limiter);

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Data sanitization against NoSQL query injection
// app.use(mongoSanitize());

// Data sanitization against XSS
// app.use(xss());

// Mount routers
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/courses', courseRoutes);
app.use('/api/v1/batches', batchRoutes);
app.use('/api/v1/enrollments', enrollmentRoutes);
app.use('/api/v1/live-sessions', liveSessionRoutes);
app.use('/api/v1/session-materials', sessionMaterialRoutes);
app.use('/api/v1/learning-materials', learningMaterialRoutes);
app.use('/api/v1/assignments', assignmentRoutes);
app.use('/api/v1/submissions', submissionRoutes);
app.use('/api/v1/grades', gradeRoutes);
app.use('/api/v1/doubts', doubtRoutes);
app.use('/api/v1/progress', progressRoutes);
app.use('/api/v1/analytics', analyticsRoutes);

// Health check route
app.get('/health', (req, res) => {
  res.status(200).json({
    success: true,
    message: 'Server is running',
    timestamp: new Date().toISOString(),
    phase: 4,
    auth: 'access-refresh-tokens'
  });
});

// 404 handler
app.use('/*splat', (req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.originalUrl} not found`
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  res.status(err.statusCode || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// Scheduled jobs
if (process.env.NODE_ENV === 'production') {
  // Run token cleanup every hour
  cron.schedule('0 * * * *', async () => {
    try {
      await cleanupTokens();
    } catch (error) {
      console.error('Error in token cleanup job:', error);
    }
  });
  
  // Run analytics jobs daily at midnight
  cron.schedule('0 0 * * *', async () => {
    try {
      console.log('Running scheduled analytics jobs...');
      
      // Auto-close old doubts
      const Doubt = require('./models/Doubt');
      await Doubt.autoCloseOldDoubts(30);
      
      console.log('Scheduled jobs completed');
    } catch (error) {
      console.error('Error in scheduled jobs:', error);
    }
  });
}

module.exports = app;