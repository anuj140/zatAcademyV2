# Learning Material Download & Preview - Quick API Reference

Enhanced with comprehensive error handling, input validation, and improved preview URL generation.

## 📥 Download Material

### Endpoint

```
GET /api/v1/learning-materials/:id/download
```

### Authentication

```
Required: Bearer token in Authorization header
Content-Type: application/json
```

### Parameters

| Parameter | Type   | Location | Required | Description            |
| --------- | ------ | -------- | -------- | ---------------------- |
| id        | string | URL      | Yes      | Valid MongoDB ObjectId |

### Response (Success - 200)

```json
{
  "success": true,
  "message": "Material download initiated",
  "data": {
    "fileName": "chapter-1.pdf",
    "fileUrl": "https://res.cloudinary.com/cloud-name/upload/v123/chapter-1.pdf",
    "fileSize": 2048576,
    "mimeType": "application/pdf",
    "materialTitle": "Chapter 1: Introduction",
    "downloadCount": 5,
    "downloadedAt": "2026-02-25T10:30:00Z"
  }
}
```

### Response Errors

| Status | Message                                                      | Cause                              |
| ------ | ------------------------------------------------------------ | ---------------------------------- |
| 400    | Invalid material ID format                                   | ID is not a valid MongoDB ObjectId |
| 400    | Material ID is required                                      | ID parameter missing               |
| 400    | This material does not have a file attached for download     | File not uploaded                  |
| 400    | Material file URL is missing or invalid                      | File URL corrupted                 |
| 401    | User authentication required                                 | Missing or invalid token           |
| 403    | You do not have permission to download this material         | Access denied                      |
| 403    | This material has not been published yet                     | Material not published             |
| 403    | This material will be available from 03/01/2026              | Future availability                |
| 403    | This material is no longer available (expired on 02/20/2026) | Past expiration                    |
| 404    | Learning material not found                                  | Invalid/deleted material           |
| 500    | Failed to process download request                           | Server error                       |

### Access Control

- ✅ Students (enrolled in batch & material published & within availability window)
- ✅ Instructors (creator or batch instructor)
- ✅ Admins (all materials)
- ✅ SuperAdmins (all materials)

### Features

- ✅ Material ID format validation (MongoDB ObjectId)
- ✅ User context verification (auth & role)
- ✅ File existence and URL integrity checks
- ✅ Automatic download count increment
- ✅ Last download timestamp tracking
- ✅ Availability window validation for students
- ✅ Graceful error handling with specific messages

---

## 👁️ Preview Material

### Endpoint

```
GET /api/v1/learning-materials/:id/preview
```

### Authentication

```
Required: Bearer token in Authorization header
Content-Type: application/json
```

### Parameters

| Parameter | Type   | Location | Required | Description            |
| --------- | ------ | -------- | -------- | ---------------------- |
| id        | string | URL      | Yes      | Valid MongoDB ObjectId |

### Response (Success - 200) - PDF Example

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
    "createdAt": "2026-02-25T10:00:00Z",
    "file": {
      "url": "https://res.cloudinary.com/cloud-name/image/upload/v123/chapter-1.pdf",
      "originalName": "chapter-1.pdf",
      "size": 2048576,
      "mimeType": "application/pdf",
      "public_id": "alma-better/session-materials/chapter-1",
      "previewUrl": "https://res.cloudinary.com/cloud-name/image/upload/w_800,h_1000,c_limit/chapter-1.pdf",
      "canPreviewInline": true
    }
  }
}
```

### Response (Success - 200) - Video Example

```json
{
  "success": true,
  "message": "Material preview retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Lecture Recording - Week 1",
    "materialType": "video",
    "estimatedTime": 45,
    "formattedEstimatedTime": "45 minutes",
    "previewCount": 25,
    "file": {
      "url": "https://res.cloudinary.com/cloud-name/video/upload/.../lecture.mp4",
      "duration": 2700,
      "formattedDuration": "45:00",
      "canPreviewInline": true,
      "previewUrl": "https://res.cloudinary.com/cloud-name/video/upload/w_800,h_600,c_limit,so_0/lecture.mp4"
    }
  }
}
```

### Response (Success - 200) - Quiz Example

```json
{
  "success": true,
  "message": "Material preview retrieved successfully",
  "data": {
    "id": "507f1f77bcf86cd799439011",
    "title": "Chapter 1 Quiz",
    "materialType": "quiz",
    "difficulty": "intermediate",
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

### Response Errors

| Status | Message                                                      | Cause                              |
| ------ | ------------------------------------------------------------ | ---------------------------------- |
| 400    | Invalid material ID format                                   | ID is not a valid MongoDB ObjectId |
| 400    | Quiz material has no questions defined                       | Quiz created but empty             |
| 401    | User authentication required                                 | Missing or invalid token           |
| 403    | You do not have permission to preview this material          | Access denied                      |
| 403    | This material has not been published yet                     | Material not published             |
| 403    | This material will be available from 03/01/2026              | Future availability                |
| 403    | This material is no longer available (expired on 02/20/2026) | Past expiration                    |
| 404    | Learning material not found                                  | Invalid/deleted material           |
| 500    | Failed to retrieve material preview                          | Server error                       |

### Access Control

- ✅ Students (enrolled & material published & within availability window)
- ✅ Instructors (creator or batch instructor)
- ✅ Admins (all materials)
- ✅ SuperAdmins (all materials)

### Preview URL Transformations

| Material Type | Transformation                | Dimensions                    |
| ------------- | ----------------------------- | ----------------------------- |
| PDF           | Cloudinary image optimization | w_800, h_1000, c_limit        |
| Images        | Optimized for viewing         | w_800, h_600, c_limit, q_auto |
| Presentations | Aspect ratio preserved        | w_800, c_limit, q_auto        |
| Videos        | Thumbnail/poster frame        | w_800, h_600, c_limit, so_0   |

### Features

- ✅ Material ID format validation
- ✅ User context verification
- ✅ Complete preview data with metadata
- ✅ Optimized preview URLs via Cloudinary
- ✅ Duration formatting for videos (HH:MM:SS)
- ✅ Quiz metadata (questions, points, time)
- ✅ Automatic preview count increment
- ✅ Last preview timestamp tracking
- ✅ Type-specific metadata inclusion

---

## 📊 Get Material Statistics

### Endpoint

```
GET /api/v1/learning-materials/:id/statistics
```

### Authentication

```
Required: Bearer token in Authorization header
Content-Type: application/json
```

### Parameters

| Parameter | Type   | Location | Required | Description            |
| --------- | ------ | -------- | -------- | ---------------------- |
| id        | string | URL      | Yes      | Valid MongoDB ObjectId |

### Response (Success - 200)

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

### Response Errors

| Status | Message                                                         | Cause                              |
| ------ | --------------------------------------------------------------- | ---------------------------------- |
| 400    | Invalid material ID format                                      | ID is not a valid MongoDB ObjectId |
| 401    | User authentication required                                    | Missing or invalid token           |
| 403    | You do not have permission to view statistics for this material | Access denied                      |
| 404    | Learning material not found                                     | Invalid/deleted material           |
| 500    | Failed to retrieve material statistics                          | Server error                       |

### Access Control

- ✅ Students (enrolled in batch)
- ✅ Instructors (creator or batch instructor)
- ✅ Admins (all materials)
- ✅ SuperAdmins (all materials)

### Engagement Score Details

**Calculation Formula:**

```
Score = (views × 1) + (previews × 2) + (downloads × 3) + (completions × 5)
```

**Engagement Levels:**

| Score | Level     | Interpretation            |
| ----- | --------- | ------------------------- |
| 0     | none      | No engagement activity    |
| 1-9   | low       | Minimal usage             |
| 10-49 | moderate  | Regular usage             |
| 50-99 | high      | Strong student engagement |
| 100+  | very-high | Exceptional engagement    |

### Features

- ✅ Input validation and error handling
- ✅ Comprehensive engagement metrics
- ✅ Weighted engagement scoring
- ✅ Automatic engagement level classification
- ✅ Last activity tracking
- ✅ Safe defaults for missing data
  "id": "507f1f77bcf86cd799439011",
  "title": "Lecture Recording",
  "materialType": "video",
  "previewCount": 25,
  "file": {
  "url": "https://cloudinary.com/...",
  "videoDuration": 3600
  }
  }
  }

```

### Responses (Error)
- **404** - Material not found
- **403** - Not authorized or material not available
- **500** - Server error

### Access Control
Same as Download endpoint

### Preview URL Generation
Material Type | Preview Generation
---|---
PDF | Cloudinary optimized URL
Images | Optimized with transformations (800x600)
Presentations | Optimized for preview
External URLs | Direct link
Quizzes | Question metadata
Videos | Duration included

---

## 📊 Get Material Statistics

### Endpoint
```

GET /api/v1/learning-materials/:id/statistics

```

### Authentication
```

Required: Bearer token in Authorization header

````

### Parameters
| Parameter | Type | Location | Required | Description |
|-----------|------|----------|----------|-------------|
| id | string | URL | Yes | Learning material ID |

### Response (Success - 200)
```json
{
  "success": true,
  "message": "Material statistics retrieved successfully",
  "data": {
    "materialId": "507f1f77bcf86cd799439011",
    "title": "Chapter 1: Introduction",
    "viewCount": 45,
    "downloadCount": 12,
    "previewCount": 28,
    "completionCount": 35,
    "lastDownloadedAt": "2026-02-25T10:30:00Z",
    "lastPreviewedAt": "2026-02-25T09:15:00Z",
    "engagementScore": 181
  }
}
````

### Responses (Error)

- **404** - Material not found
- **403** - Not authorized
- **500** - Server error

### Access Control

All authenticated users (same as download/preview)

### Engagement Score Calculation

```
Formula: (views × 1) + (previews × 2) + (downloads × 3) + (completions × 5)

Example:
45 views × 1 = 45
28 previews × 2 = 56
12 downloads × 3 = 36
35 completions × 5 = 175
────────────────────
Total Score = 312
```

---

## 🔒 Authorization Details

### Student Access Requirements

- ✅ Must be enrolled in the batch
- ✅ Enrollment status must be 'active'
- ✅ Access must not be revoked
- ✅ Material must be published (isPublished = true)
- ✅ Current time must be within availability window
  - Material `availableFrom` must be in the past (or not set)
  - Material `availableUntil` must be in the future (or not set)

### Instructor Access Requirements

- ✅ Must have created the material OR
- ✅ Must be assigned as instructor to the material's batch

### Admin Access

- ✅ Can access all materials without restrictions

### SuperAdmin Access

- ✅ Can access all materials without restrictions

---

## 📱 Client-Side Implementation

### Using Fetch API

```javascript
// Download Material
const downloadMaterial = async (materialId, token) => {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/download`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error("Download failed");

    const data = await response.json();

    if (data.success) {
      // Create download link
      const link = document.createElement("a");
      link.href = data.data.fileUrl;
      link.download = data.data.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

// Preview Material
const previewMaterial = async (materialId, token) => {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/preview`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error("Preview failed");

    const data = await response.json();

    if (data.success) {
      const material = data.data;
      displayPreview(material);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

// Get Material Statistics
const getMaterialStats = async (materialId, token) => {
  try {
    const response = await fetch(`/api/v1/learning-materials/${materialId}/statistics`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) throw new Error("Statistics fetch failed");

    const data = await response.json();

    if (data.success) {
      displayStatistics(data.data);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};
```

### Using Axios

```javascript
import axios from "axios";

const api = axios.create({
  baseURL: "/api/v1",
  headers: {
    Authorization: `Bearer ${token}`,
  },
});

// Download
const downloadMaterial = async (materialId) => {
  try {
    const { data } = await api.get(`/learning-materials/${materialId}/download`);
    if (data.success) {
      window.open(data.data.fileUrl, "_blank");
    }
  } catch (error) {
    console.error("Error:", error.response?.data?.message);
  }
};

// Preview
const previewMaterial = async (materialId) => {
  try {
    const { data } = await api.get(`/learning-materials/${materialId}/preview`);
    if (data.success) {
      return data.data;
    }
  } catch (error) {
    console.error("Error:", error.response?.data?.message);
  }
};

// Statistics
const getMaterialStats = async (materialId) => {
  try {
    const { data } = await api.get(`/learning-materials/${materialId}/statistics`);
    if (data.success) {
      return data.data;
    }
  } catch (error) {
    console.error("Error:", error.response?.data?.message);
  }
};
```

---

## 🧪 Testing with cURL

```bash
# Set token variable
TOKEN="your_jwt_token_here"
MATERIAL_ID="material_id_here"
BASE_URL="http://localhost:5000/api/v1"

# Download a material
curl -X GET \
  "${BASE_URL}/learning-materials/${MATERIAL_ID}/download" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"

# Preview a material
curl -X GET \
  "${BASE_URL}/learning-materials/${MATERIAL_ID}/preview" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"

# Get material statistics
curl -X GET \
  "${BASE_URL}/learning-materials/${MATERIAL_ID}/statistics" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json"
```

---

## 📈 Monitoring & Analytics

### Statistics Tracked

- **View Count**: How many times material was viewed
- **Download Count**: How many times material was downloaded
- **Preview Count**: How many times material was previewed
- **Completion Count**: How many times material was completed
- **Last Downloaded At**: Timestamp of last download
- **Last Previewed At**: Timestamp of last preview
- **Engagement Score**: Weighted engagement metric

### Using Statistics for Analytics

```javascript
const material = await api.get(`/learning-materials/${id}/statistics`);
const stats = material.data.data;

// Identify popular materials
if (stats.downloadCount > 50) console.log("Highly downloaded");

// Identify disengaged materials
if (stats.engagementScore < 10) console.log("Low engagement");

// Track user behavior
console.log(`Last access: ${stats.lastDownloadedAt || stats.lastPreviewedAt}`);

// Monitor completion
const completionRate = ((stats.completionCount / stats.viewCount) * 100).toFixed(2);
console.log(`Completion Rate: ${completionRate}%`);
```

---

## 🚨 Common Issues & Solutions

| Issue           | Cause                  | Solution                                     |
| --------------- | ---------------------- | -------------------------------------------- |
| 403 Forbidden   | Not enrolled           | Ensure enrollment is active and not revoked  |
| 403 Forbidden   | Material not available | Check availability window and publish status |
| 404 Not Found   | Material deleted       | Verify material ID exists                    |
| 400 Bad Request | No file attached       | Material must have a file for download       |

---

## ✅ Checklist for Integration

- [ ] Verify authentication middleware is working
- [ ] Test with different user roles (student, instructor, admin, superadmin)
- [ ] Check availability window functionality
- [ ] Verify download/preview count increments
- [ ] Test statistics endpoint
- [ ] Verify access is denied for unauthorized users
- [ ] Check response formats match documentation
- [ ] Monitor error handling
