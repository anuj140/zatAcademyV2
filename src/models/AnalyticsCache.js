const mongoose = require('mongoose');

const analyticsCacheSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  type: {
    type: String,
    enum: ['realtime', 'daily', 'weekly', 'monthly'],
    default: 'realtime'
  },
  expiresAt: {
    type: Date,
    required: true,
    index: { expireAfterSeconds: 0 }
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Static methods for cache management
analyticsCacheSchema.statics.set = async function(key, data, ttl = 300) {
  const expiresAt = new Date(Date.now() + ttl * 1000);
  
  await this.findOneAndUpdate(
    { key },
    { 
      key, 
      data, 
      expiresAt,
      createdAt: new Date()
    },
    { upsert: true, new: true }
  );
};

analyticsCacheSchema.statics.get = async function(key) {
  const cache = await this.findOne({ key });
  
  if (!cache || cache.expiresAt < new Date()) {
    return null;
  }
  
  return cache.data;
};

analyticsCacheSchema.statics.invalidate = async function(key) {
  await this.deleteOne({ key });
};

analyticsCacheSchema.statics.invalidatePattern = async function(pattern) {
  const caches = await this.find({ key: new RegExp(pattern) });
  const ids = caches.map(cache => cache._id);
  
  if (ids.length > 0) {
    await this.deleteMany({ _id: { $in: ids } });
  }
};

module.exports = mongoose.model('AnalyticsCache', analyticsCacheSchema);