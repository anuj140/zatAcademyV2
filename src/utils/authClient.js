class AuthClient {
  constructor() {
    this.baseURL = process.env.REACT_APP_API_URL || 'http://localhost:5000/api/v1';
    this.isRefreshing = false;
    this.failedQueue = [];
  }

  // Store tokens in memory (not localStorage for security)
  setTokens(accessToken, refreshToken) {
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  clearTokens() {
    this.accessToken = null;
    this.refreshToken = null;
  }

  // Make authenticated request with automatic token refresh
  async request(url, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...options.headers
    };

    // Add access token if available
    if (this.accessToken) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    const config = {
      ...options,
      headers,
      credentials: 'include' // Important for cookies
    };

    try {
      const response = await fetch(`${this.baseURL}${url}`, config);
      
      // Handle 401 Unauthorized (token expired)
      if (response.status === 401) {
        const errorData = await response.json();
        
        if (errorData.code === 'TOKEN_EXPIRED') {
          return this.handleTokenRefresh(url, config);
        }
      }
      
      return response;
    } catch (error) {
      throw error;
    }
  }

  // Handle token refresh with queue
  async handleTokenRefresh(originalUrl, originalConfig) {
    if (this.isRefreshing) {
      // Queue the request
      return new Promise((resolve, reject) => {
        this.failedQueue.push({ resolve, reject });
      }).then(() => {
        return this.request(originalUrl, originalConfig);
      });
    }

    this.isRefreshing = true;

    try {
      // Attempt to refresh token
      const response = await fetch(`${this.baseURL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include', // Send refresh token cookie
        headers: {
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const data = await response.json();
      
      // Update access token
      this.accessToken = data.accessToken;
      
      // Retry original request
      const retryResponse = await this.request(originalUrl, originalConfig);
      
      // Process queued requests
      this.processQueue(null);
      
      return retryResponse;
    } catch (error) {
      this.processQueue(error);
      throw error;
    } finally {
      this.isRefreshing = false;
    }
  }

  processQueue(error) {
    this.failedQueue.forEach(prom => {
      if (error) {
        prom.reject(error);
      } else {
        prom.resolve();
      }
    });
    this.failedQueue = [];
  }

  // Login method
  async login(email, password, rememberMe = false) {
    const response = await fetch(`${this.baseURL}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ email, password, rememberMe })
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message);
    }

    const data = await response.json();
    this.setTokens(data.accessToken, null); // Refresh token is in cookie
    return data;
  }

  // Logout method
  async logout() {
    try {
      await this.request('/auth/logout', {
        method: 'POST'
      });
    } finally {
      this.clearTokens();
    }
  }

  // Get active sessions
  async getActiveSessions() {
    const response = await this.request('/auth/sessions');
    return response.json();
  }

  // Revoke specific session
  async revokeSession(deviceId) {
    const response = await this.request(`/auth/sessions/${deviceId}`, {
      method: 'DELETE'
    });
    return response.json();
  }

  // Logout from all devices
  async logoutAll() {
    const response = await this.request('/auth/logout-all', {
      method: 'POST'
    });
    this.clearTokens();
    return response.json();
  }
}

export default new AuthClient();