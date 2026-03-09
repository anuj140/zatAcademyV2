# Batch Selection in Enrollment Form

## Overview
The enrollment process now supports selecting from available batches for a specific course before enrollment. This allows students to choose their preferred batch based on schedule, timing, and availability.

## API Endpoints

### 1. Get Available Batches for a Course
**Endpoint:** `GET /api/v1/enrollments/batches/course/:courseId`

**Access:** Private/Student (requires authentication)

**Description:** Fetches all available batches for a specific course that the student can enroll in.

**Parameters:**
- `courseId` (path): ID of the course

**Response:**
```json
{
  "success": true,
  "count": 3,
  "data": {
    "course": {
      "id": "507f1f77bcf86cd799439011",
      "title": "Advanced JavaScript",
      "description": "Learn advanced JavaScript concepts...",
      "fee": 15000,
      "emiAmount": 5000,
      "thumbnail": "https://..."
    },
    "batches": [
      {
        "id": "507f1f77bcf86cd799439012",
        "name": "Batch A - Jan 2026",
        "startDate": "2026-01-15T09:00:00Z",
        "endDate": "2026-03-15T09:00:00Z",
        "schedule": [
          {
            "day": "monday",
            "startTime": "09:00",
            "endTime": "11:00"
          },
          {
            "day": "wednesday",
            "startTime": "09:00",
            "endTime": "11:00"
          }
        ],
        "instructor": {
          "_id": "507f1f77bcf86cd799439013",
          "name": "John Doe",
          "email": "john@example.com"
        },
        "maxStudents": 50,
        "currentStudents": 35,
        "availableSeats": 15,
        "isEnrolled": false
      },
      {
        "id": "507f1f77bcf86cd799439014",
        "name": "Batch B - Feb 2026",
        "startDate": "2026-02-01T14:00:00Z",
        "endDate": "2026-04-01T14:00:00Z",
        "schedule": [
          {
            "day": "tuesday",
            "startTime": "14:00",
            "endTime": "16:00"
          },
          {
            "day": "thursday",
            "startTime": "14:00",
            "endTime": "16:00"
          }
        ],
        "instructor": {
          "_id": "507f1f77bcf86cd799439015",
          "name": "Jane Smith",
          "email": "jane@example.com"
        },
        "maxStudents": 50,
        "currentStudents": 40,
        "availableSeats": 10,
        "isEnrolled": false
      }
    ]
  }
}
```

### 2. Enroll in a Batch
**Endpoint:** `POST /api/v1/enrollments`

**Access:** Private/Student (requires authentication)

**Description:** Creates an enrollment for a student in a selected batch.

**Request Body:**
```json
{
  "batchId": "507f1f77bcf86cd799439012",
  "paymentMethod": "emi"
}
```

**Parameters:**
- `batchId` (required): ID of the batch to enroll in
- `paymentMethod` (required): Payment method - either "fullPayment" or "emi"

**Response:**
```json
{
  "success": true,
  "message": "Enrollment created successfully. Please complete payment.",
  "data": {
    "enrollment": {
      "_id": "507f1f77bcf86cd799439016",
      "student": "507f1f77bcf86cd799439017",
      "batch": "507f1f77bcf86cd799439012",
      "course": "507f1f77bcf86cd799439011",
      "paymentMethod": "emi",
      "totalAmount": 15000,
      "emiAmount": 5000,
      "emiMonths": 3,
      "enrollmentStatus": "pending",
      "paymentStatus": "pending",
      "paidAmount": 0
    },
    "payment": {
      "orderId": "order_12345",
      "amount": 5000,
      "currency": "INR"
    }
  }
}
```

## Frontend Implementation Guide

### Step 1: Display Course Selection
```javascript
// Show available courses to student
// User selects a course
```

### Step 2: Fetch Available Batches
```javascript
async function getAvailableBatches(courseId) {
  const response = await fetch(
    `/api/v1/enrollments/batches/course/${courseId}`,
    {
      headers: {
        Authorization: `Bearer ${token}`
      }
    }
  );
  return response.json();
}
```

### Step 3: Display Batch Options
```html
<!-- Display batches as a selectable list/table -->
<div class="batches-container">
  <h3>Available Batches</h3>
  <!-- For each batch, show:
    - Batch name
    - Start and end dates
    - Schedule (days and timings)
    - Instructor name
    - Available seats
    - Select button
  -->
</div>
```

### Step 4: Handle Batch Selection and Enrollment
```javascript
async function enrollInBatch(batchId, paymentMethod = 'emi') {
  const response = await fetch('/api/v1/enrollments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    },
    body: JSON.stringify({
      batchId,
      paymentMethod
    })
  });
  return response.json();
}
```

## Key Features

✅ **Batch Filtering**
- Only shows active, non-full batches
- Excludes batches that have already started
- Shows only future batches for students

✅ **Batch Information**
- Displays schedule details (days and times)
- Shows instructor information
- Shows available seats and capacity

✅ **Enrollment Status**
- Indicates if student is already enrolled in a batch
- Prevents duplicate enrollments (backend validation)

✅ **Payment Options**
- Full payment option
- EMI (Equated Monthly Installment) option
- Flexible payment terms based on course fee

## Validation Rules

1. **Course must exist** - Returns 404 if course not found
2. **Student profile required** - Student must complete profile before enrollment
3. **Batch must be active** - Only active batches are shown
4. **Batch must not be full** - Cannot enroll in full batches
5. **Batch must not have started** - Cannot enroll in batches that have already begun
6. **No duplicate enrollments** - Student cannot enroll in same batch twice
7. **Valid payment method** - Must be either "fullPayment" or "emi"

## Error Handling

```json
{
  "success": false,
  "message": "Course not found"
}
```

Common error scenarios:
- Invalid course ID
- Batch already started
- Batch is full
- Student already enrolled in batch
- Student profile incomplete
- Invalid payment method

## Additional Endpoints

### Alternative: Get Batches by Course (Batch Routes)
**Endpoint:** `GET /api/v1/batches/courses/:courseId/batches`

This endpoint can also be used to fetch batches for a course, with similar functionality but accessed through the batch routes.

---

**Last Updated:** March 9, 2026
**Version:** 1.0
