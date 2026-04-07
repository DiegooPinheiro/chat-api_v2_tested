const { redisClient } = require('../config/redis');

const cacheMiddleware = (ttl = 60) => {
  return async (req, res, next) => {
    const key = `cache:${req.originalUrl}:${req.user?._id || 'guest'}`;
    try {
      const cachedData = await redisClient.get(key);
      if (cachedData) return res.status(200).json(JSON.parse(cachedData));
      const originalJson = res.json;
      res.json = (data) => {
        if (res.statusCode === 200) redisClient.setEx(key, ttl, JSON.stringify(data));
        return originalJson.call(res, data);
      };
      next();
    } catch (error) { next(); }
  };
};

const clearCache = async (pattern) => {
  try {
    const keys = await redisClient.keys(pattern);
    if (keys.length > 0) await redisClient.del(keys);
  } catch (error) {}
};

module.exports = { cacheMiddleware, clearCache };
