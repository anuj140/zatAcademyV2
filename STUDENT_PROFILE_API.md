# Student Profile System - Implementation Guide

## Overview

The Student Profile system implements a one-time KYC (Know Your Customer) enrollment form that students must complete before their first course purchase. Once submitted, these details are automatically used for all future purchases without asking again.

## Architecture

### Database Model: StudentProfile

**Location:** `src/models/StudentProfile.js`

#### Fields

| Field                | Type            | Required    | Description                                  |
| -------------------- | --------------- | ----------- | -------------------------------------------- |
| `student`            | ObjectId (User) | Yes         | Reference to the user                        |
| `name`               | String          | Yes         | Student name (pre-filled from User)          |
| `phone`              | String          | Yes         | 10-digit Indian phone (pre-filled from User) |
| `fathersName`        | String          | Yes         | Father's name                                |
| `birthDate`          | Date            | Yes         | Date of birth (validates age 16-80)          |
| `gender`             | String          | Yes         | male / female / other                        |
| `qualification`      | String          | No          | 12th / diploma / bachelor's / master's / phd |
| `alternatePhone`     | String          | No          | Secondary contact phone                      |
| `city`               | String          | Yes         | City of residence                            |
| `state`              | String          | Yes         | State of residence                           |
| `country`            | String          | No          | Country (defaults to India)                  |
| `identificationType` | String          | Yes         | aadhar / pan / both                          |
| `aadharNumber`       | String          | Conditional | Exactly 12 digits                            |
| `panNumber`          | String          | Conditional | Format: AAAAA0000A (10 chars)                |
| `termsAccepted`      | Boolean         | Yes         | Terms & conditions acceptance                |
| `termsAcceptedAt`    | Date            | Auto        | Timestamp when terms were accepted           |
| `privacyAccepted`    | Boolean         | Yes         | Privacy policy acceptance                    |
| `privacyAcceptedAt`  | Date            | Auto        | Timestamp when privacy was accepted          |
| `profileStatus`      | String          | Auto        | incomplete / complete / verified             |
| `verifiedAt`         | Date            | Optional    | When admin verified the profile              |
| `createdAt`          | Date            | Auto        | Creation timestamp                           |
| `updatedAt`          | Date            | Auto        | Update timestamp                             |

#### Validation Rules

1. **Aadhar or PAN Required**: At least one identification must be provided
2. **Aadhar Format**: Exactly 12 digits (e.g., `123456789012`)
3. **PAN Format**: AAAAA0000A format (e.g., `ABCDE1234F`)
4. **Phone Validation**: Indian format starting with 6-9, exactly 10 digits
5. **Age Validation**: Birth date calculated age must be 16-80 years
6. **Terms Acceptance**: Both terms and privacy policy must be accepted

---

## API Endpoints

### Base URL

```
/api/v1/student-profiles
```

### 1. Check if Profile Exists

**Endpoint:** `GET /check`  
**Auth Required:** Yes (Student)  
**Purpose:** Check if student has already completed profile before showing form

#### Request

```bash
curl -X GET http://localhost:5000/api/v1/student-profiles/check \
  -H "Authorization: Bearer <token>"
```

#### Response - Profile Exists

```json
{
  "success": true,
  "profileExists": true,
  "message": "Profile exists",
  "profile": {
    "id": "507f1f77bcf86cd799439011",
    "name": "John Doe",
    "phone": "9876543210",
    "city": "Bangalore",
    "state": "Karnataka",
    "completedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Response - Profile Not Exists

```json
{
  "success": true,
  "profileExists": false,
  "message": "Profile does not exist. Please complete the profile form."
}
```

---

### 2. Get Pre-fill Data

**Endpoint:** `GET /pre-fill`  
**Auth Required:** Yes (Student)  
**Purpose:** Fetch pre-fill data from User model for form auto-population

#### Request

```bash
curl -X GET http://localhost:5000/api/v1/student-profiles/pre-fill \
  -H "Authorization: Bearer <token>"
```

#### Response

```json
{
  "success": true,
  "preFillData": {
    "name": "John Doe",
    "email": "john@example.com",
    "phone": "9876543210",
    "qualification": "bachelor's degree",
    "yearOfPassout": 2020
  },
  "profileExists": false,
  "message": "Pre-fill data retrieved successfully"
}
```

---

### 3. Submit Profile Form

**Endpoint:** `POST /`  
**Auth Required:** Yes (Student)  
**Purpose:** Submit the first-time profile form

#### Request Body

```json
{
  "fathersName": "Rajesh Doe",
  "birthDate": "1998-05-12",
  "gender": "male",
  "alternatePhone": "9123456789",
  "city": "Bangalore",
  "state": "Karnataka",
  "country": "India",
  "identificationType": "aadhar",
  "aadharNumber": "123456789012",
  "panNumber": null,
  "termsAccepted": true,
  "privacyAccepted": true
}
```

#### Request with both IDs

```json
{
  "fathersName": "Rajesh Doe",
  "birthDate": "1998-05-12",
  "gender": "male",
  "city": "Bangalore",
  "state": "Karnataka",
  "identificationType": "both",
  "aadharNumber": "123456789012",
  "panNumber": "ABCDE1234F",
  "termsAccepted": true,
  "privacyAccepted": true
}
```

#### cURL Example

```bash
curl -X POST http://localhost:5000/api/v1/student-profiles \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "fathersName": "Rajesh Doe",
    "birthDate": "1998-05-12",
    "gender": "male",
    "city": "Bangalore",
    "state": "Karnataka",
    "identificationType": "aadhar",
    "aadharNumber": "123456789012",
    "termsAccepted": true,
    "privacyAccepted": true
  }'
```

#### Success Response (201 Created)

```json
{
  "success": true,
  "message": "Profile submitted successfully",
  "profile": {
    "id": "507f1f77bcf86cd799439012",
    "name": "John Doe",
    "city": "Bangalore",
    "state": "Karnataka",
    "profileStatus": "complete",
    "submittedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Error Responses

**Missing Required Fields:**

```json
{
  "success": false,
  "message": "Please provide all required fields: fathersName, birthDate, gender, city, state"
}
```

**Invalid Aadhar:**

```json
{
  "success": false,
  "message": "Aadhar number must be exactly 12 digits"
}
```

**Invalid PAN:**

```json
{
  "success": false,
  "message": "PAN number must be in format AAAAA0000A (10 characters)"
}
```

**Profile Already Exists:**

```json
{
  "success": false,
  "message": "Profile already exists for this student. Use update endpoint instead."
}
```

**No Identification Provided:**

```json
{
  "success": false,
  "message": "Please provide at least one identification (Aadhar or PAN)"
}
```

---

### 4. View Profile

**Endpoint:** `GET /:id`  
**Auth Required:** Yes (Student own or Admin)  
**Purpose:** Retrieve complete profile details

#### Request

```bash
# View own profile
curl -X GET http://localhost:5000/api/v1/student-profiles/507f191e810c19729de860ea \
  -H "Authorization: Bearer <student-token>"

# Admin viewing any student's profile
curl -X GET http://localhost:5000/api/v1/student-profiles/507f191e810c19729de860ea \
  -H "Authorization: Bearer <admin-token>"
```

#### Success Response

```json
{
  "success": true,
  "message": "Profile retrieved successfully",
  "profile": {
    "_id": "507f1f77bcf86cd799439012",
    "student": {
      "_id": "507f191e810c19729de860ea",
      "name": "John Doe",
      "email": "john@example.com",
      "role": "student"
    },
    "name": "John Doe",
    "phone": "9876543210",
    "fathersName": "Rajesh Doe",
    "birthDate": "1998-05-12T00:00:00Z",
    "gender": "male",
    "qualification": "bachelor's degree",
    "alternatePhone": "9123456789",
    "city": "Bangalore",
    "state": "Karnataka",
    "country": "India",
    "identificationType": "aadhar",
    "aadharNumber": "123456789012",
    "panNumber": null,
    "termsAccepted": true,
    "termsAcceptedAt": "2024-01-15T10:30:00Z",
    "privacyAccepted": true,
    "privacyAcceptedAt": "2024-01-15T10:30:00Z",
    "profileStatus": "complete",
    "createdAt": "2024-01-15T10:30:00Z",
    "updatedAt": "2024-01-15T10:30:00Z"
  }
}
```

#### Error - Not Found

```json
{
  "success": false,
  "message": "Profile not found"
}
```

---

### 5. Update Profile

**Endpoint:** `PUT /:id`  
**Auth Required:** Yes (Student own or Admin)  
**Purpose:** Update existing profile information

#### Request Body (all fields optional)

```json
{
  "fathersName": "Rajesh Kumar",
  "city": "Mumbai",
  "state": "Maharashtra",
  "alternatePhone": "9198765432"
}
```

#### cURL Example

```bash
curl -X PUT http://localhost:5000/api/v1/student-profiles/507f191e810c19729de860ea \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "city": "Mumbai",
    "state": "Maharashtra"
  }'
```

#### Success Response

```json
{
  "success": true,
  "message": "Profile updated successfully",
  "profile": {
    "_id": "507f1f77bcf86cd799439012",
    "student": "507f191e810c19729de860ea",
    "name": "John Doe",
    "phone": "9876543210",
    "fathersName": "Rajesh Kumar",
    "city": "Mumbai",
    "state": "Maharashtra",
    ...
    "updatedAt": "2024-01-15T11:00:00Z"
  }
}
```

---

### 6. Delete Profile (Admin Only)

**Endpoint:** `DELETE /:id`  
**Auth Required:** Yes (Admin/SuperAdmin)  
**Purpose:** Delete a student profile (administrative use)

#### Request

```bash
curl -X DELETE http://localhost:5000/api/v1/student-profiles/507f191e810c19729de860ea \
  -H "Authorization: Bearer <admin-token>"
```

#### Success Response

```json
{
  "success": true,
  "message": "Profile deleted successfully"
}
```

---

## Business Logic Flow

### First Purchase Flow

```
1. Student initiates enrollment
2. System checks: Does StudentProfile exist?
   ├─ YES: Proceed to payment
   └─ NO: Return 400 error with profileCompletion flag
3. Student redirected to profile form
4. Student fills and submits form
5. System validates all data:
   ├─ At least one identification (Aadhar or PAN)
   ├─ Valid Aadhar format (12 digits)
   ├─ Valid PAN format (AAAAA0000A)
   ├─ Valid phone numbers
   ├─ Age between 16-80
   └─ Terms accepted
6. Profile saved with timestamp
7. Student can now proceed to payment
```

### Repeat Purchase Flow

```
1. Student initiates enrollment in new course
2. System checks StudentProfile exists: YES
3. System auto-uses existing profile data
4. Skip form → Direct to payment
5. Profile data automatically pre-filled in payment forms
```

### Enrollment Controller Integration

The `enrollInBatch` function now includes profile validation:

```javascript
// Check if student profile exists - KYC requirement
const studentProfile = await StudentProfile.findOne({ student: req.user.id });
if (!studentProfile) {
  return res.status(400).json({
    success: false,
    message: "Please complete your profile before enrolling in a batch",
    requiresProfileCompletion: true,
    redirectTo: "/profiles/create",
  });
}
```

---

## Frontend Implementation Guide

### Step 1: Check Profile on Enrollment Page

```javascript
// Before showing payment
const checkProfile = async (token) => {
  const response = await fetch("/api/v1/student-profiles/check", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  if (!data.profileExists) {
    window.location.href = "/profile/create";
  }
};
```

### Step 2: Get Pre-fill Data

```javascript
// On profile form load
const getPrefillData = async (token) => {
  const response = await fetch("/api/v1/student-profiles/pre-fill", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await response.json();

  // Auto-populate form fields
  document.getElementById("name").value = data.preFillData.name;
  document.getElementById("phone").value = data.preFillData.phone;
  document.getElementById("qualification").value = data.preFillData.qualification;
};
```

### Step 3: Submit Profile

```javascript
// Form submission
const submitProfile = async (formData, token) => {
  const response = await fetch("/api/v1/student-profiles", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(formData),
  });

  const data = await response.json();

  if (data.success) {
    // Redirect to batch enrollment
    window.location.href = "/enrollment/select-batch";
  } else {
    // Show validation errors
    console.error(data.errors || data.message);
  }
};
```

---

## Validation Rules Summary

### Required Validations

- ✓ Father's name: Non-empty string
- ✓ Birth date: Valid date, age 16-80 years
- ✓ Gender: male / female / other
- ✓ City: Non-empty string
- ✓ State: Non-empty string
- ✓ At least one ID: Aadhar OR PAN OR both
- ✓ Terms accepted: Must be true
- ✓ Privacy accepted: Must be true

### Conditional Validations

- ✓ Aadhar (if provided): Exactly 12 digits
- ✓ PAN (if provided): Format AAAAA0000A (10 characters)
- ✓ Alternate phone (if provided): Valid 10-digit Indian number
- ✓ Phone number: Valid 10-digit Indian number starting with 6-9

---

## Database Indexes

The StudentProfile model includes the following indexes for performance:

```javascript
studentProfileSchema.index({ student: 1 }); // Lookup by student
studentProfileSchema.index({ email: 1 }); // Email lookups
studentProfileSchema.index({ createdAt: -1 }); // Chronological sorting
```

---

## Error Handling

### Common Error Responses

| Status | Code             | Message                                    |
| ------ | ---------------- | ------------------------------------------ |
| 201    | Success          | Profile submitted successfully             |
| 200    | Success          | Profile retrieved/updated                  |
| 400    | Validation Error | Invalid format or missing fields           |
| 400    | Business Logic   | Profile already exists / Profile not found |
| 403    | Unauthorized     | You can only view/edit your own profile    |
| 404    | Not Found        | Profile not found                          |
| 500    | Server Error     | Internal database error                    |

---

## Integration Checklist

- [x] StudentProfile model created with all validations
- [x] 5 API endpoints implemented with proper auth
- [x] Identification validation (Aadhar & PAN)
- [x] Terms acceptance tracking with timestamps
- [x] Pre-fill data from User model
- [x] Enrollment controller updated to check profile
- [x] Routes registered in app.js
- [x] Profile index optimization

---

## Testing Endpoints

### Import this to Postman:

```json
{
  "info": {
    "name": "Student Profile API",
    "version": "1.0"
  },
  "item": [
    {
      "name": "Check Profile",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/v1/student-profiles/check",
        "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
      }
    },
    {
      "name": "Get Prefill Data",
      "request": {
        "method": "GET",
        "url": "{{base_url}}/api/v1/student-profiles/pre-fill",
        "header": [{ "key": "Authorization", "value": "Bearer {{token}}" }]
      }
    },
    {
      "name": "Submit Profile",
      "request": {
        "method": "POST",
        "url": "{{base_url}}/api/v1/student-profiles",
        "header": [
          { "key": "Authorization", "value": "Bearer {{token}}" },
          { "key": "Content-Type", "value": "application/json" }
        ],
        "body": {
          "mode": "raw",
          "raw": {
            "fathersName": "Rajesh Doe",
            "birthDate": "1998-05-12",
            "gender": "male",
            "city": "Bangalore",
            "state": "Karnataka",
            "identificationType": "aadhar",
            "aadharNumber": "123456789012",
            "termsAccepted": true,
            "privacyAccepted": true
          }
        }
      }
    }
  ]
}
```

---

## Notes

1. **KYC Compliance**: This system helps meet Know Your Customer requirements in India
2. **Data Consistency**: Once a profile is created, it remains consistent across all purchases
3. **User Experience**: Eliminates repetitive form filling for returning students
4. **Data Validation**: All validations happen at both model and controller level
5. **Timestamps**: All acceptance timestamps are automatically recorded for audit trails
6. **Scalability**: Indexed on frequently queried fields for fast lookups

---

## File Locations

- Model: [src/models/StudentProfile.js](src/models/StudentProfile.js)
- Controller: [src/controllers/studentProfile.controller.js](src/controllers/studentProfile.controller.js)
- Routes: [src/routes/studentProfile.routes.js](src/routes/studentProfile.routes.js)
- Integration: [src/controllers/enrollment.controller.js](src/controllers/enrollment.controller.js) (Line with StudentProfile check)
- App Registration: [src/app.js](src/app.js)

---

**Last Updated:** February 28, 2026
**Version:** 1.0
