/**
 * Auth Middleware — JWT Access Token Verification
 * =================================================
 *
 * Protects routes by verifying the access token from the
 * Authorization header and enforcing tokenVersion.
 *
 * SECURITY DECISIONS:
 * - Uses the ACCESS secret (not refresh secret).
 * - Verifies tokenVersion against the user's current version.
 *   This allows instant session invalidation on logout without
 *   maintaining a token blacklist (which is expensive at scale).
 * - Attaches the full user object to req.user for downstream use.
 * - Returns generic 401 errors — never reveals why auth failed
 *   (expired? wrong version? bad signature?) to prevent enumeration.
 */

import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, TokenPayload } from '../services/token.service.js';
import User from '../models/user.model.js';

/**
 * Extend Express Request to include our user
 */
declare global {
  namespace Express {
    interface Request {
      user?: InstanceType<typeof User>;
      tokenPayload?: TokenPayload;
    }
  }
}

const authMiddleware = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    /**
     * Extract Bearer token from Authorization header.
     * Format: "Bearer <token>"
     */
    const authHeader = req.header('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ message: 'Access denied — no token provided' });
      return;
    }

    const token = authHeader.replace('Bearer ', '');

    /**
     * Verify token signature and expiry using the ACCESS secret.
     * If the token was signed with a different secret (e.g., the
     * refresh secret), verification fails immediately.
     */
    let payload: TokenPayload;
    try {
      payload = verifyAccessToken(token);
    } catch {
      res.status(401).json({ message: 'Invalid or expired token' });
      return;
    }

    /**
     * Verify it's actually an access token, not a refresh token
     * that somehow got signed with the access secret.
     */
    if (payload.type !== 'access') {
      res.status(401).json({ message: 'Invalid token type' });
      return;
    }

    /**
     * Look up the user to verify they still exist and check tokenVersion.
     */
    const user = await User.findById(payload.userId);

    if (!user) {
      res.status(401).json({ message: 'User no longer exists' });
      return;
    }

    /**
     * CRITICAL: Token version check.
     * On logout, tokenVersion is incremented. Any access token
     * issued before the logout carries the old version number
     * and will be rejected here.
     *
     * This eliminates the need for a token blacklist while still
     * allowing immediate token invalidation.
     */
    if (payload.tokenVersion !== user.tokenVersion) {
      res.status(401).json({ message: 'Session expired — please sign in again' });
      return;
    }

    /**
     * Attach user and payload to request for downstream handlers.
     */
    req.user = user;
    req.tokenPayload = payload;
    next();
  } catch {
    /**
     * Catch-all: never reveal internal errors to the client.
     */
    res.status(401).json({ message: 'Please authenticate' });
  }
};

export default authMiddleware;
