# File Upload/Download - Quick Reference

## Key Changes at a Glance

### ✅ What Was Fixed
1. **Files now work with ANY format** (was: limited to specific types)
2. **Assignments can have file uploads** (was: no file upload support)
3. **Files download in their original format** (was: no proper download support)
4. **Files can be previewed in browser** (was: no preview capability)

---

## Quick Usage Examples

### 1. Upload a File to Assignment
```bash
curl -X POST http://localhost/api/v1/batches/BATCH_ID/assignments \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@lecture.pdf" \
  -F "title=Lecture 1" \
  -F "description=Introduction to course" \
  -F "maxMarks=100" \
  -F "deadline=2024-12-31T23:59:59Z"
```

### 2. Download Assignment File
```bash
curl http://localhost/api/v1/assignments/ASSIGN_ID/download \
  -H "Authorization: Bearer TOKEN"
# Returns: { url: "signed_cloudinary_url", filename, mimeType, size }
```

### 3. Preview Assignment File
```bash
curl http://localhost/api/v1/assignments/ASSIGN_ID/preview \
  -H "Authorization: Bearer TOKEN"
# Returns: { url: "signed_cloudinary_url", previewable: true, mimeType }
```

### 4. Upload File to Learning Material
```bash
curl -X POST http://localhost/api/v1/batches/BATCH_ID/learning-materials \
  -H "Authorization: Bearer TOKEN" \
  -F "file=@study_guide.docx" \
  -F "jsonData={\"title\":\"Study Guide\",\"description\":\"...\",\"materialType\":\"document\"}"
```

---

## File Size Limits
| Type | Limit |
|------|-------|
| Learning Material | 100 MB |
| Assignment | 100 MB |
| Submission | 50 MB |
| Recording | 500 MB |

---

## Supported MIME Types (Comprehensive)

### Documents
```
application/pdf
application/msword (doc)
application/vnd.openxmlformats-officedocument.wordprocessingml.document (docx)
application/vnd.ms-powerpoint (ppt)
application/vnd.openxmlformats-officedocument.presentationml.presentation (pptx)
text/plain, text/csv
application/vnd.ms-excel (xls)
application/vnd.openxmlformats-officedocument.spreadsheetml.sheet (xlsx)
```

### Images
```
image/jpeg, image/jpg, image/png, image/gif, image/webp, image/svg+xml
```

### Video
```
video/mp4, video/quicktime (mov), video/x-msvideo (avi)
video/webm, video/x-matroska (mkv)
```

### Audio
```
audio/mpeg (mp3), audio/wav, audio/ogg, audio/webm
```

### Archives
```
application/zip
application/x-rar-compressed (rar)
application/x-7z-compressed (7z)
```

### Custom Extensions
All other file types automatically detected by Cloudinary

---

## Common Issues & Solutions

### Issue: "File too large"
**Solution**: Check file size against limits above

### Issue: "Invalid file type"
**Solution**: Should not occur anymore - all types supported!

### Issue: Download fails / wrong filename
**Solution**: Check that `originalName` was stored during upload

### Issue: Preview doesn't show
**Solution**: Check `previewable` flag in response - some formats need download instead

### Issue: Signed URL expired
**Solution**: URLs expire after 1 hour - request fresh URL

---

## Frontend Quick Start

### React Component Example
```jsx
import { useState } from 'react';

export function FileUpload({ batchId, onSuccess }) {
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleUpload = async () => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('title', 'My Assignment');
    
    setLoading(true);
    try {
      const res = await fetch(`/api/v1/assignments`, {
        method: 'POST',
        body: formData,
        headers: { 'Authorization': `Bearer ${localStorage.token}` }
      });
      const { data } = await res.json();
      onSuccess(data);
    } catch (err) {
      console.error('Upload failed:', err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <input 
        type="file" 
        onChange={(e) => setFile(e.target.files[0])}
        accept="*/*"
      />
      <button onClick={handleUpload} disabled={loading}>
        {loading ? 'Uploading...' : 'Upload'}
      </button>
    </div>
  );
}
```

### Download Function
```jsx
async function downloadFile(resourceId, isAssignment = true) {
  const endpoint = isAssignment 
    ? `/api/v1/assignments/${resourceId}/download`
    : `/api/v1/learning-materials/${resourceId}/download`;
    
  const res = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data } = await res.json();
  
  // Open download URL
  window.open(data.url, '_blank');
}
```

### Preview Function
```jsx
async function previewFile(resourceId, isAssignment = true) {
  const endpoint = isAssignment 
    ? `/api/v1/assignments/${resourceId}/preview`
    : `/api/v1/learning-materials/${resourceId}/preview`;
    
  const res = await fetch(endpoint, {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  
  const { data } = await res.json();
  
  if (data.previewable) {
    // Show in modal/iframe
    showPreviewModal(data.url, data.mimeType);
  } else {
    // Offer download instead
    window.open(data.url, '_blank');
  }
}
```

---

## File Service Utility (for developers)

### Location
`src/utils/fileService.js`

### Key Functions
```javascript
// Determine resource type for Cloudinary
mimeToResourceType('application/pdf') // => 'raw'
mimeToResourceType('video/mp4') // => 'video'

// Build signed URLs
buildCloudinaryUrl(publicId, resourceType, forDownload, originalName)

// Prepare response objects
buildDownloadResponse(file, title) // => { url, filename, mimeType, size }
buildPreviewResponse(file, title) // => { url, mimeType, previewable, extension }

// Utility functions
isPreviewable('application/pdf') // => true
getExtensionFromMime('application/pdf') // => 'pdf'
getMimeFromExtension('myfile.pdf') // => 'application/pdf'
formatFileSize(1024000) // => '999.02 KB'
```

---

## API Response Formats

### Download Response
```json
{
  "success": true,
  "data": {
    "url": "https://res.cloudinary.com/.../fl_attachment:..."",
    "filename": "lecture.pdf",
    "mimeType": "application/pdf",
    "size": 2097152,
    "expiresIn": 3600
  }
}
```

### Preview Response
```json
{
  "success": true,
  "data": {
    "type": "file",
    "url": "https://res.cloudinary.com/...",
    "mimeType": "application/pdf",
    "filename": "lecture.pdf",
    "extension": "pdf",
    "previewable": true,
    "expiresIn": 3600
  }
}
```

---

## Environment Setup
No new environment variables needed. Uses existing:
- `CLOUDINARY_CLOUD_NAME`
- `CLOUDINARY_API_KEY`
- `CLOUDINARY_API_SECRET`

---

## Testing Endpoints

### Create Assignment with File
```bash
POST /api/v1/batches/:batchId/assignments
Content-Type: multipart/form-data

file: (binary)
title: "Test Assignment"
maxMarks: 100
deadline: "2024-12-31T23:59:59Z"
```

### Update Assignment File
```bash
PUT /api/v1/assignments/:id
Content-Type: multipart/form-data

file: (binary)
```

### Download
```bash
GET /api/v1/assignments/:id/download
GET /api/v1/learning-materials/:id/download
GET /api/v1/submissions/:submissionId/files/:fileIndex/download
```

### Preview
```bash
GET /api/v1/assignments/:id/preview
GET /api/v1/learning-materials/:id/preview
GET /api/v1/submissions/:submissionId/files/:fileIndex/preview
```

---

## Status: ✅ COMPLETE

All functionality implemented and ready for use!
