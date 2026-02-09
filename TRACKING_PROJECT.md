1. Learning material tracking not implemented - such as status [not_started, etc]
2. `https://zatacademyv2.onrender.com/api/v1/users` @access - SuperAdmin, Admin
    It return all types of user without pagination and including data of SuperAdmin/Admin (who is currently accessing)
    - For student populate course batch etc (neccessary related information about student)

---

<mark>Update batch API endpoint</mark>  
`{{URL}}/batches/697d9222554aba0f802f2681`

```json
{
    "success": true,
    "data": {
        "_id": "697d9222554aba0f802f2681",
        "name": "Evening-batch-Java-full-stack",
        "course": {
            "_id": "697d9133554aba0f802f2672",
            "title": "Git & Github",
            "description": "This introduction to Git & Github and this going to be long description of Git & Github",
            "fee": 5000,
            "emiAmount": 0,
            "duration": 1,
            "durationUnit": "months",
            "isPublished": true,
            "category": "other",
            "tags": [],
            "prerequisites": [],
            "learningOutcomes": [],
            "createdBy": "697d8fe3987d3dea047b9a64",
            "createdAt": "2026-01-31T05:20:51.448Z",
            "updatedAt": "2026-02-09T05:03:59.396Z",
            "__v": 0
        },
        "startDate": "2026-04-01T00:00:00.000Z",
        "endDate": "2026-06-15T00:00:00.000Z",
        "instructor": {
            "loginAttempts": 0,
            "_id": "697d9088554aba0f802f2667",
            "name": "Instructor_1-createdBy-SupAdmin",
            "email": "kekawa6762@gamening.com",
            "role": "instructor",
            "isActive": true,
            "emailVerified": false,
            "createdAt": "2026-01-31T05:18:00.443Z",
            "updatedAt": "2026-01-31T05:18:00.443Z",
            "__v": 0,
            "refreshTokens": [],
            "lastPasswordChange": "2026-02-09T06:35:51.010Z",
            "trustedDevices": []
        },
        "maxStudents": 50,
        "currentStudents": 0,
        "isActive": true,
        "isFull": false,
        "createdBy": "697d8fe3987d3dea047b9a64",
        "schedule": [
            {
                "day": "monday",
                "startTime": "10:30",
                "endTime": "12:30",
                "_id": "69898046311d8dec42f48533"
            }
        ],
        "createdAt": "2026-01-31T05:24:50.365Z",
        "updatedAt": "2026-02-09T06:35:50.879Z",
        "__v": 0
    }
}
```

**Remove the unnessary fields**

- __v
- Maybe instructor refresh tokens
- 