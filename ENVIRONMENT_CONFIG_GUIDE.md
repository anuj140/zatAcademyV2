# Environment Configuration for Cross-Origin Authentication

## Required Environment Variables

You must set these environment variables on your backend server:

### CORS Configuration
```
# Comma-separated list of allowed origins (no trailing slashes)
ALLOWED_ORIGINS=https://zat-academy-home.onrender.com,https://zat-academy.onrender.com
```

### Cookie Configuration
```
# Set to 'true' for production/HTTPS environments
NODE_ENV=production

# Cookie security settings
REFRESH_TOKEN_COOKIE_HTTPONLY=true        # Default: true (recommended)
REFRESH_TOKEN_COOKIE_SECURE=true          # Default: true in production
REFRESH_TOKEN_COOKIE_SAMESITE=none        # Updated for cross-origin support
REFRESH_TOKEN_COOKIE_NAME=refreshToken    # Default cookie name
```

### Token Expiry
```
# These should already be set, but verify they exist:
ACCESS_TOKEN_EXPIRES=15m                  # Should be short-lived
REFRESH_TOKEN_EXPIRES=30d                 # Can be longer-lived
```

### If Using Google OAuth
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
```

---

## How to Update Render Environment Variables

### For Render.com Deployment:

1. Go to your Render dashboard
2. Click on your backend service
3. Scroll to **Environment**
4. Update or add these variables:

```
ALLOWED_ORIGINS=https://zat-academy-home.onrender.com,https://zat-academy.onrender.com
NODE_ENV=production
REFRESH_TOKEN_COOKIE_HTTPONLY=true
REFRESH_TOKEN_COOKIE_SECURE=true
REFRESH_TOKEN_COOKIE_SAMESITE=none
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=30d
```

5. Click **Save Changes**
6. Your service will redeploy automatically

### For Local Development (.env.local):

```
# Local development (no HTTPS)
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://127.0.0.1:3000
NODE_ENV=development
REFRESH_TOKEN_COOKIE_HTTPONLY=true
REFRESH_TOKEN_COOKIE_SECURE=false         # Set to false for localhost
REFRESH_TOKEN_COOKIE_SAMESITE=lax         # Can use 'lax' for local dev
ACCESS_TOKEN_EXPIRES=15m
REFRESH_TOKEN_EXPIRES=30d
```

---

## Verification Checklist

### ☑️ Backend Setup Complete?
- [ ] Both origins added to `ALLOWED_ORIGINS`
- [ ] `REFRESH_TOKEN_COOKIE_SAMESITE=none` is set
- [ ] `NODE_ENV=production` (for Render)
- [ ] Service redeployed after env changes

### ☑️ CORS Working?
```bash
# Test CORS preflight request
curl -H "Origin: https://zat-academy.onrender.com" \
     -H "Access-Control-Request-Method: POST" \
     https://your-api-domain.com/api/v1/auth/refresh-token -v
```

Should see:
```
Access-Control-Allow-Origin: https://zat-academy.onrender.com
Access-Control-Allow-Credentials: true
```

### ☑️ Token Endpoints Returning refreshToken?
```bash
# Login and check response includes refreshToken
curl -X POST https://your-api-domain.com/api/v1/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"test@example.com","password":"password123"}' | jq .refreshToken
```

Should output: `"eyJhbGc..."`

### ☑️ Refresh Endpoint Accepting Authorization Header?
```bash
# Refresh with token in header
curl -X POST https://your-api-domain.com/api/v1/auth/refresh-token \
     -H "Authorization: Bearer YOUR_REFRESH_TOKEN_HERE" \
     -H "Content-Type: application/json" | jq .
```

Should return new tokens in response.

---

## Troubleshooting Environment Issues

### Problem: Getting CORS error even after adding origins
**Solution:**
1. Check for trailing slashes - `ALLOWED_ORIGINS` should NOT have them
2. Verify exact domain names match (no http://, no query params)
3. Make sure you did a hard redeploy (not just save)
4. Wait 1-2 minutes for cache to clear

### Problem: Cookie not being set across origins
**Solution:**
1. Verify `REFRESH_TOKEN_COOKIE_SAMESITE=none` in env
2. Ensure `REFRESH_TOKEN_COOKIE_SECURE=true` (required when using `SameSite=none`)
3. Verify `NODE_ENV=production` 

### Problem: Getting "Refresh token is missing" error
**Solution:**
1. Frontend should send in Authorization header: `Bearer <refreshToken>`
2. Check: Is the request going to the right origin?
3. Inspect Network tab: Is Authorization header present in request?

---

## Environment Variable Reference

| Variable | Value | Purpose |
|----------|-------|---------|
| `ALLOWED_ORIGINS` | `https://domain1.com,https://domain2.com` | Whitelist for CORS |
| `NODE_ENV` | `production` for Render, `development` for local | Enables secure cookies |
| `REFRESH_TOKEN_COOKIE_HTTPONLY` | `true` | Prevent XSS access to cookie |
| `REFRESH_TOKEN_COOKIE_SECURE` | `true` in prod, `false` in dev | HTTPS only (or HTTP for local) |
| `REFRESH_TOKEN_COOKIE_SAMESITE` | `none` for cross-origin, `strict` for same-origin | CSRF protection |
| `ACCESS_TOKEN_EXPIRES` | `15m` | How long access tokens live |
| `REFRESH_TOKEN_EXPIRES` | `30d` | How long refresh tokens live |

---

## Common Setup Mistakes & Fixes

❌ **Mistake: Using localhost with `Secure=true`**
```
✅ Fix: Set REFRESH_TOKEN_COOKIE_SECURE=false for local dev
```

❌ **Mistake: Trailing slash in domain**
```
ALLOWED_ORIGINS=https://domain.com/   ❌
ALLOWED_ORIGINS=https://domain.com    ✅
```

❌ **Mistake: SameSite=strict for cross-origin**
```
REFRESH_TOKEN_COOKIE_SAMESITE=strict   ❌ (blocks cross-origin cookies)
REFRESH_TOKEN_COOKIE_SAMESITE=none     ✅ (allows cross-origin)
```

❌ **Mistake: SameSite=none without Secure**
```
REFRESH_TOKEN_COOKIE_SECURE=false      ❌ (invalid combination)
REFRESH_TOKEN_COOKIE_SECURE=true       ✅ (required with SameSite=none)
```

---

## Quick Deployment Steps

### 1. Update Render Environment
```
ALLOWED_ORIGINS=https://zat-academy-home.onrender.com,https://zat-academy.onrender.com
NODE_ENV=production
REFRESH_TOKEN_COOKIE_SAMESITE=none
REFRESH_TOKEN_COOKIE_SECURE=true
```

### 2. Manually Trigger Deploy
- Go to Render dashboard
- Click service
- Click "Manual Deploy" → "Deploy latest commit"
- Wait for green checkmark

### 3. Test in Browser
- Open first origin: `https://zat-academy-home.onrender.com/auth`
- Log in
- Check localStorage: `console.log(localStorage.getItem('refreshToken'))`
- Should see token value
- Redirect to second origin should work

### 4. Monitor Logs
In Render dashboard:
- Go to "Logs"
- Look for any CORS errors or auth issues
- Search for "[refreshAccessToken]" to see refresh attempts

---

## Database Credentials (If Needed)

Make sure these are also set (if not already):

```
MONGODB_URI=your_mongodb_connection_string
SENDGRID_API_KEY=your_sendgrid_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
JWT_SECRET=your_jwt_secret
```

---

## Still Having Issues?

1. **Check browser console** for JavaScript errors
2. **Check DevTools Network tab** for actual requests/responses
3. **Check Render logs** for backend errors
4. **Monitor** https://your-backend/health to verify it's running
5. **Test locally first** before deploying to production

After environment variables are updated, your backend is ready! 🚀
