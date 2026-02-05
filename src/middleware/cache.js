const AnalyticsCache = require('../models/AnalyticsCache');

/**
 * Middleware to cache API responses
 */
exports.cacheResponse = (ttl = 300) => {
  return async (req, res, next) => {
    // Only cache GET requests
    if (req.method !== 'GET') {
      return next();
    }
    
    // Generate cache key from URL and query params
    const cacheKey = `api:${req.originalUrl || req.url}`;
    
    try {
      // Check cache
      const cachedData = await AnalyticsCache.get(cacheKey);
      
      if (cachedData) {
        return res.status(200).json({
          success: true,
          fromCache: true,
          data: cachedData
        });
      }
      
      // Store original send function
      const originalSend = res.json;
      
      // Override json function to cache response
      res.json = function(data) {
        // Only cache successful responses
        if (res.statusCode >= 200 && res.statusCode < 300) {
          AnalyticsCache.set(cacheKey, data, ttl).catch(console.error);
        }
        
        // Call original send function
        originalSend.call(this, data);
      };
      
      next();
    } catch (error) {
      console.error('Cache middleware error:', error);
      next();
    }
  };
};

/**
 * Clear cache for specific patterns
 */
exports.clearCache = async (patterns) => {
  try {
    if (!Array.isArray(patterns)) {
      patterns = [patterns];
    }
    
    for (const pattern of patterns) {
      await AnalyticsCache.invalidatePattern(pattern);
    }
    
    return { success: true, cleared: patterns.length };
  } catch (error) {
    console.error('Error clearing cache:', error);
    return { success: false, error: error.message };
  }
};

/**
 * Middleware to skip cache for certain requests
 */
exports.skipCache = (req, res, next) => {
  req.skipCache = true;
  next();
};