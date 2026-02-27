# Student Registration - Quick Reference Guide

## What Was Implemented

### ✅ New Registration Fields

1. **Phone Number** (Required)
   - Format: 10-digit Indian mobile number
   - Pattern: Starts with 6, 7, 8, or 9
   - Example: `9876543210`

2. **Year of Passout** (Required)
   - Range: 2012 to 2029
   - Example: `2020`

3. **Highest Qualification** (Required)
   - Options: `"12th"`, `"diploma"`, `"bachelor's degree"`, `"master's degree"`, `"phd"`
   - Example: `"bachelor's degree"`

4. **Interested Course** (Optional)
   - MongoDB Course ID
   - Auto-populated as null if not provided
   - Example: `"60d5ec49c0f58c0015d98765"`

5. **Confirm Password** (Required)
   - Must match the password field
   - Validates before account creation

---

## Registration Endpoint

**URL**: `POST /api/v1/auth/register`

**Required Headers**:

```
Content-Type: application/json
```

---

## Minimal Request Payload

```json
{
  "name": "John Doe",
  "email": "john@example.com",
  "password": "SecurePassword123",
  "confirmPassword": "SecurePassword123",
  "phone": "9876543210",
  "yearOfPassout": 2020,
  "highestQualification": "bachelor's degree"
}
```

---

## Full Request with Optional Fields

```json
{
  "name": "Jane Smith",
  "email": "jane@example.com",
  "password": "MySecurePass@123",
  "confirmPassword": "MySecurePass@123",
  "phone": "8765432109",
  "yearOfPassout": 2022,
  "highestQualification": "master's degree",
  "interestedCourse": "60d5ec49c0f58c0015d98765"
}
```

---

## Sample cURL Requests

### Test Case 1: Valid Registration (Minimum Fields)

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Raj Kumar",
    "email": "raj@example.com",
    "password": "Password@123",
    "confirmPassword": "Password@123",
    "phone": "9876543210",
    "yearOfPassout": 2020,
    "highestQualification": "bachelor'\''s degree"
  }'
```

### Test Case 2: Invalid Phone Number

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Priya Singh",
    "email": "priya@example.com",
    "password": "SecurePass@123",
    "confirmPassword": "SecurePass@123",
    "phone": "123456789",
    "yearOfPassout": 2021,
    "highestQualification": "diploma"
  }'
```

**Expected**: Error - "Please provide a valid 10-digit Indian phone number"

### Test Case 3: Password Mismatch

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Arjun Verma",
    "email": "arjun@example.com",
    "password": "SecurePass@123",
    "confirmPassword": "DifferentPass@123",
    "phone": "8765432109",
    "yearOfPassout": 2022,
    "highestQualification": "master'\''s degree"
  }'
```

**Expected**: Error - "Passwords do not match"

### Test Case 4: Invalid Year

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Neha Patel",
    "email": "neha@example.com",
    "password": "SecurePass@123",
    "confirmPassword": "SecurePass@123",
    "phone": "7654321098",
    "yearOfPassout": 2030,
    "highestQualification": "phd"
  }'
```

**Expected**: Error - "Year of passout must be between 2012 and 2029"

### Test Case 5: Invalid Qualification

```bash
curl -X POST http://localhost:5000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Amit Kumar",
    "email": "amit@example.com",
    "password": "SecurePass@123",
    "confirmPassword": "SecurePass@123",
    "phone": "6543210987",
    "yearOfPassout": 2019,
    "highestQualification": "high school"
  }'
```

**Expected**: Error - "Highest qualification must be one of: 12th, diploma, bachelor'\''s degree, master'\''s degree, phd"

---

## Success Response Format

```json
{
  "success": true,
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": "507f1f77bcf86cd799439011",
    "name": "Raj Kumar",
    "email": "raj@example.com",
    "phone": "9876543210",
    "role": "student",
    "yearOfPassout": 2020,
    "highestQualification": "bachelor's degree"
  }
}
```

---

## Validation Rules at a Glance

| Field                | Type     | Required | Rules                      |
| -------------------- | -------- | -------- | -------------------------- |
| name                 | String   | Yes      | Max 50 chars               |
| email                | String   | Yes      | Valid email format, unique |
| password             | String   | Yes      | Min 8 chars                |
| confirmPassword      | String   | Yes      | Must match password        |
| phone                | String   | Yes      | 10 digits, starts 6-9      |
| yearOfPassout        | Number   | Yes      | 2012-2029                  |
| highestQualification | String   | Yes      | Enum: 5 options            |
| interestedCourse     | ObjectId | No       | Must be valid course ID    |

---

## Valid Qualification Values

```javascript
[
  "12th",
  "diploma",
  "bachelor's degree", // Note: exactly as written with apostrophe
  "master's degree", // Note: exactly as written with apostrophe
  "phd", // Note: lowercase
];
```

---

## Valid Phone Number Examples

✅ Valid:

- `9876543210`
- `8765432109`
- `7654321098`
- `6543210987`

❌ Invalid:

- `5876543210` (starts with 5)
- `987654321` (only 9 digits)
- `98765432101` (11 digits)
- `9876-5432-10` (contains dash)

---

## Files Modified

1. **`src/models/User.js`**
   - Added 4 new fields to user schema
   - Added validation for each field

2. **`src/controllers/auth.controller.js`**
   - Updated register function payload processing
   - Added Course model import
   - Added comprehensive field validation
   - Updated response with new user fields

---

## Documentation Files Created

1. **`STUDENT_REGISTRATION_API.md`** - Complete API documentation
2. **`STUDENT_REGISTRATION_IMPLEMENTATION.md`** - Detailed implementation guide

---

## Testing Steps

1. **Start the server**:

   ```bash
   npm run dev
   ```

2. **Test successful registration** with valid data

3. **Test validation** for each field:
   - Invalid phone number
   - Non-matching passwords
   - Year outside range
   - Invalid qualification
   - Non-existent course ID

4. **Verify database**: Check MongoDB user collection for new student record

5. **Verify email**: Confirm welcome email is sent (check emailService logs)

6. **Verify token**: Use returned JWT token for authenticated requests

---

## Next Steps (Optional Enhancements)

1. Add phone number verification via SMS OTP
2. Add email verification flow
3. Create course recommendation engine based on qualification
4. Build student profile completion dashboard
5. Add batch auto-assignment logic based on qualification
6. Implement profile update endpoint to modify these fields later
7. Create analytics on student qualification distribution

---

## Support

For issues or questions regarding the registration implementation, refer to:

- `STUDENT_REGISTRATION_API.md` - API specifications
- `STUDENT_REGISTRATION_IMPLEMENTATION.md` - Implementation details
- `src/models/User.js` - Data schema
- `src/controllers/auth.controller.js` - Registration logic

---

**Last Updated**: February 27, 2026
**Status**: ✅ Ready for Testing
