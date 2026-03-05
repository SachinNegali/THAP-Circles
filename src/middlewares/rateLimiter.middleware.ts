/**
 * Rate Limiter Middleware
 * ========================
 *
 * SECURITY DECISIONS:
 * - Auth endpoints are prime targets for:
 *   1. Credential stuffing (not applicable here since we're OAuth-only)
 *   2. Token brute-forcing (extremely unlikely with JWT but defense-in-depth)
 *   3. DoS attacks that exhaust server resources with expensive Google
 *      token verification calls
 * - /auth/google gets strict limits (10/15min) because each call triggers
 *   a Google API call (verify idToken) which is expensive.
 * - /auth/refresh gets higher limits (30/15min) because token refresh
 *   is cheaper and happens more frequently for legitimate users.
 * - Rate limits are per-IP. In production behind a proxy, ensure
 *   express trust proxy is set so req.ip reflects the real client IP.
 *
 * SCALING NOTE:
 * For millions of users, replace the in-memory store with Redis
 * (e.g., rate-limit-redis) to share state across server instances.
 */

import rateLimit from 'express-rate-limit';

/**
 * Rate limiter for /auth/google
 *
 * 10 requests per 15 minutes per IP.
 * A legitimate user logs in at most a few times per day.
 * 10 per 15 minutes is generous for legitimate use while
 * blocking automated attacks.
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10,
  message: {
    message: 'Too many login attempts, please try again after 15 minutes',
  },
  standardHeaders: true, // Return rate limit info in `RateLimit-*` headers
  legacyHeaders: false,  // Disable `X-RateLimit-*` headers (deprecated)
});

/**
 * Rate limiter for /auth/refresh
 *
 * 30 requests per 15 minutes per IP.
 * Higher limit because:
 * - Refresh happens automatically when access tokens expire (every 15 min)
 * - Multiple tabs/devices may refresh concurrently
 * - But 30 is still low enough to prevent abuse
 */
export const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30,
  message: {
    message: 'Too many refresh attempts, please try again after 15 minutes',
  },
  standardHeaders: true,
  legacyHeaders: false,
});
