# File Upload, Download & Preview - Implementation Guide

## Overview
This document describes the complete implementation of file upload, download, and preview functionality for Learning Materials and Assignments in the zatAcademy platform.

## What's Been Fixed

### 1. **Universal File Upload Support** ✅
- **Before**: Limited file types (only specific formats like PDF, DOC, PPT, images, videos)
- **After**: Accepts ANY file format (generic files, archives, executables, etc.)
- **Implementation**: Updated Cloudinary storage configuration to use `resource_type: 'auto'`

### 2. **Assignment File Upload** ✅
- **Before**: Assignments had NO file upload capability
- **After**: Instructors can upload one resource file per assignment
- **Implementation**:
  - Added `file` field to Assignment model
  - Updated `createAssignment` controller to handle file uploads
  - Updated `updateAssignment` controller to handle file updates/replacements
  - Updated `deleteAssignment` controller to clean up files from Cloudinary

### 3. **Learning Material File Upload** ✅
- **Before**: Limited to predefined file types only
- **After**: Supports any file format while maintaining file metadata
- **Implementation**: Updated session materials storage to accept all file types

### 4. **Download in Original Format** ✅
- **Before**: No download endpoint or basic URL return
- **After**: Files are downloadable in their ORIGINAL format with proper MIME types
- **Implementation**: 
  - Cloudinary `fl_attachment` flag forces browser download
  - Original filename and MIME type preserved
  - Signed URLs expire after 1 hour for security

### 5. **Preview Support** ✅
- **Before**: No preview capability
- **After**: Files are previewable based on type
  - Images: inline preview
  - Videos: inline player
  - PDFs: browser PDF viewer
  - Audio: inline player
  - Text files: browser display
  - Others: download prompt or external handler
- **Implementation**: New `buildPreviewResponse()` utility with file type detection

### 6. **File Service Utility** ✅
- **Location**: `src/utils/fileService.js`
- **Purpose**: Centralized file handling logic
- **Functions**:
  - `mimeToResourceType()`: Convert MIME type to Cloudinary resource type
  - `buildCloudinaryUrl()`: Build signed Cloudinary URLs
  - `buildDownloadResponse()`: Prepare download response with metadata
  - `buildPreviewResponse()`: Prepare preview response with type info
  - `isPreviewable()`: Check if file is browser-previewable
  - `getExtensionFromMime()`: Get file extension from MIME type
  - `formatFileSize()`: Convert bytes to human-readable size

## API Endpoints

### Learning Materials

**Upload/Update Material with File**
```
POST   /api/v1/batches/:batchId/learning-materials
PUT    /api/v1/learning-materials/:id
Header: Content-Type: multipart/form-data
Body:   { file, jsonData or form fields... }
```

**Download Material File**
```
GET    /api/v1/learning-materials/:id/download
Response: { url, filename, mimeType, size, expiresIn }
```

**Preview Material File**
```
GET    /api/v1/learning-materials/:id/preview
Response: { type, url, mimeType, filename, previewable, expiresIn }
```

### Assignments

**Create Assignment with File**
```
POST   /api/v1/batches/:batchId/assignments
Header: Content-Type: multipart/form-data
Body:   { file, title, description, deadline, maxMarks, ... }
```

**Update Assignment File**
```
PUT    /api/v1/assignments/:id
Header: Content-Type: multipart/form-data
Body:   { file, ... other fields ... }
```

**Download Assignment File**
```
GET    /api/v1/assignments/:id/download
Response: { url, filename, mimeType, size, expiresIn }
```

**Preview Assignment File**
```
GET    /api/v1/assignments/:id/preview
Response: { type, url, mimeType, filename, previewable, expiresIn }
```

### Submissions

**Download Submission File**
```
GET    /api/v1/submissions/:submissionId/files/:fileIndex/download
Response: { url, filename, mimeType, size, expiresIn }
```

**Preview Submission File**
```
GET    /api/v1/submissions/:submissionId/files/:fileIndex/preview
Response: { type, url, mimeType, filename, previewable, expiresIn }
```

## Supported File Types

### Now Supported (ANY Format)
- ✅ Documents: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, TXT, CSV, etc.
- ✅ Images: JPG, PNG, GIF, WEBP, SVG, BMP, TIFF, etc.
- ✅ Videos: MP4, MOV, AVI, MKV, WEBM, FLV, etc.
- ✅ Audio: MP3, WAV, OGG, FLAC, AAC, etc.
- ✅ Archives: ZIP, RAR, 7Z, TAR, GZIP, etc.
- ✅ Code: JS, PY, JAVA, CPP, HTML, CSS, etc.
- ✅ Data: JSON, XML, YAML, SQL, etc.
- ✅ Executables: EXE, APK, DMG, etc. (with appropriate security considerations)

### File Size Limits
- Learning Materials: **100 MB** (increased from 50 MB)
- Assignments: **100 MB** (increased from 50 MB)
- Submissions: **50 MB** (per file)
- Session Recordings: **500 MB**

## Database Schema Changes

### Assignment Model
```javascript
// NEW FIELD - stores instructor-provided resource file
file: {
  url: String,           // Cloudinary URL
  public_id: String,     // Cloudinary public ID
  originalName: String,  // Original filename
  size: Number,          // File size in bytes
  mimeType: String,      // MIME type (e.g., 'application/pdf')
}
```

## Code Changes Summary

### Files Modified
1. **src/middleware/uploads.js**
   - Added `universalFilesStorage` configuration
   - Updated `sessionMaterialsFilter` to accept all file types
   - Updated `sessionMaterialsStorage` to use `resource_type: 'auto'`
   - Added `uploadUniversalFile` export

2. **src/models/Assignment.js**
   - Added `file` field to store assignment resource files

3. **src/controllers/assignment.controller.js**
   - Updated `createAssignment` to handle file uploads
   - Updated `updateAssignment` to handle file updates and old file cleanup
   - Updated `deleteAssignment` to delete files from Cloudinary
   - Added `downloadAssignmentFile` endpoint
   - Added `previewAssignmentFile` endpoint
   - Added imports for file service utility

4. **src/controllers/learningMaterial.controller.js**
   - Improved `downloadMaterial` to use file service utility
   - Improved `previewMaterial` to use file service utility
   - Updated helper functions to support more file types
   - Added imports for file service utility

5. **src/controllers/Submission.controller.js**
   - Refactored `downloadSubmissionFile` to use file service utility
   - Refactored `previewSubmissionFile` to use file service utility
   - Removed duplicate helper functions (now imported from file service)

6. **src/routes/assignment.routes.js**
   - Added `uploadSessionMaterial` middleware to POST and PUT routes
   - Added `handleUploadError` middleware
   - Added `downloadAssignmentFile` export and route
   - Added `previewAssignmentFile` export and route

### Files Created
1. **src/utils/fileService.js** (NEW)
   - Centralized file handling utility
   - 8 exported functions for file operations
   - MIME type detection and conversion
   - Signed URL generation
   - Preview capability detection

## Frontend Implementation Example

### Upload File Example
```javascript
// Using FormData
const formData = new FormData();
formData.append('file', fileInput.files[0]);
formData.append('title', 'Assignment 1');
formData.append('description', 'Learn basic concepts');
formData.append('maxMarks', 100);
formData.append('deadline', '2024-12-31');

fetch('/api/v1/assignments', {
  method: 'POST',
  body: formData,
  headers: {
    'Authorization': `Bearer ${token}`
  }
});
```

### Download File Example
```javascript
// Get download URL
const response = await fetch(`/api/v1/assignments/${id}/download`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await response.json();

// Trigger download
const link = document.createElement('a');
link.href = data.url;
link.download = data.filename;
link.click();
```

### Preview File Example
```javascript
// Get preview URL
const response = await fetch(`/api/v1/assignments/${id}/preview`, {
  headers: { 'Authorization': `Bearer ${token}` }
});
const { data } = await response.json();

// Handle preview based on type
if (data.previewable) {
  if (data.mimeType.startsWith('image/')) {
    showImagePreview(data.url);
  } else if (data.mimeType.startsWith('video/')) {
    showVideoPlayer(data.url);
  } else if (data.mimeType === 'application/pdf') {
    showPDFViewer(data.url);
  } else {
    showTextPreview(data.url);
  }
} else {
  // File not previewable, offer download
  showDownloadButton(data.url, data.filename);
}
```

## Security Considerations

1. **Signed URLs**: All Cloudinary URLs are signed and expire after 1 hour
2. **Access Control**: Download/preview endpoints respect existing authorization checks
3. **File Validation**: While accepting any format, Cloudinary handles virus scanning
4. **MIME Type Verification**: MIME types are stored and verified
5. **Original Name Sanitization**: Filenames are sanitized for download attachment headers

## Error Handling

All endpoints return proper error responses:

```javascript
// File not found
{ success: false, message: "Learning material not found" }

// No file attached
{ success: false, message: "This material has no downloadable file attached" }

// Invalid file index
{ success: false, message: "File index X is out of range (0–N)" }

// Unauthorized access
{ success: false, message: "Not authorized to access this file" }
```

## Testing Checklist

- [x] Upload PDF to learning material
- [x] Upload DOCX to learning material
- [x] Upload random file format to assignment
- [x] Download file in original format
- [x] Download file preserves original filename
- [x] Download file with correct MIME type
- [x] Preview PDF file
- [x] Preview image file
- [x] Preview video file
- [x] Update assignment with new file
- [x] Old file deleted when replaced
- [x] Delete assignment removes file from Cloudinary
- [x] Download/preview URLs expire after 1 hour
- [x] Authorization checks work correctly
- [x] File metadata (size, name, type) preserved

## Environment Variables

No new environment variables are required. Existing Cloudinary configuration is used:

```
CLOUDINARY_CLOUD_NAME
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_MATERIALS_FOLDER
CLOUDINARY_SUBMISSIONS_FOLDER
```

## Backward Compatibility

✅ All changes are backward compatible:
- Existing learning materials without files continue to work
- Existing assignments without files continue to work
- External URL handling in learning materials unchanged
- All existing API responses remain compatible

## Performance Optimization

- Signed URLs generated on-demand (not cached)
- File metadata stored in database (not re-fetched)
- Cloudinary handles delivery optimization automatically
- URLs expire for security (1 hour default)

## Future Enhancements

- [ ] Bulk file uploads
- [ ] File preview caching
- [ ] Custom file type restrictions per batch
- [ ] File conversion (e.g., PDF from DOCX)
- [ ] Advanced file scanning/validation
- [ ] File compression for submissions
- [ ] Multiple file versions/history
- [ ] Anti-plagiarism integration
