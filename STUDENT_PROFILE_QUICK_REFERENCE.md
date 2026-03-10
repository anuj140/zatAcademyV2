# Student Profile Quick Reference Guide

## What's New?

A one-time student profile system that students fill once, use forever:

```
First Course → Fill Profile → Save → Use for all future courses
Later Courses → Profile exists → Skip form → Direct to payment
```

---

## The 5 Endpoints at a Glance

| Endpoint    | Method | Purpose                        | Required Auth         |
| ----------- | ------ | ------------------------------ | --------------------- |
| `/check`    | GET    | Check if profile exists        | Student               |
| `/pre-fill` | GET    | Get auto-fill data from User   | Student               |
| `/`         | POST   | Submit first-time profile form | Student               |
| `/:id`      | GET    | View complete profile          | Student (own) / Admin |
| `/:id`      | PUT    | Update profile                 | Student (own) / Admin |
| `/:id`      | DELETE | Delete profile                 | Admin only            |

---

## Quick Implementation Flow

### 1️⃣ On Enrollment Page (Before Payment)

```javascript
// Check if they have a profile
GET / api / v1 / student - profiles / check;

// Response: profileExists = false?
// → Show profile form
// → Response: profileExists = true?
// → Skip form, go to payment
```

### 2️⃣ On Profile Form Page (First Time)

```javascript
// Get pre-filled data
GET / api / v1 / student - profiles / pre - fill;

// Auto-populate these fields:
// - name (from User)
// - phone (from User)
// - email (from User)
// - qualification (from User)
// - yearOfPassout (from User)

// User fills remaining fields:
// - Father's name
// - Birth date
// - Gender
// - City, State
// - Identification (Aadhar OR PAN)
// - Accept terms & privacy
```

### 3️⃣ Submit Profile Form

```javascript
POST /api/v1/student-profiles
{
  "fathersName": "...",
  "birthDate": "1998-05-12",
  "gender": "male",
  "city": "...",
  "state": "...",
  "identificationType": "aadhar",
  "aadharNumber": "123456789012",  // 12 digits
  "termsAccepted": true,
  "privacyAccepted": true
}

// Success → Redirect to payment
// Error → Show validation messages
```

### 4️⃣ Next Time Student Enrolls

```javascript
// Check profile again
GET / api / v1 / student - profiles / check;

// Response: profileExists = true
// → Skip form completely
// → Direct to payment with pre-filled student info
```

---

## ID Validation Rules

### Aadhar

- **Format**: 12 digits
- **Example**: `123456789012`
- **Validator**: `/^\d{12}$/`

### PAN

- **Format**: AAAAA0000A (5 letters + 4 digits + 1 letter)
- **Example**: `ABCDE1234F`
- **Validator**: `/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/i`

### At Least One Required

```javascript
if (!aadharNumber && !panNumber) {
  throw "Please provide at least one identification";
}
```

---

## Fields Summary

### Pre-filled from User (Auto-populate)

- `name` - Student's name
- `phone` - Student's registered phone
- `email` - Student's registered email
- `qualification` - Highest qualification
- `yearOfPassout` - Year of graduation

### Student Must Fill

- `fathersName` - Father's name ✓ Required
- `birthDate` - Date of birth ✓ Required (age 16-80)
- `gender` - male/female/other ✓ Required
- `city` - City ✓ Required
- `state` - State ✓ Required
- `alternatePhone` - Secondary phone (optional)
- `country` - Country (defaults to India)
- `identificationType` - aadhar/pan/both ✓ Required
- `aadharNumber` - 12 digits (if Aadhar selected)
- `panNumber` - 10-char format (if PAN selected)
- `termsAccepted` - Accept T&C ✓ Required
- `privacyAccepted` - Accept Privacy ✓ Required

---

## Error Messages to Handle

```javascript
// Missing required field
"Please provide all required fields: fathersName, birthDate...";

// Invalid Aadhar
"Aadhar number must be exactly 12 digits";

// Invalid PAN
"PAN number must be in format AAAAA0000A";

// No ID provided
"Please provide at least one identification (Aadhar or PAN)";

// Profile already exists (on create)
"Profile already exists for this student. Use update endpoint instead.";

// During enrollment - profile missing
"Please complete your profile before enrolling in a batch";
```

---

## Status Codes

| Code | Meaning      | Action                                   |
| ---- | ------------ | ---------------------------------------- |
| 200  | OK           | Data fetched/updated successfully        |
| 201  | Created      | Profile submitted successfully           |
| 400  | Bad Request  | Validation error or business logic error |
| 403  | Forbidden    | Authorization failed (wrong user/role)   |
| 404  | Not Found    | Profile not found                        |
| 500  | Server Error | Database or internal error               |

---

## Key Validations (Automatic)

✓ Phone: Indian format (10 digits, starts with 6-9)  
✓ Alternate Phone: Same format as phone if provided  
✓ Age: Calculated from birthDate, must be 16-80  
✓ Aadhar: Exactly 12 digits if provided  
✓ PAN: AAAAA0000A format if provided  
✓ At least one ID required  
✓ Terms & Privacy must be accepted

---

## Enrollment Integration

When a student tries to enroll in a batch:

```javascript
// In enrollment.controller.js
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

**Frontend Response:**

```javascript
if (enrollmentResponse.requiresProfileCompletion) {
  window.location.href = enrollmentResponse.redirectTo;
}
```

---

## Database Model Fields

The StudentProfile collection stores:

- Student reference
- Personal info (name, phone, father's name)
- Demographics (birth date, gender, qualification)
- Location (city, state, country)
- Contact info (alternate phone)
- Identification (Aadhar & PAN)
- Acceptance records (terms, privacy with timestamps)
- Profile status (incomplete/complete/verified)
- Timestamps (created, updated, verified)

---

## Authorization Rules

| Action         | Allowed For                    |
| -------------- | ------------------------------ |
| Create profile | Student (own, first time only) |
| View profile   | Student (own) + Admin (any)    |
| Update profile | Student (own) + Admin (any)    |
| Delete profile | Admin + SuperAdmin only        |
| Check profile  | Student (own)                  |
| Get pre-fill   | Student (own)                  |

---

## Testing Checklist

- [ ] GET /check → No profile exists (new student)
- [ ] GET /pre-fill → Pre-filled data appears
- [ ] POST / → Submit valid form → Success
- [ ] POST / → Try with invalid Aadhar → Validation error
- [ ] POST / → Try with invalid PAN format → Validation error
- [ ] POST / → Try without terms acceptance → Error
- [ ] POST / → Try creating duplicate → Error
- [ ] GET /:id → Own profile → Success
- [ ] GET /:id → Other student's profile (as student) → Forbidden
- [ ] GET /:id → Other student's profile (as admin) → Success
- [ ] PUT /:id → Update city → Success
- [ ] Enroll in batch → Profile exists → Succeeds
- [ ] Enroll in batch → No profile → "Complete profile" error

---

## Example Workflow

### Student Journey:

```
1. Visit AlmaBetter
   ↓
2. Find course, click "Enroll"
   ↓
3. API checks: GET /student-profiles/check
   ↓
4. Response: profileExists = false
   ↓
5. Redirected to /profile/create form
   ↓
6. API fetches: GET /student-profiles/pre-fill
   ↓
7. Form auto-fills: name, phone, email, qualification
   ↓
8. Student enters: father's name, birth date, gender, city, state, Aadhar/PAN
   ↓
9. Student accepts terms & privacy
   ↓
10. Submit: POST /student-profiles
    ↓
11. Server validates all fields
    ↓
12. Profile created successfully
    ↓
13. Redirect to payment page
    ↓
14. Complete enrollment & payment
    ↓
15. Next course enrollment:
    ↓
16. Check profile → exists = true
    ↓
17. Skip form → Direct to payment
    ↓
18. Reuse existing profile info
```

---

## Important Notes

1. **One Profile Per Student**: Each User has exactly one StudentProfile
2. **Immutable Student**: Can't change which user owns the profile
3. **Timestamps Tracked**: When terms/privacy accepted automatically recorded
4. **KYC Compliant**: Stores required identification for regulatory compliance
5. **Auto-defaults**: Country defaults to India
6. **Pre-filled Data**: Copied from User model to StudentProfile (not linked)
7. **Enrollment Blocker**: Can't enroll without completing profile first

---

## Common Issues & Solutions

### Issue: "Profile already exists" error on create

**Solution**: Use PUT endpoint to update, not POST to create

### Issue: Aadhar validation fails

**Solution**: Must be exactly 12 digits, no spaces or dashes

### Issue: PAN validation fails

**Solution**: Format is AAAAA0000A (case insensitive, will normalize)

### Issue: Student can't enroll

**Solution**: Check GET /check endpoint first, might need to create profile

### Issue: Pre-filled data not appearing

**Solution**: Make sure User model has data (phone, qualification, etc.)

---

**Version**: 1.0  
**Last Updated**: February 28, 2026  
**Developer**: AlmaBetter Team
