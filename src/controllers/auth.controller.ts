/**
 * Auth Controller — HTTP Request Handlers
 * =========================================
 *
 * Thin controller layer — all security logic lives in services.
 * Controllers only:
 * 1. Extract validated input from req.body
 * 2. Call the appropriate service
 * 3. Return the response or error
 *
 * SECURITY: No business logic here. This prevents security bugs
 * caused by logic duplication across controllers.
 */

import { Request, Response } from 'express';
import {
  authenticateWithGoogle,
  refreshAuthTokens,
  logoutUser,
} from '../services/auth.service.js';

/**
 * POST /auth/google
 *
 * Receives an idToken from the frontend's Google Sign-In,
 * verifies it server-side, and returns JWT auth tokens.
 *
 * Request body: { idToken: string }
 * Response: { user, tokens: { accessToken, refreshToken } }
 */
export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    const result = await authenticateWithGoogle(idToken);

    /**
     * Return user data and tokens.
     * The frontend should store accessToken in memory (NOT localStorage)
     * and refreshToken in a secure HTTP-only cookie or secure storage.
     */
    res.status(200).json({
      user: {
        id: result.user._id,
        email: result.user.email,
        name: result.user.name,
        picture: result.user.picture,
        role: result.user.role,
      },
      tokens: result.tokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    console.log("complete error", error)
    /**
     * SECURITY: We return a generic 401 for most auth errors.
     * Specific error messages like "Email not verified" are fine
     * because they help the user, not the attacker.
     * We do NOT reveal internal errors or stack traces.
     */
    if (
      message.includes('Email not verified') ||
      message.includes('payload missing')
    ) {
      res.status(401).json({ message });
      return;
    }

    /**
     * Log the actual error server-side for debugging.
     * This is NOT sent to the client — only visible in server logs.
     */
    console.error('[AUTH] Google auth failed:', message);

    /**
     * Generic error for all other failures (invalid token, wrong audience, etc.)
     * We do NOT tell the attacker WHY the token was rejected.
     */
    res.status(401).json({ message: 'Invalid Google token' });
  }
};

/**
 * POST /auth/refresh
 *
 * Rotates refresh token — issues new access + refresh tokens.
 * Detects replay attacks and invalidates all sessions if detected.
 *
 * Request body: { refreshToken: string }
 * Response: { accessToken, refreshToken }
 */
export const refreshTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const tokens = await refreshAuthTokens(refreshToken);

    res.status(200).json({
      tokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';

    /**
     * SECURITY: If replay is detected, we still return 401.
     * The message hint helps the frontend know to redirect to login.
     * We include the replay detection message because the legitimate
     * user needs to know their session was compromised.
     */
    if (message.includes('reuse detected')) {
      res.status(401).json({
        message: 'Session compromised — please sign in again',
        code: 'TOKEN_REUSE_DETECTED',
      });
      return;
    }

    res.status(401).json({ message: 'Please authenticate' });
  }
};

/**
 * POST /auth/logout
 *
 * Invalidates all sessions for the authenticated user.
 * Requires a valid access token (enforced by auth middleware).
 *
 * Response: { message: 'Logged out successfully' }
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    /**
     * req.user is set by the auth middleware after verifying
     * the access token. We use the userId from the verified
     * token, never from the request body.
     */
    const userId = (req as any).user._id.toString();

    await logoutUser(userId);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Logout failed' });
  }
};
