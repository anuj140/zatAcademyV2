# Module System - Quick Reference Guide

## Quick Start

### 1. Creating a Complete Course with Modules (5 Steps)

#### Step 1: Create Course

```bash
curl -X POST http://localhost:5000/api/v1/courses \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "React Fundamentals",
    "description": "Learn React from basics to advanced",
    "fee": 299,
    "emiAmount": 30,
    "duration": 8,
    "durationUnit": "weeks"
  }'
# Response: { success: true, data: { _id: "course_123", ... } }
```

#### Step 2: Create First Module

```bash
curl -X POST http://localhost:5000/api/v1/modules \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "courseId": "course_123",
    "title": "Module 1: React Basics",
    "description": "Introduction to React fundamentals",
    "sequence": 1,
    "startDate": "2024-03-15",
    "endDate": "2024-03-21",
    "estimatedDuration": 8,
    "durationUnit": "hours",
    "learningObjectives": [
      "Understand React components",
      "Learn JSX syntax"
    ]
  }'
# Response: { success: true, data: { _id: "module_1", ... } }
```

#### Step 3: Schedule Live Lecture in Module

```bash
curl -X POST http://localhost:5000/api/v1/live-sessions \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "React Components Explained",
    "courseId": "course_123",
    "module": "module_1",
    "batchId": "batch_123",
    "instructorId": "instructor_123",
    "startTime": "2024-03-15T10:00:00Z",
    "endTime": "2024-03-15T11:30:00Z",
    "duration": 90,
    "sessionType": "lecture",
    "provider": "zoom",
    "meetingId": "zoom_123",
    "meetingPassword": "pass"
  }'
```

#### Step 4: Add Learning Materials to Module

```bash
curl -X POST http://localhost:5000/api/v1/learning-materials \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "title": "React Setup Guide",
    "description": "How to setup React dev environment",
    "courseId": "course_123",
    "module": "module_1",
    "batchId": "batch_123",
    "week": 1,
    "materialType": "article",
    "contentType": "lesson",
    "externalUrl": "https://react.dev/learn",
    "estimatedTime": 20,
    "difficulty": "beginner",
    "isPublished": true
  }'
```

#### Step 5: Publish Module & Course

```bash
# Publish Module
curl -X PUT http://localhost:5000/api/v1/modules/module_1/publish \
  -H "Authorization: Bearer TOKEN"

# Publish Course (with module validation)
curl -X PUT http://localhost:5000/api/v1/courses/course_123/publish-with-modules \
  -H "Authorization: Bearer TOKEN"
```

---

## Common Operations

### View Course Learning Path

```bash
curl http://localhost:5000/api/v1/courses/course_123/learning-path \
  -H "Authorization: Bearer TOKEN"

# Returns: All modules in sequence with content counts
```

### Check Module Status Before Publishing

```bash
curl http://localhost:5000/api/v1/courses/course_123/module-status \
  -H "Authorization: Bearer TOKEN"

# Returns: All modules, content counts, completeness %, can publish flag
```

### Get Module with All Its Content

```bash
curl http://localhost:5000/api/v1/modules/module_1 \
  -H "Authorization: Bearer TOKEN"

# Returns: Module details + live sessions + assignments + materials (all populated)
```

### List All Modules for a Course

```bash
curl http://localhost:5000/api/v1/modules/course/course_123 \
  -H "Authorization: Bearer TOKEN"

# Optional: ?populate=content (populates live sessions, assignments, materials)
# Optional: ?sort=-sequence (sort by sequence desc)
```

### Get Module Content Summary (Stats)

```bash
curl http://localhost:5000/api/v1/modules/module_1/content-summary \
  -H "Authorization: Bearer TOKEN"

# Returns: Module info + stats (upcoming sessions, completed sessions, published materials, etc)
```

### Add Content to Module (alternative method)

```bash
# Add a live session to module
curl -X PUT http://localhost:5000/api/v1/modules/module_1/add-content \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "contentType": "liveSession",
    "contentId": "session_123"
  }'

# Or add an assignment
curl -X PUT http://localhost:5000/api/v1/modules/module_1/add-content \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "contentType": "assignment",
    "contentId": "assignment_123"
  }'

# Or add learning material
curl -X PUT http://localhost:5000/api/v1/modules/module_1/add-content \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "contentType": "learningMaterial",
    "contentId": "material_123"
  }'
```

### Archive Old Module

```bash
curl -X PUT http://localhost:5000/api/v1/modules/module_1/archive \
  -H "Authorization: Bearer TOKEN"

# Module status changes to "archived", isPublished = false
```

### Delete Module (and all its content)

```bash
curl -X DELETE http://localhost:5000/api/v1/modules/module_1 \
  -H "Authorization: Bearer TOKEN"

# WARNING: Deletes all live sessions, assignments, materials in this module
```

---

## Important Fields Reference

### When Creating Module

Required:

- `courseId` - Parent course ID
- `title` - Module name
- `sequence` - Order number (1, 2, 3...)
- `startDate` - Module start (for live lectures)
- `endDate` - Module end

Optional:

- `description` - Module description
- `estimatedDuration` - Total hours/minutes
- `learningObjectives` - Array of learning goals

### When Creating Live Session

**IMPORTANT**: Must include `module` field

```javascript
{
  module: "module_id",  // REQUIRED - assign to module
  courseId: "course_id",
  batchId: "batch_id",
  title: "...",
  startTime: "...",
  endTime: "...",
  // ... other fields
}
```

### When Creating Assignment

**IMPORTANT**: Must include `module` field

```javascript
{
  module: "module_id",  // REQUIRED - changed from string to ObjectId
  courseId: "course_id",
  batchId: "batch_id",
  title: "...",
  week: 1,
  // ... other fields
}
```

### When Creating Learning Material

**IMPORTANT**: Must include `module` field

```javascript
{
  module: "module_id",  // REQUIRED - changed from string to ObjectId
  courseId: "course_id",
  batchId: "batch_id",
  title: "...",
  week: 1,
  // ... other fields
}
```

---

## Model Relationships

```
Course
  ├── modules: [Module]
  ├── totalModules: Number
  └── moduleStructureComplete: Boolean

Module
  ├── course: Course (required)
  ├── sequence: Number (unique per course)
  ├── startDate: Date
  ├── endDate: Date
  ├── liveSessions: [LiveSession]
  ├── assignments: [Assignment]
  ├── learningMaterials: [LearningMaterial]
  ├── contentCount: {
  │   ├── liveSessions: Number
  │   ├── assignments: Number
  │   └── learningMaterials: Number
  ├── status: "draft" | "published" | "archived"
  └── isPublished: Boolean

LiveSession
  ├── course: Course
  ├── module: Module (required)
  ├── startTime: Date
  └── endTime: Date

Assignment
  ├── course: Course
  ├── module: Module (required - ObjectId)
  ├── week: Number
  └── deadline: Date

LearningMaterial
  ├── course: Course
  ├── module: Module (required - ObjectId)
  ├── week: Number
  └── materialType: String
```

---

## Validation Rules

### Module Creation

1. ✅ Must belong to existing course
2. ✅ Sequence must be unique per course
3. ✅ End date must be after start date
4. ✅ Sequence typically starts from 1 and increments

### Module Publishing

1. ✅ Module must have at least ONE:
   - Live session, OR
   - Learning material
2. ✅ Assignments alone don't qualify for publishing
3. ✅ After publishing, students see the module

### Course Publishing

1. ✅ Course must have at least ONE published module
2. ✅ Use `/publish-with-modules` endpoint (not regular publish)
3. ✅ This sets `moduleStructureComplete = true`

### Live Session in Module

1. ✅ Must specify which module it belongs to
2. ✅ Session dates should be within module dates
3. ✅ Multiple sessions can be in same module

---

## Troubleshooting

### "Cannot publish module without content"

**Cause**: Module has no live sessions or learning materials
**Solution**: Add content first

```bash
# Option 1: Create live session
POST /api/v1/live-sessions with "module": "module_id"

# Option 2: Create learning material
POST /api/v1/learning-materials with "module": "module_id"
```

### "Cannot publish course without modules"

**Cause**: Course has no published modules
**Solution**:

1. Create modules first
2. Add content to modules
3. Publish modules
4. Then publish course

### "Module assignment failed"

**Cause**: Trying to assign module after creation
**Solution**: Either:

1. Add content during creation with full `module` reference, OR
2. Use `/add-content` endpoint to link existing content

### "Module not found"

**Cause**: Referenced module ID doesn't exist
**Solution**:

1. Create module first
2. Use correct module ID from creation response

---

## Utility Functions Usage

### In Your Code

```javascript
const {
  validateModuleForCourse,
  canPublishModule,
  getModuleContentOrganized,
  getCourseLearningPath,
  updateModuleContentCounts,
  validateModuleDateConsistency,
} = require("../utils/moduleUtils");

// Check if module can be published
const { canPublish, reason } = await canPublishModule(moduleId);
if (!canPublish) {
  return res.status(400).json({ error: reason });
}

// Get organized module content
const content = await getModuleContentOrganized(moduleId);
console.log(content.content.liveSessions);
console.log(content.content.assignments);

// Check course learning path
const path = await getCourseLearningPath(courseId);
// Returns all modules in sequence with content counts
```

---

## Complete Example: Adding Assignment to Module

```javascript
// 1. Check module exists and belongs to course
const module = await Module.findOne({
  _id: moduleId,
  course: courseId,
});
if (!module) {
  throw new Error("Module not found");
}

// 2. Create assignment with module reference
const assignment = await Assignment.create({
  title: "Build a React Todo App",
  description: "Create a todo application with React",
  course: courseId,
  module: moduleId, // IMPORTANT: Reference module ObjectId
  batch: batchId,
  week: 1,
  maxMarks: 100,
  deadline: "2024-03-21T23:59:59Z",
  submissionType: "file",
});

// 3. Update module content count
await updateModuleContentCounts(moduleId);

// 4. Assignment is now linked to module
// It will be returned when fetching module content
const fullModule = await Module.findById(moduleId).populate("assignments");
console.log(fullModule.assignments); // Will include this assignment
```

---

## Best Practices Checklist

- [ ] Always create course first
- [ ] Create modules in sequence order (1, 2, 3...)
- [ ] Set realistic start/end dates for modules
- [ ] Add at least one live session or material to each module
- [ ] Publish modules before publishing course
- [ ] Validate module structure using `/module-status` endpoint
- [ ] Set `estimatedDuration` for better UX
- [ ] Add `learningObjectives` for each module
- [ ] Use `/learning-path` to verify complete structure
- [ ] Regularly archive old modules (automatic or manual)
