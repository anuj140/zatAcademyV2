# Testing Guide - Learning Material Download & Preview

## Unit Tests

### Test Suite 1: Input Validation

```javascript
describe("validateMaterialId()", () => {
  it("should reject undefined material ID", () => {
    const result = validateMaterialId(undefined);
    expect(result.valid).toBe(false);
    expect(result.error).toContain("required");
  });

  it("should reject invalid ObjectId format", () => {
    const result = validateMaterialId("invalid-id");
    expect(result.valid).toBe(false);
    expect(result.error).toContain("Invalid");
  });

  it("should accept valid ObjectId", () => {
    const validId = new mongoose.Types.ObjectId();
    const result = validateMaterialId(validId);
    expect(result.valid).toBe(true);
  });
});
```

### Test Suite 2: Download Material

```javascript
describe("downloadMaterial()", () => {
  it("should return 400 for invalid material ID", async () => {
    const res = await request(app)
      .get("/api/v1/learning-materials/invalid-id/download")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("Invalid material ID format");
  });

  it("should return 401 for unauthenticated user", async () => {
    const materialId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/learning-materials/${materialId}/download`)
      .set("Authorization", "Bearer invalid-token");

    expect(res.status).toBe(401);
  });

  it("should return 404 for non-existent material", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const res = await request(app)
      .get(`/api/v1/learning-materials/${fakeId}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(404);
    expect(res.body.message).toContain("not found");
  });

  it("should return 400 if material has no file", async () => {
    // Create material without file
    const material = await LearningMaterial.create({
      title: "Test Material",
      batch: batchId,
      course: courseId,
      week: 1,
      module: moduleId,
      materialType: "article",
      createdBy: instructorId,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${instructorToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("does not have a file");
  });

  it("should return 403 if student material not published", async () => {
    const material = await createTestMaterial({ isPublished: false });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("not been published");
  });

  it("should return 403 if material not available yet", async () => {
    const futureDate = new Date();
    futureDate.setDate(futureDate.getDate() + 1);

    const material = await createTestMaterial({
      isPublished: true,
      availableFrom: futureDate,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("will be available from");
  });

  it("should return 403 if material availability expired", async () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);

    const material = await createTestMaterial({
      isPublished: true,
      availableUntil: pastDate,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toContain("no longer available");
  });

  it("should allow instructor to download unpublished material", async () => {
    const material = await createTestMaterial({
      isPublished: false,
      createdBy: instructorId,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${instructorToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("should increment download count", async () => {
    const material = await createTestMaterial({ isPublished: true });
    const initialCount = material.downloadCount;

    await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    const updated = await LearningMaterial.findById(material._id);
    expect(updated.downloadCount).toBe(initialCount + 1);
  });

  it("should set last downloaded timestamp", async () => {
    const material = await createTestMaterial({ isPublished: true });

    await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    const updated = await LearningMaterial.findById(material._id);
    expect(updated.lastDownloadedAt).toBeDefined();
    expect(updated.lastDownloadedAt).toBeInstanceOf(Date);
  });

  it("should return file URL and metadata", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      file: {
        url: "https://cloudinary.com/file.pdf",
        originalName: "test.pdf",
        size: 1024,
        mimeType: "application/pdf",
      },
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.fileUrl).toBe("https://cloudinary.com/file.pdf");
    expect(res.body.data.fileName).toBe("test.pdf");
    expect(res.body.data.fileSize).toBe(1024);
  });
});
```

### Test Suite 3: Preview Material

```javascript
describe("previewMaterial()", () => {
  it("should return preview data for PDF", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      materialType: "pdf",
      file: {
        url: "https://cloudinary.com/file.pdf",
        public_id: "alma-better/file",
        originalName: "test.pdf",
        size: 1024,
        mimeType: "application/pdf",
      },
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.file.previewUrl).toContain("w_800,h_1000");
    expect(res.body.data.file.canPreviewInline).toBe(true);
  });

  it("should include formatted duration for videos", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      materialType: "video",
      file: {
        url: "https://cloudinary.com/video.mp4",
        public_id: "alma-better/video",
        duration: 2700, // 45 minutes
      },
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.file.formattedDuration).toBe("45:00");
  });

  it("should include quiz info for quizzes", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      materialType: "quiz",
      quizQuestions: [
        { question: "Q1", options: ["A", "B"], correctAnswer: "A", points: 10 },
        { question: "Q2", options: ["A", "B"], correctAnswer: "B", points: 10 },
      ],
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.quizInfo.totalQuestions).toBe(2);
    expect(res.body.data.quizInfo.totalPoints).toBe(20);
  });

  it("should return 400 if quiz has no questions", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      materialType: "quiz",
      quizQuestions: [],
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(400);
    expect(res.body.message).toContain("no questions");
  });

  it("should increment preview count", async () => {
    const material = await createTestMaterial({ isPublished: true });
    const initialCount = material.previewCount;

    await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    const updated = await LearningMaterial.findById(material._id);
    expect(updated.previewCount).toBe(initialCount + 1);
  });

  it("should include formatted estimated time", async () => {
    const material = await createTestMaterial({
      isPublished: true,
      estimatedTime: 45,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.formattedEstimatedTime).toBe("45 minutes");
  });
});
```

### Test Suite 4: Material Statistics

```javascript
describe("getMaterialStatistics()", () => {
  it("should return engagement score", async () => {
    const material = await createTestMaterial({
      viewCount: 10,
      previewCount: 5,
      downloadCount: 3,
      completionCount: 2,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/statistics`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    // Score = (10*1) + (5*2) + (3*3) + (2*5) = 10 + 10 + 9 + 10 = 39
    expect(res.body.data.engagementScore).toBe(39);
  });

  it("should classify engagement level as low", async () => {
    const material = await createTestMaterial({
      viewCount: 2,
      previewCount: 1,
      downloadCount: 1,
      completionCount: 0,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/statistics`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.body.data.engagementLevel).toBe("low");
  });

  it("should classify engagement level as high", async () => {
    const material = await createTestMaterial({
      viewCount: 30,
      previewCount: 20,
      downloadCount: 15,
      completionCount: 10,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/statistics`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.body.data.engagementLevel).toBe("high");
  });

  it("should include last activity timestamps", async () => {
    const now = new Date();
    const material = await createTestMaterial({
      lastDownloadedAt: now,
      lastPreviewedAt: now,
    });

    const res = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/statistics`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.lastDownloadedAt).toBeDefined();
    expect(res.body.data.lastPreviewedAt).toBeDefined();
  });
});
```

### Test Suite 5: Helper Functions

```javascript
describe("Helper Functions", () => {
  describe("formatDuration()", () => {
    it("should format seconds to MM:SS", () => {
      expect(formatDuration(150)).toBe("2:30");
      expect(formatDuration(90)).toBe("1:30");
      expect(formatDuration(45)).toBe("0:45");
    });

    it("should format seconds to HH:MM:SS for hours", () => {
      expect(formatDuration(3725)).toBe("1:02:05");
      expect(formatDuration(7200)).toBe("2:00:00");
    });

    it("should handle null/invalid input", () => {
      expect(formatDuration(null)).toBe("0:00");
      expect(formatDuration(undefined)).toBe("0:00");
      expect(formatDuration("invalid")).toBe("0:00");
    });
  });

  describe("getEngagementLevel()", () => {
    it("should classify low engagement", () => {
      const material = {
        viewCount: 1,
        previewCount: 1,
        downloadCount: 0,
        completionCount: 0,
      };
      expect(getEngagementLevel(material)).toBe("low");
    });

    it("should classify moderate engagement", () => {
      const material = {
        viewCount: 10,
        previewCount: 10,
        downloadCount: 5,
        completionCount: 3,
      };
      expect(getEngagementLevel(material)).toBe("moderate");
    });

    it("should classify high engagement", () => {
      const material = {
        viewCount: 50,
        previewCount: 30,
        downloadCount: 20,
        completionCount: 15,
      };
      expect(getEngagementLevel(material)).toBe("high");
    });

    it("should classify very high engagement", () => {
      const material = {
        viewCount: 100,
        previewCount: 80,
        downloadCount: 50,
        completionCount: 40,
      };
      expect(getEngagementLevel(material)).toBe("very-high");
    });
  });

  describe("getCloudinaryPreviewUrl()", () => {
    it("should generate PDF preview URL", () => {
      const url = getCloudinaryPreviewUrl("file-123", "pdf");
      expect(url).toContain("w_800,h_1000,c_limit");
      expect(url).toContain("file-123");
    });

    it("should generate image preview URL", () => {
      const url = getCloudinaryPreviewUrl("img-456", "image");
      expect(url).toContain("w_800,h_600,c_limit,q_auto");
    });

    it("should generate video preview URL", () => {
      const url = getCloudinaryPreviewUrl("vid-789", "video");
      expect(url).toContain("w_800,h_600,c_limit,so_0");
    });

    it("should return null for missing publicId", () => {
      expect(getCloudinaryPreviewUrl(null, "pdf")).toBeNull();
      expect(getCloudinaryPreviewUrl(undefined, "pdf")).toBeNull();
    });

    it("should return null for missing materialType", () => {
      expect(getCloudinaryPreviewUrl("file-123", null)).toBeNull();
    });
  });
});
```

## Integration Tests

```javascript
describe("Learning Material Download & Preview Integration", () => {
  it("should handle complete download flow", async () => {
    // 1. Create material
    const material = await createTestMaterial({ isPublished: true });

    // 2. Download material (increments counter)
    const downloadRes = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(downloadRes.status).toBe(200);

    // 3. Verify counter incremented
    const updated = await LearningMaterial.findById(material._id);
    expect(updated.downloadCount).toBe(1);

    // 4. Check statistics
    const statsRes = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/statistics`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(statsRes.body.data.downloadCount).toBe(1);
  });

  it("should handle complete preview flow with quiz", async () => {
    // 1. Create quiz
    const quiz = await createTestMaterial({
      isPublished: true,
      materialType: "quiz",
      quizQuestions: [
        { question: "Q1", options: ["A", "B"], correctAnswer: "A", points: 10 },
      ],
    });

    // 2. Preview quiz
    const previewRes = await request(app)
      .get(`/api/v1/learning-materials/${quiz._id}/preview`)
      .set("Authorization", `Bearer ${studentToken}`);

    expect(previewRes.status).toBe(200);
    expect(previewRes.body.data.quizInfo.totalQuestions).toBe(1);
  });

  it("should respect role-based access", async () => {
    const material = await createTestMaterial({ isPublished: false });

    // Student cannot download unpublished
    const studentRes = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${studentToken}`);
    expect(studentRes.status).toBe(403);

    // Instructor (creator) can download unpublished
    const instructorRes = await request(app)
      .get(`/api/v1/learning-materials/${material._id}/download`)
      .set("Authorization", `Bearer ${instructorToken}`);
    expect(instructorRes.status).toBe(200);
  });
});
```

## Manual Testing

### Using cURL:

```bash
# Set variables
TOKEN="your_jwt_token"
MATERIAL_ID="507f1f77bcf86cd799439011"
BASE="http://localhost:5000/api/v1"

# Test 1: Invalid material ID
curl -X GET "${BASE}/learning-materials/invalid/download" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 400, "Invalid material ID format"

# Test 2: Missing authentication
curl -X GET "${BASE}/learning-materials/${MATERIAL_ID}/download"
# Expected: 401 or 403

# Test 3: Non-existent material
curl -X GET "${BASE}/learning-materials/507f1f77bcf86cd799439999/download" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 404, "Learning material not found"

# Test 4: Valid download
curl -X GET "${BASE}/learning-materials/${MATERIAL_ID}/download" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200, file metadata

# Test 5: Preview material
curl -X GET "${BASE}/learning-materials/${MATERIAL_ID}/preview" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200, preview data

# Test 6: Get statistics
curl -X GET "${BASE}/learning-materials/${MATERIAL_ID}/statistics" \
  -H "Authorization: Bearer ${TOKEN}"
# Expected: 200, engagement metrics
```

## Test Coverage Goals

- [ ] Input validation: 100%
- [ ] Error handling paths: 100%
- [ ] Role-based access: 100%
- [ ] Availability checking: 100%
- [ ] Counter increments: 100%
- [ ] Helper functions: 100%
- [ ] Integration flows: 95%+

## Common Issues & Solutions

| Issue                           | Cause                     | Solution                      |
| ------------------------------- | ------------------------- | ----------------------------- |
| 400 Invalid ID                  | Malformed MongoDB ID      | Use valid 24-char hex string  |
| 403 Not authorized              | Not enrolled              | Enroll student in batch first |
| 404 Not found                   | Material deleted          | Create test material          |
| Download count not incrementing | Save failed silently      | Check error logs              |
| Preview URL null                | Cloudinary config missing | Set CLOUDINARY_CLOUD_NAME env |
