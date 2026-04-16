# Complete Solution: Cross-Origin Authentication Token Handling

## 🎯 Your Problem (Clearly Explained)

You have **two different domains**:
- 🏠 **Auth Domain**: `https://zat-academy-home.onrender.com/auth` (login page)
- 📊 **App Domain**: `https://zat-academy.onrender.com/student` (dashboard)

### What Was Happening (The Bug):
```
1. User logs in on Auth Domain
2. Server sets refresh token in httpOnly cookie
   ↓ This cookie is NOW bound to the Auth Domain
   ↓ (Cookies don't cross domains by default)
3. User gets redirected to App Domain
4. Frontend makes API request from App Domain
   ↓ Sends access token (in Authorization header) ✅
   ↓ Access token works for ~15 minutes
5. ⏱️ Access token expires after 15 minutes
6. Frontend tries to refresh token
   ↓ Sends request with refresh token in header (or body)
   ↓ But the refresh token cookie from Auth Domain is NOT sent
   ✗ Request fails with 401 Unauthorized
   ✗ User gets kicked out
```

### Why This Happens:
- **Browser security prevents cookies from crossing domains**
- HttpOnly cookies set on `domain1.com` are NOT sent to requests from `domain2.com`
- This is intentional (security feature) but breaks your cross-origin flow

---

## ✅ The Solution (What We Implemented)

### Backend Changes (✅ Already Done)

**1. Modified Login Endpoints**
All these now return refresh token in response body:
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/google/signin`
- `PUT /api/v1/auth/reset-password/:resetToken`
- `PUT /api/v1/auth/update-password`
- `POST /api/v1/auth/setup/complete`

**Response example:**
```json
{
  "success": true,
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc...",  ← NEW: Frontend stores this
  "user": { "id": "...", "email": "...", ... }
}
```

**2. Enhanced Refresh Endpoint**
`POST /api/v1/auth/refresh-token` now accepts refresh token from:
```javascript
// Priority 1: HttpOnly cookie (same-origin requests)
// Priority 2: Authorization header - Bearer <refreshToken> (cross-origin)
// Priority 3: Request body - { refreshToken } (fallback)
```

**Response:**
```json
{
  "success": true,
  "accessToken": "eyJhbGc...",
  "refreshToken": "eyJhbGc..."  ← New rotated token
}
```

**3. Updated CORS Configuration**
Cookie SameSite changed from `"strict"` to `"none"` to allow cross-origin cookie attempts

---

## 📋 Step-by-Step Flow (What Happens Now)

```
User Login:
┌─────────────────────────────────────────────────────────────┐
│ 1. User submits login on Auth Domain                        │
│    POST /api/v1/auth/login { email, password }             │
│                                                               │
│ 2. Backend validates credentials ✅                          │
│                                                               │
│ 3. Backend returns BOTH tokens:                              │
│    ├─ accessToken: Valid for 15 minutes (short-lived)       │
│    ├─ refreshToken: Valid for 30 days (long-lived)          │
│    └─ Server also sets httpOnly cookie                      │
│                                                               │
│ 4. Frontend STORES refresh token:                            │
│    localStorage.setItem('refreshToken', data.refreshToken)  │
└─────────────────────────────────────────────────────────────┘

Redirect to App Domain:
┌─────────────────────────────────────────────────────────────┐
│ 5. Frontend redirects: window.location.href = 'App Domain'  │
│                                                               │
│ 6. App Domain loads, localStorage is still accessible! ✅   │
│    (localStorage is per browser, not per domain)            │
│                                                               │
│ 7. Frontend retrieves stored refres token:                   │
│    const refreshToken = localStorage.getItem('refreshToken')│
└─────────────────────────────────────────────────────────────┘

API Requests:
┌─────────────────────────────────────────────────────────────┐
│ 8. Each API request includes access token:                   │
│    Authorization: Bearer <accessToken>                       │
│                                                               │
│ 9. Server validates access token ✅                          │
│    Request succeeds, returns data                            │
│                                                               │
│ (Repeats for 15 minutes...)                                  │
└─────────────────────────────────────────────────────────────┘

Token Expiration & Refresh:
┌─────────────────────────────────────────────────────────────┐
│ 10. After ~15 min, access token expires                     │
│                                                               │
│ 11. Next API request fails with 401 Unauthorized            │
│                                                               │
│ 12. Frontend interceptor catches 401:                        │
│     ├─ Extracts refresh token from localStorage             │
│     ├─ Calls refresh endpoint:                              │
│     │  POST /api/v1/auth/refresh-token                      │
│     │  Header: Authorization: Bearer <refreshToken>         │
│     └─ Sends with withCredentials: true (allows cookies)    │
│                                                               │
│ 13. Server receives refresh request:                         │
│     ├─ Finds refresh token in Authorization header          │
│     ├─ Validates it (checks hash, expiry, user active)      │
│     └─ Returns new token pair:                              │
│        ├─ New accessToken (15 min validity)                 │
│        └─ New refreshToken (30 day validity)                │
│                                                               │
│ 14. Frontend stores new tokens:                              │
│     ├─ localStorage.setItem('accessToken', newAccessToken)  │
│     ├─ localStorage.setItem('refreshToken', newRefreshToken)│
│     └─ Also set as httpOnly cookie server-side              │
│                                                               │
│ 15. Frontend retries original request:                       │
│     Authorization: Bearer <newAccessToken>                   │
│     Request succeeds! ✅                                     │
│                                                               │
│ 16. User continues working, completely unaware of refresh    │
│     (Seamless experience!)                                   │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔧 What You Need to Do (Frontend)

### Option A: Full Implementation (Recommended)
Follow: `FRONTEND_IMPLEMENTATION_QUICK_START.md`

**Key points:**
```javascript
// 1. Create axios instance with:
//    - baseURL: 'https://your-api-domain.com'
//    - withCredentials: true
//    - Request interceptor to add token
//    - Response interceptor to handle 401 + refresh

// 2. In login handler:
localStorage.setItem('accessToken', response.accessToken);
localStorage.setItem('refreshToken', response.refreshToken);

// 3. All other code automatically uses interceptors
```

### Option B: Minimal Changes
If you can't do full interceptor setup:

```javascript
// Before each API call:
const accessToken = localStorage.getItem('accessToken');
const config = {
  headers: { 'Authorization': `Bearer ${accessToken}` },
  withCredentials: true,  // Important!
};
const response = await axios.post(url, data, config);
```

### Option C: Manual Refresh
If you need to refresh manually:

```javascript
// When getting 401:
const refreshToken = localStorage.getItem('refreshToken');
const response = await axios.post(
  'https://your-api-domain.com/api/v1/auth/refresh-token',
  {},
  {
    headers: { 'Authorization': `Bearer ${refreshToken}` },
    withCredentials: true,
  }
);
// Store new tokens
localStorage.setItem('accessToken', response.data.accessToken);
localStorage.setItem('refreshToken', response.data.refreshToken);
```

---

## ⚙️ Environment Configuration Required

Update your `.env` on Render (or wherever backend is hosted):

```bash
# CRITICAL: Add both domains
ALLOWED_ORIGINS=https://zat-academy-home.onrender.com,https://zat-academy.onrender.com

# Cookie settings for cross-origin
REFRESH_TOKEN_COOKIE_SAMESITE=none
REFRESH_TOKEN_COOKIE_SECURE=true
REFRESH_TOKEN_COOKIE_HTTPONLY=true
NODE_ENV=production

# Token expiry
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=30d
```

See: `ENVIRONMENT_CONFIG_GUIDE.md` for detailed instructions

---

## 🔒 Security Notes

This implementation is secure because:

✅ **Refresh tokens in localStorage**
- Only stored after successful login
- Transport layer (HTTPS) protects them
- HttpOnly cookie provides same protection
- Better than nothing, acceptable for refresh tokens

✅ **Using Authorization header**
- Standard OAuth 2.0 approach
- Not sent automatically (prevents CSRF)
- Only sent when frontend explicitly adds it

✅ **Token rotation**
- Each refresh generates new token pair
- Old tokens immediately invalidated
- Minimizes exposure window

✅ **Separate expiry times**
- Access token: 15 min (short, minimal exposure if compromised)
- Refresh token: 30 days (long, but only used for refresh)

✅ **CORS validation**
- Only allowed origins can make requests
- Credentials only sent to trusted domains

---

## 📚 Documentation Files Created

1. **`CROSS_ORIGIN_TOKEN_IMPLEMENTATION.md`**
   - Detailed explanation of all changes
   - Security considerations
   - Testing checklist
   - Troubleshooting guide

2. **`FRONTEND_IMPLEMENTATION_QUICK_START.md`**
   - Copy-paste ready code
   - Complete axios setup with interceptors
   - All auth functions updated
   - Easy testing instructions

3. **`ENVIRONMENT_CONFIG_GUIDE.md`**
   - All required environment variables
   - How to update on Render
   - Verification steps
   - Deployment checklist

4. **`SOLUTION_OVERVIEW.md`** (this file)
   - Big picture explanation
   - Flowcharts and diagrams
   - What changed and why
   - What you need to do

---

## ✨ Next Steps

### Immediate (Backend is ready):
1. ✅ Backend code updated - all changes in place
2. ✅ Endpoints returning refreshToken in response
3. ✅ CORS configured for cross-origin
4. ⏳ **Update environment variables** (see `ENVIRONMENT_CONFIG_GUIDE.md`)

### Then (Frontend implementation):
1. Create axios client with interceptors (use template from quick start guide)
2. Update login handler to store both tokens from response
3. Test login → redirect → API calls → token refresh
4. Deploy to production

### Validation:
- Access tokens working initially ✅
- After 15 min, auto-refresh happens transparently ✅
- User stays logged in across origins ✅
- Logout clears both tokens ✅

---

## 🐛 Common Issues & Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 on refresh | Token not in header | Add `Authorization: Bearer <token>` |
| CORS error | Domain not whitelisted | Add to `ALLOWED_ORIGINS` env |
| Token not stored | Not reading from response | Store `response.refreshToken` after login |
| Still unauthorized | `withCredentials: false` | Set `withCredentials: true` in axios |
| Stuck in loop | Refresh logic broken | Add `_retry` flag to prevent retrying forever |

See detailed troubleshooting in `CROSS_ORIGIN_TOKEN_IMPLEMENTATION.md`

---

## 📞 Quick Reference

**Backend Status**: ✅ Ready  
**Frontend Status**: ⏳ Needs implementation  
**Environment**: ⏳ Needs configuration update  
**Testing**: ⏳ Can start after frontend + env complete  

**Files to Update:**
- Production environment variables (Render dashboard)
- Frontend auth client (use quick start guide)
- Any components making API calls (they'll work automatically with interceptor)

**Main Changes:**
- All login responses now include `refreshToken`
- Refresh endpoint accepts token via `Authorization` header
- CORS allows cross-origin credentials

---

## 🎓 Understanding the Technology

### Why cookies alone don't work:
```
Browser Security Model:
- Same-origin policy prevents scripts from accessing cookies across domains
- This is intentional (attacks protection)
- Applies to ALL cookie types (including httpOnly for actual sending)
```

### Why Authorization header solves it:
```
OAuth 2.0 Pattern:
- Credentials sent via HTTP headers (custom, not cookies)
- Browser doesn't send Authorization header automatically
- Frontend explicitly adds header when needed
- Works across origins (authorized explicitly)
```

### Why we still use cookies:
```
Dual Approach (Best of Both):
- Cookies: For same-origin requests (browser handles automatically)
- Headers: For cross-origin requests (frontend controls explicitly)
- Same token in both places (user only needs one refresh token)
```

---

That's it! Your backend is ready. Follow the frontend implementation guide and update the environment variables, and you're done! 🚀
