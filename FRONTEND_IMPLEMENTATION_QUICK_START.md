# Frontend Implementation - Quick Start

## What Changed on Backend?

Your backend auth endpoints now return an **additional `refreshToken` field** that you must handle:

```javascript
// Old response (cookies only)
{ success: true, accessToken: "...", user: {} }

// New response (with refresh token for cross-origin)
{ success: true, accessToken: "...", refreshToken: "...", user: {} }
```

---

## Quick Implementation (Copy-Paste Ready)

### 1. Create API Client with Interceptor

**File: `src/api/client.js`**
```javascript
import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'https://your-api-domain.com';

const apiClient = axios.create({
  baseURL: API_BASE,
  withCredentials: true,  // ← Critical for cross-origin
});

// Request: Add access token to every request
apiClient.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken');
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// Response: Auto-refresh on 401
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const { config, response: errorResponse } = error;

    // If 401 and not already retried
    if (errorResponse?.status === 401 && !config._retry) {
      config._retry = true;

      try {
        const refreshToken = localStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token');

        // Call refresh endpoint
        const { data } = await axios.post(
          `${API_BASE}/api/v1/auth/refresh-token`,
          {},
          {
            headers: { Authorization: `Bearer ${refreshToken}` },
            withCredentials: true,
          }
        );

        // Store new tokens
        localStorage.setItem('accessToken', data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);

        // Retry original request
        config.headers.Authorization = `Bearer ${data.accessToken}`;
        return apiClient(config);
      } catch (err) {
        // Refresh failed - send to login
        localStorage.clear();
        window.location.href = 'https://zat-academy-home.onrender.com/auth';
        return Promise.reject(err);
      }
    }

    return Promise.reject(error);
  }
);

export default apiClient;
```

### 2. Update Login Function

**File: `src/services/auth.js`**
```javascript
import apiClient from '../api/client';

export const login = async (email, password) => {
  const { data } = await apiClient.post('/api/v1/auth/login', {
    email,
    password,
  });

  // Store BOTH tokens
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);

  return data;
};

export const logout = async () => {
  try {
    await apiClient.post('/api/v1/auth/logout');
  } finally {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    window.location.href = 'https://zat-academy-home.onrender.com/auth';
  }
};
```

### 3. Update Google Sign-In Handler

```javascript
export const googleSignIn = async (idToken) => {
  const { data } = await apiClient.post('/api/v1/auth/google/signin', {
    idToken,
  });

  // Store BOTH tokens
  localStorage.setItem('accessToken', data.accessToken);
  localStorage.setItem('refreshToken', data.refreshToken);

  return data;
};
```

### 4. Use in Your Components

```javascript
import apiClient from '../api/client';

export function Dashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // This will automatically:
        // 1. Include access token in Authorization header
        // 2. Auto-refresh if access token expires
        // 3. Retry the request with new token
        const response = await apiClient.get('/api/v1/student-profiles/me');
        setData(response.data);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) return <div>Loading...</div>;
  return <div>{JSON.stringify(data)}</div>;
}
```

---

## What Happens Now?

### Scenario: User Logs In on Origin 1, Works on Origin 2

1. **User logs in** → Both tokens stored in localStorage
2. **Redirects to Origin 2** → localStorage is accessible (same browser)
3. **Makes API request** → Interceptor adds `Authorization: Bearer <accessToken>`
4. **Access token valid** → Request succeeds ✅
5. **~15 min passes** → Access token expires
6. **Next API request** → Server returns 401
7. **Interceptor triggers** → Calls refresh endpoint with `Authorization: Bearer <refreshToken>`
8. **Server validates refresh token** → Returns new access + refresh tokens
9. **Interceptor stores new tokens** → Updates localStorage
10. **Retries original request** → Succeeds with new access token
11. **User never notices** → Seamless experience ✅

---

## Environment Variables (.env)

```
REACT_APP_API_URL=https://your-api-domain.com
```

---

## Testing with Postman

### Manual Refresh Test:

1. **Login request:**
   ```
   POST https://your-api-domain.com/api/v1/auth/login
   Body: { email: "...", password: "..." }
   ```
   → Save the `accessToken` and `refreshToken` from response

2. **Refresh request:**
   ```
   POST https://your-api-domain.com/api/v1/auth/refresh-token
   Header: Authorization: Bearer <refreshToken>
   ```
   → Should get new `accessToken` and `refreshToken` back

---

## Troubleshooting

### Q: Still getting 401 after refresh?
**A:** Check:
- ✅ Is `refreshToken` being stored? `console.log(localStorage.getItem('refreshToken'))`
- ✅ Is Authorization header being sent? Check DevTools → Network tab
- ✅ Is `withCredentials: true` set on axios? (Important for cookies)

### Q: Stuck in redirect loop?
**A:** Add safety check:
```javascript
// Only refresh once per request
if (config._retry) {
  // Refresh already attempted, don't try again
  throw error;
}
```

### Q: Refresh token not being sent?
**A:** Ensure you're using the correct header format:
```javascript
// ✅ Correct
Authorization: Bearer <refreshToken>

// ❌ Wrong
Authorization: <refreshToken>
Authorization: Token <refreshToken>
```

---

## That's It!

Your frontend is now ready for cross-origin token management. The backend handles:
- ✅ Sending refresh token in response
- ✅ Accepting refresh token via Authorization header
- ✅ Token rotation (each refresh generates new pair)
- ✅ CORS properly configured

Your frontend just needs to:
- ✅ Store both tokens
- ✅ Include access token in every request
- ✅ Auto-refresh when getting 401
- ✅ Retry with new token
