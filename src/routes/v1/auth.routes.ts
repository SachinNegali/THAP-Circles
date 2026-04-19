/**
 * Auth Routes
 * ============
 *
 * Three endpoints, each with appropriate security layers:
 *
 * POST /google   → Rate limited + validated → Google idToken auth
 * POST /refresh  → Rate limited + validated → Token rotation
 * POST /logout   → Auth required → Session invalidation
 *
 * SECURITY DECISIONS:
 * - Rate limiting is the FIRST middleware — reject abusive requests
 *   before wasting resources on validation or business logic.
 * - Validation is SECOND — reject malformed input before hitting services.
 * - Auth middleware on /logout ensures only authenticated users can
 *   invalidate their sessions.
 * - No auth middleware on /google and /refresh since those are the
 *   entry points for unauthenticated users.
 */

import { Router } from 'express';
import { googleAuth, refreshTokens, logout } from '../../controllers/auth.controller.js';
import { authLimiter, refreshLimiter } from '../../middlewares/rateLimiter.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { googleAuthSchema, refreshTokenSchema } from '../../validations/auth.validation.js';
import authMiddleware from '../../middlewares/auth.middleware.js';

const router = Router();

/**
 * POST /auth/google
 * Security stack: rate limit → validate → authenticate with Google
 */
router.post(
  '/google',
  authLimiter as any,
  validate(googleAuthSchema),
  googleAuth
);

/**
 * POST /auth/refresh
 * Security stack: rate limit → validate → rotate tokens
 */
router.post(
  '/refresh',
  refreshLimiter as any,
  validate(refreshTokenSchema),
  refreshTokens
);

/**
 * POST /auth/logout
 * Security stack: auth middleware → invalidate sessions
 * Note: No rate limiting needed — already requires a valid access token
 */
router.post(
  '/logout',
  authMiddleware,
  logout
);

export default router;
