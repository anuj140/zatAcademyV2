# Student Registration API Documentation

## Endpoint

**POST** `/api/v1/auth/register`

## Access

**Public** - No authentication required

## Description

Register a new student user with extended profile information including phone number, year of passout, and highest qualification.

## Request Body

```json
{
  "name": "Raj Kumar",
  "email": "raj.kumar@example.com",
  "password": "SecurePass123!",
  "confirmPassword": "SecurePass123!",
  "phone": "9876543210",
  "yearOfPassout": 2020,
  "highestQualification": "bachelor's degree",
  "interestedCourse": "60d5ec49c0f58c0015d98765" // Optional
}
```

## Field Specifications

### Required Fields

| Field                  | Type   | Description                                | Validation                                                                       |
| ---------------------- | ------ | ------------------------------------------ | -------------------------------------------------------------------------------- |
| `name`                 | String | Student's full name                        | Max 50 characters                                                                |
| `email`                | String | Student's email address                    | Must be valid email format, unique in system                                     |
| `password`             | String | Account password                           | Minimum 8 characters                                                             |
| `confirmPassword`      | String | Password confirmation                      | Must match `password`                                                            |
| `phone`                | String | 10-digit Indian phone number               | Must start with 6-9, exactly 10 digits (e.g., 9876543210)                        |
| `yearOfPassout`        | Number | Year of graduation/passout                 | Must be between 2012 and 2029                                                    |
| `highestQualification` | String | Highest educational qualification achieved | Enum: `"12th"`, `"diploma"`, `"bachelor's degree"`, `"master's degree"`, `"phd"` |

### Optional Fields

| Field              | Type              | Description                                                           |
| ------------------ | ----------------- | --------------------------------------------------------------------- |
| `interestedCourse` | String (ObjectId) | MongoDB ID of interested course. If not provided, will be set to null |

## Request Examples

### Example 1: Minimal Registration

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Priya Singh",
    "email": "priya.singh@example.com",
    "password": "Password123",
    "confirmPassword": "Password123",
    "phone": "9123456789",
    "yearOfPassout": 2021,
    "highestQualification": "bachelor's degree"
  }'
```

### Example 2: With Interested Course

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arjun Verma",
    "email": "arjun.verma@example.com",
    "password": "SecurePass123!",
    "confirmPassword": "SecurePass123!",
    "phone": "8987654321",
    "yearOfPassout": 2022,
    "highestQualification": "master's degree",
    "interestedCourse": "60d5ec49c0f58c0015d98765"
  }'
```

### Example 3: Different Qualifications

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Neha Patel",
    "email": "neha.patel@example.com",
    "password": "MySecurePass@123",
    "confirmPassword": "MySecurePass@123",
    "phone": "7876543210",
    "yearOfPassout": 2023,
    "highestQualification": "diploma"
  }'
```

## Success Response

**Status Code:** `201 Created`

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "60d5ec49c0f58c0015d98766",
    "name": "Raj Kumar",
    "email": "raj.kumar@example.com",
    "phone": "9876543210",
    "role": "student",
    "yearOfPassout": 2020,
    "highestQualification": "bachelor's degree"
  }
}
```

## Error Responses

### Missing Required Fields

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Please provide name, email, password, and confirm password"
}
```

### Invalid Phone Number

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Please provide a valid 10-digit Indian phone number (starting with 6-9)"
}
```

### Password Mismatch

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Passwords do not match"
}
```

### Invalid Year of Passout

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Year of passout must be between 2012 and 2029"
}
```

### Invalid Qualification

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "Highest qualification must be one of: 12th, diploma, bachelor's degree, master's degree, phd"
}
```

### User Already Exists

**Status Code:** `400 Bad Request`

```json
{
  "success": false,
  "message": "User already exists with this email"
}
```

### Course Not Found

**Status Code:** `404 Not Found`

```json
{
  "success": false,
  "message": "Interested course not found"
}
```

### Server Error

**Status Code:** `500 Internal Server Error`

```json
{
  "success": false,
  "message": "Error message details"
}
```

## Validation Rules

### Phone Number

- Must be a 10-digit number
- Must start with 6, 7, 8, or 9 (valid Indian mobile prefixes)
- Regex: `/^[6-9]\d{9}$/`
- Examples of valid numbers:
  - 9876543210
  - 8123456789
  - 7234567890
  - 6345678901

### Password

- Minimum 8 characters
- No special character requirements enforced by API
- Recommendation: Use mix of uppercase, lowercase, numbers, and special characters

### Year of Passout

- Minimum: 2012
- Maximum: 2029
- Must be a valid year representing when the student graduated

### Highest Qualification

Choose one of:

- `"12th"` - 12th grade/High School
- `"diploma"` - Diploma degree
- `"bachelor's degree"` - Bachelor's degree
- `"master's degree"` - Master's degree
- `"phd"` - Doctor of Philosophy

## Features Implemented

✅ **10-Digit Phone Validation** - Ensures valid Indian mobile numbers  
✅ **Password Confirmation** - Validates password matches confirm password  
✅ **Year of Passout Range** - Enforces 2012-2029 range  
✅ **Qualification Enum** - Predefined list of qualifications  
✅ **Optional Course Selection** - Can be provided during registration or added later  
✅ **Course Validation** - Verifies course exists in database if provided  
✅ **Welcome Email** - Automatic email sent to new students  
✅ **JWT Token** - Authentication token generated immediately after registration

## Auto-Population Logic

The `interestedCourse` field is **optional**. If not provided:

- It will be set to `null`
- Students can update their interested course later through their profile
- Consider adding a course recommendation system on the frontend based on category

## Database Schema Changes

The following fields have been added to the User model:

```javascript
{
  phone: String,           // 10-digit Indian phone number
  interestedCourse: ObjectId,  // Reference to Course model
  yearOfPassout: Number,   // 2012-2029
  highestQualification: String  // Enum of qualifications
}
```

## Notes

- All student registrations through this public endpoint will have `role: "student"`
- The `interestedCourse` field can be updated later via profile update endpoint
- A welcome email is automatically sent to new registrations
- JWT token is valid for authenticated requests to protected endpoints
