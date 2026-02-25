# Learning Material Download & Preview Feature

## Overview

This document describes the new download and preview functionality added to the Learning Material module. All roles (student, instructor, admin, and superadmin) can now download and preview learning materials with proper access control and comprehensive error handling.

## Key Improvements

### Enhanced Error Handling

- **Input Validation**: Material IDs and user context are validated before processing
- **User Context Verification**: Ensures proper authentication and role information
- **Detailed Error Messages**: Clear, actionable error messages for different failure scenarios
- **Access Permission Errors**: Specific messages for availability windows and revoked access
- **File Validation**: Thorough validation of file existence and URL integrity

### Fixed Issues

- ✅ **Complete PDF Preview URLs**: Uses Cloudinary transformations with correct syntax
- ✅ **Material Type Parameter Usage**: `getPreviewUrl()` now properly uses the materialType parameter
- ✅ **Removed External Dependencies**: Removed pdf.co API dependency - uses native Cloudinary only
- ✅ **Comprehensive Input Validation**: All endpoints validate required inputs
- ✅ **Improved Error Handling**: Try-catch blocks with specific error messages at each step

## Changes Made

### 1. Model Updates (LearningMaterial.js)

Added tracking fields to monitor user engagement:

```javascript
downloadCount: {
  type: Number,
  default: 0,
},
previewCount: {
  type: Number,
  default: 0,
},
lastDownloadedAt: {
  type: Date,
},
lastPreviewedAt: {
  type: Date,
},
```

These fields automatically track:

- Total number of downloads and previews
- Timestamps of the last download and preview actions

### 2. Controller Methods

#### `downloadMaterial()`

**Route:** `GET /api/v1/learning-materials/:id/download`

**Description:** Allows authorized users to download learning materials.

**Access Control:**

- ✅ Students (if enrolled in batch and material is available)
- ✅ Instructors (if creator or assigned to batch)
- ✅ Admins (all materials)
- ✅ SuperAdmins (all materials)

**Error Handling:**

- Validates material ID format using MongoDB ObjectId validation
- Verifies user authentication and role information
- Checks file attachment and URL validity
- Returns specific error messages for availability windows
- Handles database errors gracefully

**Availability Checks (for students):**

- Material must be published (`isPublished = true`)
- Current time must be within availability window
- Provides specific reasons if unavailable (future date, expired, etc.)

**Functionality:**

- Validates material ID format and user context
- Checks material existence and file attachment
- Validates file URL integrity
- Checks user authorization and material availability
- Increments download count
- Records timestamp of download
- Returns complete file metadata and download URL

**Response Example (Success - 200):**

```json
{
  "success": true,
  "message": "Material download initiated",
  "data": {
    "fileName": "chapter-1.pdf",
    "fileUrl": "https://cloudinary.com/...",
    "fileSize": 2048576,
    "mimeType": "application/pdf",
    "materialTitle": "Chapter 1: Introduction",
    "downloadCount": 5,
    "downloadedAt": "2026-02-25T10:30:00Z"
  }
}
```

**Error Response Examples:**

```json
// Material not found (404)
{
  "success": false,
  "message": "Learning material not found"
}

// No file attached (400)
{
  "success": false,
  "message": "This material does not have a file attached for download"
}

// Unauthorized (403)
{
  "success": false,
  "message": "You do not have permission to download this material"
}

// Material not available (403)
{
  "success": false,
  "message": "This material will be available from 03/01/2026"
}

// Invalid input (400)
{
  "success": false,
  "message": "Invalid material ID format"
}

// Server error (500)
{
  "success": false,
  "message": "Failed to process download request"
}
```

#### `previewMaterial()`

**Route:** `GET /api/v1/learning-materials/:id/preview`

**Description:** Allows authorized users to preview learning materials inline.

**Access Control:** Same as download (students, instructors, admins, superadmins)

**Error Handling:**

- Validates material ID format using MongoDB ObjectId validation
- Verifies user authentication and role information
- Checks authorization with detailed access control
- Validates quiz materials have questions
- Returns specific error messages for availability issues
- Continues tracking even if save operation fails

**Availability Checks (for students):**

- Material must be published (`isPublished = true`)
- Current time must be within availability window
- Provides specific reasons if unavailable

**Functionality:**

- Validates material ID format and user context
- Checks user authorization and material availability
- Validates material content (e.g., quizzes must have questions)
- Increments preview count
- Records timestamp of preview
- Generates optimized preview URLs using Cloudinary transformations
- Includes type-specific metadata (video duration, quiz info, etc.)
- Formats durations in readable HH:MM:SS format
- Includes material metadata and content details

**Supported Preview Types:**

- **PDF:** Optimized with w_800,h_1000 transformations for readable previews
- **Images:** Optimized with w_800,h_600 transformations and auto quality
- **Presentations:** Optimized with w_800 transformation and auto quality
- **Videos:** Includes duration formatting (HH:MM:SS) and thumbnail preview
- **External URLs:** Direct link to external content (YouTube, Vimeo, etc.)
- **Quizzes:** Question count, total points, and estimated time

**Response Example (PDF Material):**

```json
{
  "success": true,
  "message": "Material preview retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Chapter 1: Introduction",
    "description": "Introduction to the course",
    "materialType": "pdf",
    "contentType": "lesson",
    "difficulty": "beginner",
    "estimatedTime": 15,
    "formattedEstimatedTime": "15 minutes",
    "isPublished": true,
    "previewCount": 12,
    "createdBy": {
      "_id": "507f1f77bcf86cd799439012",
      "name": "John Doe",
      "email": "john@example.com"
    },
    "file": {
      "url": "https://res.cloudinary.com/cloud-name/image/upload/v1234567890/file.pdf",
      "originalName": "chapter-1.pdf",
      "size": 2048576,
      "mimeType": "application/pdf",
      "public_id": "alma-better/session-materials/file",
      "previewUrl": "https://res.cloudinary.com/cloud-name/image/upload/w_800,h_1000,c_limit/file.pdf",
      "canPreviewInline": true
    }
  }
}
```

**Response Example (Video Material):**

```json
{
  "success": true,
  "message": "Material preview retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Lecture Recording",
    "materialType": "video",
    "estimatedTime": 45,
    "formattedEstimatedTime": "45 minutes",
    "previewCount": 25,
    "file": {
      "url": "https://res.cloudinary.com/cloud-name/video/upload/...",
      "duration": 2700,
      "formattedDuration": "45:00",
      "canPreviewInline": true,
      "previewUrl": "https://res.cloudinary.com/cloud-name/video/upload/w_800,h_600,c_limit,so_0/..."
    }
  }
}
```

**Response Example (Quiz Material):**

```json
{
  "success": true,
  "message": "Material preview retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Chapter 1 Quiz",
    "materialType": "quiz",
    "previewCount": 8,
    "quizInfo": {
      "totalQuestions": 10,
      "totalPoints": 100,
      "estimatedTime": 30,
      "difficulty": "intermediate"
    }
  }
}
```

**Error Response Examples:**

```json
// Quiz with no questions (400)
{
  "success": false,
  "message": "Quiz material has no questions defined"
}

// Material not published for student (403)
{
  "success": false,
  "message": "This material has not been published yet"
}

// Material availability window error (403)
{
  "success": false,
  "message": "This material is no longer available (expired on 02/20/2026)"
}
```

#### `getMaterialStatistics()`

**Route:** `GET /api/v1/learning-materials/:id/statistics`

**Description:** Retrieves engagement statistics for a learning material.

**Access Control:** Same as download and preview

**Error Handling:**

- Validates material ID format
- Verifies user authentication and role
- Checks access permissions
- Returns all statistics with safe defaults
- Calculates engagement level based on score

**Functionality:**

- Validates material ID format and user context
- Checks user authorization
- Returns comprehensive engagement metrics
- Calculates weighted engagement score
- Determines engagement level (none/low/moderate/high/very-high)

**Response Example:**

```json
{
  "success": true,
  "message": "Material statistics retrieved successfully",
  "data": {
    "materialId": "507f1f77bcf86cd799439011",
    "title": "Chapter 1: Introduction",
    "materialType": "pdf",
    "isPublished": true,
    "viewCount": 45,
    "downloadCount": 12,
    "previewCount": 28,
    "completionCount": 35,
    "lastDownloadedAt": "2026-02-25T10:30:00Z",
    "lastPreviewedAt": "2026-02-25T09:15:00Z",
    "engagementScore": 181,
    "engagementLevel": "high"
  }
}
```

**Engagement Level Scale:**

| Score | Level     | Meaning                |
| ----- | --------- | ---------------------- |
| 0     | none      | No engagement activity |
| 1-9   | low       | Minimal engagement     |
| 10-49 | moderate  | Regular engagement     |
| 50-99 | high      | Strong engagement      |
| 100+  | very-high | Very high engagement   |

**Engagement Score Formula:**

```
Score = (views × 1) + (previews × 2) + (downloads × 3) + (completions × 5)
```

**Error Response Example:**

```json
{
  "success": false,
  "message": "You do not have permission to view statistics for this material"
}
```

### 3. API Routes

#### New Endpoints

| Method | Route                                       | Description                | Access                  |
| ------ | ------------------------------------------- | -------------------------- | ----------------------- |
| GET    | `/api/v1/learning-materials/:id/download`   | Download learning material | All authenticated users |
| GET    | `/api/v1/learning-materials/:id/preview`    | Preview learning material  | All authenticated users |
| GET    | `/api/v1/learning-materials/:id/statistics` | Get material statistics    | All authenticated users |

### 4. Access Control Features

All three new endpoints include comprehensive access control:

1. **Role-Based Access:**
   - Students must be enrolled in the batch with active enrollment
   - Instructors must have created the material or be assigned to the batch
   - Admins and superadmins can access all materials

2. **Availability Checking:**
   - Students can only download/preview published materials
   - Students can only access materials within `availableFrom` and `availableUntil` dates
   - Instructors/admins can access unpublished materials

3. **Authorization Middleware:**
   - Uses existing `protect` middleware for authentication
   - Implements custom `checkMaterialAccess()` function for detailed access verification

## Usage Examples

### Frontend Implementation Example

```javascript
// Download a material
async function downloadMaterial(materialId) {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/download`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      // Create download link
      const link = document.createElement("a");
      link.href = data.data.fileUrl;
      link.download = data.data.fileName;
      link.click();
    }
  } catch (error) {
    console.error("Download failed:", error);
  }
}

// Preview a material
async function previewMaterial(materialId) {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/preview`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      const material = data.data;

      // Handle different material types
      if (material.materialType === "pdf") {
        displayPdfPreview(material.file.previewUrl);
      } else if (material.materialType === "image") {
        displayImagePreview(material.file.url);
      } else if (material.externalUrl) {
        openExternalLink(material.externalUrl);
      }
    }
  } catch (error) {
    console.error("Preview failed:", error);
  }
}

// Get material statistics
async function getMaterialStats(materialId) {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/statistics`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const data = await response.json();

    if (data.success) {
      const stats = data.data;
      console.log(`Views: ${stats.viewCount}`);
      console.log(`Downloads: ${stats.downloadCount}`);
      console.log(`Previews: ${stats.previewCount}`);
      console.log(`Engagement Score: ${stats.engagementScore}`);
    }
  } catch (error) {
    console.error("Failed to get statistics:", error);
  }
}
```

## Security & Authorization

### What the System Protects:

1. **Unauthorized Download/Preview:**
   - Users not enrolled in the batch cannot download/preview
   - Revoked enrollments cannot access materials
   - Published status is enforced for students

2. **Availability Windows:**
   - Materials with future `availableFrom` dates are restricted
   - Materials past `availableUntil` dates are inaccessible
   - Time-based access is enforced

3. **Instructor/Admin Features:**
   - Can preview unpublished materials
   - Can access all materials in their managed batches
   - Superadmins have complete access

## Engagement Tracking

The system automatically tracks engagement using:

**Engagement Score Formula:**

```
Score = (views × 1) + (previews × 2) + (downloads × 3) + (completions × 5)
```

This weighted formula helps identify:

- Most downloaded materials
- Most previewed content
- High-engagement resources
- Materials needing improvement

## Database Changes Summary

### LearningMaterial Model

- Added `downloadCount` field (default: 0)
- Added `previewCount` field (default: 0)
- Added `lastDownloadedAt` field (timestamp)
- Added `lastPreviewedAt` field (timestamp)

No data migration needed - fields are initialized to default values.

## Error Handling

The system provides clear error messages:

| Status | Error                  | Meaning                       |
| ------ | ---------------------- | ----------------------------- |
| 404    | Material not found     | Material ID doesn't exist     |
| 400    | No downloadable file   | Material has no file attached |
| 403    | Not authorized         | User doesn't have access      |
| 403    | Material not available | Outside availability window   |

## Best Practices

1. **For Students:**
   - Always check material availability before accessing
   - Use preview to review before downloading
   - Track your download/preview history in statistics

2. **For Instructors:**
   - Monitor engagement metrics via statistics
   - Publish materials when ready for student access
   - Set appropriate availability windows

3. **For Admins/SuperAdmins:**
   - Use statistics to identify popular/unpopular content
   - Monitor download patterns
   - Support instructors with analytics

## Testing the Features

```bash
# Test download endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v1/learning-materials/MATERIAL_ID/download

# Test preview endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v1/learning-materials/MATERIAL_ID/preview

# Test statistics endpoint
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:5000/api/v1/learning-materials/MATERIAL_ID/statistics
```

## Summary

This implementation provides a secure, role-based system for downloading and previewing learning materials with automatic engagement tracking. All four user roles (student, instructor, admin, superadmin) can access materials according to their permissions, and the system maintains comprehensive usage statistics for analytics and learning analytics purposes.
