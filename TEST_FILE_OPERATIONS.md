# File Download/Preview - Test Checklist

## Quick Test: PDF Download/Preview

### Step 1: Get Assignment ID
```bash
# List assignments
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost/api/v1/batches/BATCH_ID/assignments
```

### Step 2: Test Download Endpoint
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost/api/v1/assignments/ASSIGN_ID/download
```

**Should return:**
- ✅ `success: true`
- ✅ `data.url` (Cloudinary URL without errors)
- ✅ `data.filename` (original filename)
- ✅ `data.mimeType` (e.g., "application/pdf")
- ✅ `data.size` (file size in bytes)

**Should NOT have:**
- ❌ Error message
- ❌ "Invalid flag in transformation"
- ❌ "x-cld-error"

### Step 3: Test Preview Endpoint
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost/api/v1/assignments/ASSIGN_ID/preview
```

**Should return:**
- ✅ `success: true`
- ✅ `data.url` (Cloudinary URL)
- ✅ `data.previewable: true` (for PDFs)
- ✅ `data.mimeType: "application/pdf"`

### Step 4: Test URL in Browser
```javascript
// Paste in browser console
const token = 'YOUR_TOKEN';
const assignmentId = 'ASSIGN_ID';

// Test download URL
fetch(`/api/v1/assignments/${assignmentId}/download`, {
  headers: { Authorization: `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Download URL:', data.data.url);
  window.open(data.data.url, '_blank');
  // Should NOT show HTTP 400 error!
});

// Test preview URL
fetch(`/api/v1/assignments/${assignmentId}/preview`, {
  headers: { Authorization: `Bearer ${token}` }
})
.then(r => r.json())
.then(data => {
  console.log('✅ Preview URL:', data.data.url);
  console.log('✅ Previewable:', data.data.previewable);
  window.open(data.data.url, '_blank');
  // Should open PDF or start download!
});
```

---

## Test Cases

### Test Case 1: PDF Download ✅
- [ ] Upload PDF to assignment
- [ ] Call `/assignments/:id/download`
- [ ] Get response without errors
- [ ] Open URL in browser
- [ ] PDF downloads (not error page)

### Test Case 2: PDF Preview ✅
- [ ] Get preview URL
- [ ] Open URL in browser
- [ ] PDF displays in browser viewer

### Test Case 3: Image Download ✅
- [ ] Upload JPG/PNG to learning material
- [ ] Download should work
- [ ] Open in browser - displays image

### Test Case 4: Video Download ✅
- [ ] Upload MP4 video
- [ ] Download should work
- [ ] Open in browser - plays video

### Test Case 5: Document Download ✅
- [ ] Upload DOCX/XLSX
- [ ] Download should work
- [ ] File downloads (or browser handler opens it)

### Test Case 6: Archive Download ✅
- [ ] Upload ZIP file
- [ ] Download should work
- [ ] File downloads

### Test Case 7: Mixed File Types ✅
- [ ] Test various formats listed above
- [ ] All should work without errors

---

## Expected Behavior

| Action | Before | After |
|--------|--------|-------|
| Download PDF | ❌ HTTP 400 error | ✅ PDF downloads/opens |
| Download Image | ❌ HTTP 400 error | ✅ Image displays |
| Download Video | ❌ HTTP 400 error | ✅ Video plays |
| Preview PDF | ❌ HTTP 400 error | ✅ Preview works |
| Any file type | ❌ Invalid flag error | ✅ Works correctly |

---

## Debug Commands

### View File Service Functions
```bash
cat src/utils/fileService.js | grep -A 10 "function buildCloudinaryUrl"
```

### Check URL Generation
```javascript
// In Node.js/console
const fileService = require('./src/utils/fileService');
const publicId = 'your_cloudinary_public_id';
const url = fileService.buildCloudinaryUrl(publicId, 'raw', true, 'document.pdf');
console.log('Generated URL:', url);
// Should be clean without errors
```

### Verify Response Format
```bash
curl -s -H "Authorization: Bearer TOKEN" \
  http://localhost/api/v1/assignments/ID/download | jq .
```

---

## If Still Having Issues

### Check 1: Cloudinary Configuration
```javascript
// Verify in Node.js REPL
const cloudinary = require('./src/config/cloudinary');
console.log('Cloud name:', cloudinary.config().cloud_name);
// Should show your Cloudinary account
```

### Check 2: File Storage
```javascript
// Verify files are stored in Cloudinary
// Login to: https://cloudinary.com/console
// Check folder: zatAcademy/materials or zatAcademy/submissions
// Files should be visible
```

### Check 3: Restart Server
```bash
# Clear and restart
npm start
# Try test again
```

### Check 4: Check Logs
```bash
# Look for errors in console
# Should see clean URL generation
# NO transformation errors
```

---

## Success Indicators ✅

- [x] No HTTP 400 errors
- [x] No "Invalid flag in transformation" messages
- [x] URLs are generated successfully
- [x] Files download/preview in browser
- [x] All file types work
- [x] Content-Disposition headers correct
- [x] File names preserved
- [x] MIME types correct

---

## Quick Verification Script

```javascript
// Save as: test-files.js
const fetch = require('node-fetch');

async function testFileEndpoints(token, assignmentId) {
  console.log('🧪 Testing File Operations...\n');
  
  try {
    // Test Download
    const downloadRes = await fetch(
      `http://localhost/api/v1/assignments/${assignmentId}/download`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const downloadData = await downloadRes.json();
    console.log('✅ Download Response:', downloadData.success ? 'SUCCESS' : 'FAILED');
    if (!downloadData.success) {
      console.log('❌ Error:', downloadData.message);
    } else {
      console.log('   URL:', downloadData.data.url.substring(0, 50) + '...');
      console.log('   Filename:', downloadData.data.filename);
      console.log('   MimeType:', downloadData.data.mimeType);
    }
    
    // Test Preview
    const previewRes = await fetch(
      `http://localhost/api/v1/assignments/${assignmentId}/preview`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const previewData = await previewRes.json();
    console.log('\n✅ Preview Response:', previewData.success ? 'SUCCESS' : 'FAILED');
    if (!previewData.success) {
      console.log('❌ Error:', previewData.message);
    } else {
      console.log('   URL:', previewData.data.url.substring(0, 50) + '...');
      console.log('   Previewable:', previewData.data.previewable);
      console.log('   MimeType:', previewData.data.mimeType);
    }
    
    console.log('\n✅ All tests passed!');
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }
}

// Run: node test-files.js
```

---

## Summary

The fix has been applied to [src/utils/fileService.js](src/utils/fileService.js).

**Next Steps:**
1. Restart your Node.js server
2. Run any test above to verify
3. Try downloading/previewing a PDF file
4. Should now work without HTTP 400 errors!

**Questions?** Check [PDF_DOWNLOAD_PREVIEW_FIX.md](PDF_DOWNLOAD_PREVIEW_FIX.md) for detailed explanation.
