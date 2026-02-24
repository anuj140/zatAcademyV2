# Module Functionality Documentation

## Overview

The module functionality organizes course content into sequential modules. Each module is a logical unit within a course that contains:

- **Live Lectures** (scheduled live sessions with instructors)
- **Learning Materials** (videos, PDFs, articles, quizzes)
- **Assignments** (coursework with deadlines)

## Why Modules?

1. **Structured Learning Path**: Courses are organized sequentially by modules
2. **Prerequisite Management**: Students must progress through modules in order
3. **Time-Boxed Content**: Each module has start/end dates for live lectures
4. **Content Organization**: All course content (live sessions, materials, assignments) belongs to a specific module
5. **Publishing Control**: Modules can be published independently
6. **Progress Tracking**: Students track progress across modules

## Core Models

### 1. Module Model (`src/models/Module.js`)

```javascript
{
  title: String,                    // Module name
  description: String,              // Module description
  course: ObjectId (ref: Course),   // Parent course
  sequence: Number,                 // Module order (1, 2, 3...)
  estimatedDuration: Number,        // Total hours/minutes
  durationUnit: String,             // "hours" or "minutes"
  status: String,                   // "draft", "published", "archived"
  startDate: Date,                  // Module starts (for live lectures)
  endDate: Date,                    // Module ends
  learningObjectives: [String],     // What students will learn

  // Content references
  liveSessions: [ObjectId],         // All live lectures in module
  learningMaterials: [ObjectId],    // All materials in module
  assignments: [ObjectId],          // All assignments in module

  // Content counts
  contentCount: {
    liveSessions: Number,
    learningMaterials: Number,
    assignments: Number
  },

  // Publishing
  isPublished: Boolean,
  publishedAt: Date,
  createdBy: ObjectId (ref: User),
  createdAt: Date,
  updatedAt: Date
}
```

### 2. Updated Models

#### Course Model

- **New Field**: `modules: [ObjectId]` - Array of module references
- **New Field**: `totalModules: Number` - Count of modules
- **New Field**: `moduleStructureComplete: Boolean` - Flag for publishing validation

#### LiveSession Model

- **New Field**: `module: ObjectId (required)` - Must belong to a module
- **Logic**: Before scheduling a live lecture, the module must exist

#### Assignment Model

- **Changed**: `module: String` → `module: ObjectId (required)` - Must reference a module

#### LearningMaterial Model

- **Changed**: `module: String` → `module: ObjectId (required)` - Must reference a module

## API Endpoints

### Module Management Routes (`/api/v1/modules`)

#### 1. Create Module

```
POST /api/v1/modules
Authorization: Required (Admin/SuperAdmin)

Request Body:
{
  "courseId": "course_id",
  "title": "Week 1: JavaScript Basics",
  "description": "Introduction to JavaScript fundamentals",
  "sequence": 1,
  "startDate": "2024-03-01",
  "endDate": "2024-03-07",
  "estimatedDuration": 12,
  "durationUnit": "hours",
  "learningObjectives": ["Understand variables", "Learn data types"]
}

Response: 201 Created
{
  "success": true,
  "data": { module object }
}
```

#### 2. Get Modules by Course

```
GET /api/v1/modules/course/:courseId
Query Params:
  - populate=content (or 'instructor')
  - sort=-sequence (optional)

Response: 200 OK
{
  "success": true,
  "count": 5,
  "data": [
    {
      "_id": "module_id",
      "title": "Week 1: JavaScript Basics",
      "sequence": 1,
      "status": "published",
      "contentCount": {
        "liveSessions": 2,
        "learningMaterials": 5,
        "assignments": 1
      }
    }
  ]
}
```

#### 3. Get Single Module with Content

```
GET /api/v1/modules/:id

Response: 200 OK
{
  "success": true,
  "data": {
    "_id": "module_id",
    "title": "Week 1",
    "sequence": 1,
    "liveSessions": [
      {
        "_id": "session_id",
        "title": "JavaScript Fundamentals",
        "startTime": "2024-03-01T10:00:00Z",
        "instructor": { "_id": "user_id", "name": "John Doe" },
        "joinUrl": "..."
      }
    ],
    "assignments": [...],
    "learningMaterials": [...]
  }
}
```

#### 4. Update Module

```
PUT /api/v1/modules/:id
Authorization: Required (Admin/SuperAdmin)

Request Body:
{
  "title": "Updated Title",
  "description": "Updated description",
  "startDate": "2024-03-01",
  "endDate": "2024-03-08",
  "estimatedDuration": 15
}

Response: 200 OK
```

#### 5. Publish Module

```
PUT /api/v1/modules/:id/publish
Authorization: Required (Admin/SuperAdmin)

Response: 200 OK
{
  "success": true,
  "message": "Module published successfully",
  "data": { module object with status: "published" }
}

Note: Module must have at least one piece of content to publish
```

#### 6. Archive Module

```
PUT /api/v1/modules/:id/archive
Authorization: Required (Admin/SuperAdmin)

Response: 200 OK
{
  "success": true,
  "message": "Module archived successfully"
}
```

#### 7. Add Content to Module

```
PUT /api/v1/modules/:id/add-content
Authorization: Required (Admin/SuperAdmin)

Request Body:
{
  "contentType": "liveSession" | "assignment" | "learningMaterial",
  "contentId": "content_id"
}

Response: 200 OK
```

#### 8. Get Module Content Summary

```
GET /api/v1/modules/:id/content-summary

Response: 200 OK
{
  "success": true,
  "module": {
    "id": "module_id",
    "title": "Week 1",
    "sequence": 1,
    "status": "published"
  },
  "stats": {
    "totalLiveSessions": 2,
    "upcomingLiveSessions": 1,
    "completedLiveSessions": 1,
    "totalAssignments": 2,
    "activeAssignments": 2,
    "totalLearningMaterials": 5,
    "publishedMaterials": 5,
    "totalEstimatedTime": 480
  }
}
```

#### 9. Delete Module

```
DELETE /api/v1/modules/:id
Authorization: Required (Admin/SuperAdmin)

Response: 200 OK
{
  "success": true,
  "message": "Module deleted successfully"
}

Note: Deletes all associated content (live sessions, assignments, materials)
```

### Enhanced Course Routes

#### 1. Get Course Learning Path

```
GET /api/v1/courses/:id/learning-path

Response: 200 OK
{
  "success": true,
  "data": {
    "course": {
      "id": "course_id",
      "title": "Web Development Bootcamp",
      "totalModules": 12
    },
    "learningPath": [
      {
        "_id": "module_id",
        "title": "Module 1",
        "sequence": 1,
        "status": "published",
        "contentCount": { ... },
        "upcomingLiveSessions": 1
      }
    ]
  }
}
```

#### 2. Get Course Module Status

```
GET /api/v1/courses/:id/module-status
Authorization: Required (Admin/SuperAdmin)

Response: 200 OK
{
  "success": true,
  "data": {
    "courseId": "course_id",
    "courseTitle": "Web Development",
    "moduleSummary": {
      "totalModules": 12,
      "publishedModules": 8,
      "activeModules": 8,
      "completenessPercentage": 67
    },
    "contentSummary": {
      "totalContent": 156
    },
    "modules": [ ... ],
    "canPublish": true,
    "publishWarnings": []
  }
}
```

#### 3. Publish Course with Modules

```
PUT /api/v1/courses/:id/publish-with-modules
Authorization: Required (Admin/SuperAdmin)

Response: 200 OK
{
  "success": true,
  "message": "Course published successfully with all modules",
  "data": {
    "course": { ... },
    "activeModules": 8
  }
}

Requirement: Course must have at least one published module
```

## Workflow: Creating a Course with Modules

### Step 1: Create Course

```bash
POST /api/v1/courses
{
  "title": "Web Development Bootcamp",
  "description": "Learn web development from scratch",
  "fee": 500,
  "emiAmount": 50,
  "duration": 12,
  "durationUnit": "months",
  "category": "web-dev"
}
```

### Step 2: Create Modules (Sequential)

```bash
POST /api/v1/modules
{
  "courseId": "course_id",
  "title": "Module 1: HTML Basics",
  "sequence": 1,
  "startDate": "2024-03-01",
  "endDate": "2024-03-07",
  "learningObjectives": ["Learn HTML structure", "Create web pages"]
}

POST /api/v1/modules
{
  "courseId": "course_id",
  "title": "Module 2: CSS Styling",
  "sequence": 2,
  "startDate": "2024-03-08",
  "endDate": "2024-03-14"
}
```

### Step 3: Add Live Lectures to Modules

```bash
POST /api/v1/live-sessions
{
  "courseId": "course_id",
  "module": "module_id",           # MUST be a module
  "title": "HTML Fundamentals Live Class",
  "batch": "batch_id",
  "instructor": "instructor_id",
  "startTime": "2024-03-01T10:00:00Z",
  "endTime": "2024-03-01T11:30:00Z",
  "duration": 90,
  "provider": "zoom",
  "meetingId": "zoom_meeting_id"
}
```

### Step 4: Add Learning Materials to Modules

```bash
POST /api/v1/learning-materials
{
  "courseId": "course_id",
  "module": "module_id",           # MUST be a module
  "title": "HTML Tags Tutorial",
  "materialType": "video",
  "contentType": "lesson",
  "estimatedTime": 25,
  "isPublished": true
}
```

### Step 5: Add Assignments to Modules

```bash
POST /api/v1/assignments
{
  "courseId": "course_id",
  "module": "module_id",           # MUST be a module
  "title": "Build Your First Web Page",
  "week": 1,
  "maxMarks": 100,
  "deadline": "2024-03-07T23:59:59Z",
  "submissionType": "both"
}
```

### Step 6: Publish Modules

```bash
PUT /api/v1/modules/module_id/publish
```

### Step 7: Publish Course

```bash
PUT /api/v1/courses/course_id/publish-with-modules
```

## Key Business Logic

### 1. Module Publishing Rules

- ✅ Module can be published only if it has content (live session OR learning material)
- ✅ Assignments alone cannot qualify for publishing
- ✅ Modules are published independently from course

### 2. Live Session Scheduling

- ✅ Live sessions MUST be assigned to a module
- ✅ Session dates must fall within module dates
- ✅ Multiple sessions can be in the same module

### 3. Course Publishing

- ✅ Course can only be published if it has at least one published module
- ✅ Publishing course marks `moduleStructureComplete = true`
- ✅ Old modules (endDate passed) are automatically archived

### 4. Content Organization

- ✅ All content (live sessions, materials, assignments) must reference a module
- ✅ Module tracks content counts automatically
- ✅ Deleted modules cascade delete all their content

### 5. Student Learning Path

- ✅ Students see course modules in sequence
- ✅ Progress is tracked per module
- ✅ Modules show upcoming live lectures
- ✅ Materials are organized by module

## Utility Functions (`src/utils/moduleUtils.js`)

### Available Helper Functions

1. `validateModuleForCourse(moduleId, courseId)` - Verify module belongs to course
2. `updateModuleContentCounts(moduleId)` - Refresh content counts
3. `canPublishModule(moduleId)` - Check publishing eligibility
4. `getModuleContentOrganized(moduleId)` - Get organized content by type
5. `getCourseLearningPath(courseId)` - Get full learning path structure
6. `autoArchiveCompletedModules(courseId)` - Archive old modules
7. `validateModuleDateConsistency(moduleId)` - Validate date ranges
8. `calculateModuleEstimatedDuration(moduleId)` - Calculate total duration

## Example Workflow: Admin Perspective

1. **Create Course** → Sets basic course info
2. **Create Module 1** → Week 1 content (sequence: 1, startDate: Mar 1)
3. **Create Live Lecture** → Schedule for March 1, 10 AM in Module 1
4. **Create Learning Material** → Add video tutorial to Module 1
5. **Create Assignment** → Add homework to Module 1
6. **Publish Module 1** → Now it's visible and students can access
7. **Repeat Steps 2-6** → For Module 2, 3, etc.
8. **Publish Course** → Makes entire course visible to enrollment
9. **Monitor Progress** → See student completion rates per module

## Example Workflow: Student Perspective

1. **Enroll in Course** → Gets access to active/published modules
2. **View Learning Path** → See all modules in sequence
3. **Join Module 1** → Access live lectures, materials, assignments
4. **Attend Live Lecture** → Join zoom meeting scheduled for module
5. **Complete Materials** → Watch videos, read documents
6. **Submit Assignment** → Upload or take quiz by deadline
7. **Move to Module 2** → After Module 1 completion (optional progression)
8. **Track Progress** → See completion percentage per module

## Error Handling

### Common Errors

1. **Missing Module Reference**
   - Error: Cannot create live session without module
   - Solution: Create module first, then add content

2. **Invalid Date Range**
   - Error: End date must be after start date
   - Solution: Verify date ordering

3. **Cannot Publish Module**
   - Error: Module must have at least one piece of content
   - Solution: Add live session or learning material

4. **Cannot Publish Course**
   - Error: Course must have at least one published module
   - Solution: Create and publish modules first

5. **Module Not Found**
   - Error: Referenced module does not exist
   - Solution: Create module or use correct module ID

## Migration Notes

### For Existing Data

If migrating from previous system:

1. Create modules based on existing week numbers
2. Map existing live sessions to modules by week
3. Map assignments to modules by week
4. Map learning materials to modules
5. Validate date consistency
6. Publish modules that have content
7. Update course publishing status

### Code Changes Required

- LiveSession creation now requires `module` field
- Assignment model uses ObjectId for `module` (was string)
- LearningMaterial model uses ObjectId for `module` (was string)
- Course now tracks modules and total module count

## Best Practices

1. **Always Create Modules First** → Never add content without a module
2. **Sequence Matters** → Keep module sequences consistent and gapless
3. **Date Alignment** → Ensure content dates align with module dates
4. **Publish Modules Before Course** → Validate module structure before publishing course
5. **Regular Archiving** → Automatically archive old modules to keep interface clean
6. **Content Validation** → Use module status checks before student access
7. **Progress Tracking** → Monitor module completion rates to measure course effectiveness

## Testing

### Test Cases

1. Create module with all required fields
2. Add live session to module with date validation
3. Add assignment with proper deadline
4. Add learning material with completion tracking
5. Publish module with content validation
6. Archive module with old end date
7. Delete module and verify cascade delete
8. Publish course with module validation
9. Get learning path and verify sequence
10. Update module and verify timestamp
