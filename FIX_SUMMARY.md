# Fix Summary: Cast to ObjectId Error in Module Curriculum

## Problem

When accessing the endpoint `/api/v1/modules/courses/:courseId/batches/:batchId/curriculum` with a user role, the following error occurred:

```
Cast to ObjectId failed for value "{_id: new ObjectId(...), title: 'Live session 2', ...}" (type string) at path "assignment" for model "Submission"
```

The error did NOT occur for admin and superAdmin roles.

## Root Cause

The issue was in the `src/models/Module.js` file in both `getCourseCurriculum` and `getModuleCurriculum` static methods:

1. The code populates the `items.itemId` field, converting it from a reference to the actual object
2. After populate, `item.itemId` becomes an object like: `{ _id: ObjectId, title: "...", instructor: ObjectId, ... }`
3. When this populated object was used directly in MongoDB queries, it got stringified as the entire object
4. MongoDB tried to cast this stringified object to an ObjectId, causing the error

The issue primarily affected user/student roles because they trigger the `studentId` code path which uses the populated items in queries.

## Solution Applied

Made four targeted fixes in `src/models/Module.js`:

### 1. Fixed `getCourseCurriculum` - Line 312

**Before:**

```javascript
const moduleItemIds = module.items.map((item) => item.itemId.toString());
```

**After:**

```javascript
const moduleItemIds = module.items.map((item) => {
  // Handle both populated objects and plain ObjectIds
  if (typeof item.itemId === "object" && item.itemId._id) {
    return item.itemId._id;
  }
  return item.itemId;
});
```

### 2. Fixed `getModuleCurriculum` - Assignment Query (Line 475)

**Before:**

```javascript
const submission = await Submission.findOne({
  student: studentId,
  assignment: item.itemId, // Could be a populated object
});
```

**After:**

```javascript
const assignmentId =
  typeof item.itemId === "object" && item.itemId._id ? item.itemId._id : item.itemId;
const submission = await Submission.findOne({
  student: studentId,
  assignment: assignmentId,
});
```

### 3. Fixed `getModuleCurriculum` - LearningMaterial Comparison (Line 465)

**Before:**

```javascript
const materialProgress = progress?.materialProgress?.find(
  (mp) => mp.material.toString() === item.itemId.toString(),
);
```

**After:**

```javascript
const itemIdStr =
  typeof item.itemId === "object" && item.itemId._id
    ? item.itemId._id.toString()
    : item.itemId.toString();
const materialProgress = progress?.materialProgress?.find(
  (mp) => mp.material.toString() === itemIdStr,
);
```

### 4. Fixed `getModuleCurriculum` - LiveSession Comparison (Line 489)

**Before:**

```javascript
const sessionAttendance = progress?.sessionAttendance?.find(
  (sa) => sa.session.toString() === item.itemId.toString(),
);
```

**After:**

```javascript
const itemIdStr =
  typeof item.itemId === "object" && item.itemId._id
    ? item.itemId._id.toString()
    : item.itemId.toString();
const sessionAttendance = progress?.sessionAttendance?.find(
  (sa) => sa.session.toString() === itemIdStr,
);
```

## Why This Works

- When `item.itemId` is a populated object, we extract the `._id` property which is the actual ObjectId
- When `item.itemId` is a plain reference (not populated), we use it as-is
- This ensures MongoDB receives proper ObjectId values instead of stringified objects
- The fix handles both scenarios gracefully

## Testing

To verify the fix works:

1. Start the development server: `npm run dev`
2. Make a request to the curriculum endpoint as a user role:
   ```
   GET /api/v1/modules/courses/:courseId/batches/:batchId/curriculum
   ```
3. The endpoint should now work without throwing a Cast to ObjectId error

The endpoint should now work consistently for all user roles (user, instructor, admin, superAdmin).
