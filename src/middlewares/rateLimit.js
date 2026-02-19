/**
 * Simple in-memory rate limiter middleware
 * Used to prevent key bundle enumeration attacks
 */

const rateLimitStore = new Map();

/**
 * Create a rate limiting middleware
 * @param {Object} options
 * @param {number} options.windowMs - Time window in milliseconds (default: 60000 = 1 min)
 * @param {number} options.max - Max requests per window (default: 60)
 * @param {string} options.errorCode - E2EE error code to return (default: 'E2E_006')
 * @returns {Function} Express middleware
 */
export const createRateLimiter = ({ windowMs = 60000, max = 60, errorCode = 'E2E_006' } = {}) => {
  // Cleanup stale entries every 5 minutes
  setInterval(() => {
    const now = Date.now();
    for (const [key, data] of rateLimitStore.entries()) {
      if (now - data.windowStart > windowMs * 2) {
        rateLimitStore.delete(key);
      }
    }
  }, 5 * 60 * 1000);

  return (req, res, next) => {
    const userId = req.user?._id?.toString();
    if (!userId) {
      return next();
    }

    const key = `${errorCode}:${userId}`;
    const now = Date.now();
    const record = rateLimitStore.get(key);

    if (!record || now - record.windowStart > windowMs) {
      // Start a new window
      rateLimitStore.set(key, { windowStart: now, count: 1 });
      return next();
    }

    record.count++;

    if (record.count > max) {
      return res.status(429).send({
        success: false,
        code: errorCode,
        message: 'Rate limit exceeded. Please try again later.',
        retryAfter: Math.ceil((record.windowStart + windowMs - now) / 1000),
      });
    }

    return next();
  };
};

/**
 * Pre-configured rate limiter for key bundle fetches
 * Max 60 requests per minute per user
 */
export const keyBundleRateLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 60,
  errorCode: 'E2E_006',
});
