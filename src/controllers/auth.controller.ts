/**
 * Auth Controller — HTTP Request Handlers
 * =========================================
 *
 * Thin controller layer — all security logic lives in services.
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
 * Request body: { idToken: string }
 * Response: { user, tokens: { access: { token, expires }, refresh: { token, expires } } }
 */
export const googleAuth = async (req: Request, res: Response): Promise<void> => {
  try {
    const { idToken } = req.body;

    const result = await authenticateWithGoogle(idToken);

    res.status(200).json({
      user: {
        _id: result.user._id,
        fName: result.user.fName,
        lName: result.user.lName,
        email: result.user.email,
        socialAccounts: result.user.socialAccounts,
        createdAt: result.user.createdAt,
        updatedAt: result.user.updatedAt,
      },
      tokens: result.tokens,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Authentication failed';
    console.error('[AUTH] Google auth failed:', message);

    if (
      message.includes('Email not verified') ||
      message.includes('payload missing')
    ) {
      res.status(401).json({ message });
      return;
    }

    res.status(401).json({ message: 'Invalid Google token' });
  }
};

/**
 * POST /auth/refresh
 *
 * Request body: { refreshToken: string }
 * Response: { tokens: { access: { token, expires }, refresh: { token, expires } } }
 */
export const refreshTokens = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refreshToken } = req.body;

    const tokens = await refreshAuthTokens(refreshToken);

    res.status(200).json({ tokens });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token refresh failed';

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
 * Response: { message: 'Logged out successfully' }
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = (req as any).user._id.toString();

    await logoutUser(userId);

    res.status(200).json({ message: 'Logged out successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Logout failed' });
  }
};
