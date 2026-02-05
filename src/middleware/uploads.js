const multer = require("multer");
const cloudinary = require("cloudinary").v2;
const { CloudinaryStorage } = require("multer-storage-cloudinary");
const path = require("path");
require("dotenv").config();

const storage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: "alma-better/courses",
    allowed_formats: ["jpg", "jpeg", "png", "gif", "webp"],
    transformation: [{ width: 800, height: 600, crop: "limit" }],
  },
});

// Configure Cloudinary storage for session materials
const sessionMaterialsStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder:
      process.env.CLOUDINARY_SESSION_MATERIALS_FOLDER || "alma-better/session-materials",
    allowed_formats: [
      "pdf",
      "doc",
      "docx",
      "ppt",
      "pptx",
      "txt",
      "jpg",
      "jpeg",
      "png",
      "mp4",
      "mov",
    ],
    resource_type: "auto",
    transformation: [{ width: 800, crop: "limit" }],
  },
});

// Configure Cloudinary storage for session recordings
const sessionRecordingsStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder:
      process.env.CLOUDINARY_SESSION_RECORDINGS_FOLDER ||
      "alma-better/session-recordings",
    allowed_formats: ["mp4", "mov", "avi", "mkv", "webm"],
    resource_type: "video",
    chunk_size: 6000000, // 6MB chunks for large files
  },
});

// File filter for session materials
const sessionMaterialsFilter = (req, file, cb) => {
  const allowedMimes = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/gif",
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError =
      "Invalid file type. Allowed types: PDF, DOC, PPT, Images, Videos";
    cb(new Error("Invalid file type"), false);
  }
};

// File filter for recordings
const recordingsFilter = (req, file, cb) => {
  const allowedMimes = [
    "video/mp4",
    "video/quicktime",
    "video/x-msvideo",
    "video/webm",
    "video/x-matroska",
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = "Invalid video format. Allowed: MP4, MOV, AVI, MKV, WEBM";
    cb(new Error("Invalid video format"), false);
  }
};

// Create upload instances
const uploadSessionMaterial = multer({
  storage: sessionMaterialsStorage,
  fileFilter: sessionMaterialsFilter,
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB for materials
  },
});

const uploadRecording = multer({
  storage: sessionRecordingsStorage,
  fileFilter: recordingsFilter,
  limits: {
    fileSize: 500 * 1024 * 1024, // 500MB for recordings
  },
});

// File filter
const fileFilter = (req, file, cb) => {
  // Accept images only
  if (!file.originalname.match(/\.(jpg|JPG|jpeg|JPEG|png|PNG|gif|GIF|webp|WEBP)$/)) {
    req.fileValidationError = "Only image files are allowed!";
    return cb(new Error("Only image files are allowed!"), false);
  }
  cb(null, true);
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_UPLOAD) * 1024 * 1024, // 5MB
  },
});

// Upload single image
exports.uploadThumbnail = upload.single("thumbnail");

// Export middleware
exports.uploadSessionMaterial = uploadSessionMaterial.single("file");
exports.uploadRecording = uploadRecording.single("recording");

// Configure Cloudinary storage for doubt attachments
const doubtAttachmentsStorage = new CloudinaryStorage({
  cloudinary: cloudinary,
  params: {
    folder: 'alma-better/doubt-attachments',
    allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'pdf', 'doc', 'docx', 'txt', 'zip'],
    resource_type: 'auto',
    transformation: [{ width: 800, crop: 'limit' }]
  }
});

// File filter for doubt attachments
const doubtAttachmentsFilter = (req, file, cb) => {
  const allowedMimes = [
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain',
    'application/zip'
  ];

  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    req.fileValidationError = 'Invalid file type for doubt attachment';
    cb(new Error('Invalid file type'), false);
  }
};

// Create upload instance for doubt attachments
const uploadDoubtAttachment = multer({
  storage: doubtAttachmentsStorage,
  fileFilter: doubtAttachmentsFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

// Export new middleware
exports.uploadDoubtAttachments = uploadDoubtAttachment.array('attachments', 5); // Max 5 files

// Error handling middleware
exports.handleUploadError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === "LIMIT_FILE_SIZE") {
      return res.status(400).json({
        success: false,
        message:
          "File too large. Maximum size is 50MB for materials, 500MB for recordings",
      });
    }
    if (err.code === "LIMIT_UNEXPECTED_FILE") {
      return res.status(400).json({
        success: false,
        message: "Unexpected field in file upload",
      });
    }
  }

  if (req.fileValidationError) {
    return res.status(400).json({
      success: false,
      message: req.fileValidationError,
    });
  }

  if (err) {
    console.log("err in uploadSession file: ", err);
    return res.status(500).json({
      success: false,
      message: "Error uploading file: " + err.message,
    });
  }

  next();
};
