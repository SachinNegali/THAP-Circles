/**
 * Auth Service — Core Authentication Business Logic
 * ===================================================
 *
 * Orchestrates the entire auth flow:
 * 1. Google token verification → user lookup/creation → token issuance
 * 2. Refresh token rotation with replay detection
 * 3. Logout with full session invalidation
 */

import User, { IUser } from '../models/user.model.js';
import { verifyGoogleToken } from './google.service.js';
import {
  generateTokenPair,
  verifyRefreshToken,
  hashToken,
  compareTokenHash,
  AuthTokenPair,
} from './token.service.js';

export interface AuthResult {
  user: IUser;
  tokens: AuthTokenPair;
}

/**
 * Authenticate a user with a Google idToken.
 *
 * Flow:
 * 1. Verify idToken with Google
 * 2. Find user by googleId → fallback to email (migration) → create new
 * 3. Generate token pair + store hashed refresh token
 */
export const authenticateWithGoogle = async (idToken: string): Promise<AuthResult> => {
  const googlePayload = await verifyGoogleToken(idToken);

  /**
   * Split Google display name into fName / lName.
   * Google provides a single "name" field.
   */
  const nameParts = (googlePayload.name || '').trim().split(/\s+/);
  const fName = nameParts[0] || '';
  const lName = nameParts.slice(1).join(' ') || '';

  // Step 1: Try lookup by googleId (fast path for returning users)
  let user = await User.findOne({ googleId: googlePayload.sub });

  if (user) {
    // Update profile data from verified token
    user.fName = fName;
    user.lName = lName;
    user.picture = googlePayload.picture;
    user.email = googlePayload.email;
    await user.save();
  } else {
    // Step 2: Migration — existing user by email without googleId
    user = await User.findOne({ email: googlePayload.email });

    if (user) {
      user.googleId = googlePayload.sub;
      user.fName = user.fName || fName;
      user.lName = user.lName || lName;
      user.picture = googlePayload.picture;
      // Ensure socialAccounts includes this Google account
      const hasGoogle = user.socialAccounts?.some(
        (sa) => sa.provider === 'google' && sa.id === googlePayload.sub
      );
      if (!hasGoogle) {
        user.socialAccounts = [
          ...(user.socialAccounts || []),
          { provider: 'google', id: googlePayload.sub },
        ];
      }
      if (user.tokenVersion === undefined) user.tokenVersion = 0;
      if (user.refreshTokenHash === undefined) user.refreshTokenHash = null;
      await user.save();
    } else {
      // Step 3: Brand new user
      user = await User.create({
        fName,
        lName,
        email: googlePayload.email,
        googleId: googlePayload.sub,
        picture: googlePayload.picture,
        socialAccounts: [{ provider: 'google', id: googlePayload.sub }],
        role: 'user',
        tokenVersion: 0,
        refreshTokenHash: null,
      });
    }
  }

  // Step 4: Generate token pair
  const tokens = generateTokenPair(user._id.toString(), user.tokenVersion);

  // Step 5: Store hashed refresh token
  user.refreshTokenHash = hashToken(tokens.refresh.token);
  await user.save();

  return { user, tokens };
};

/**
 * Refresh authentication tokens with rotation and replay detection.
 */
export const refreshAuthTokens = async (refreshToken: string): Promise<AuthTokenPair> => {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  const user = await User.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Verify tokenVersion — reject tokens from before logout
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new Error('Token version mismatch — session invalidated');
  }

  // Compare hash — detect replay attacks
  if (!user.refreshTokenHash || !compareTokenHash(refreshToken, user.refreshTokenHash)) {
    // REPLAY DETECTED — nuclear option
    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    await user.save();
    throw new Error('Refresh token reuse detected — all sessions invalidated');
  }

  // Issue new tokens (rotation)
  const tokens = generateTokenPair(user._id.toString(), user.tokenVersion);

  user.refreshTokenHash = hashToken(tokens.refresh.token);
  await user.save();

  return tokens;
};

/**
 * Logout user — invalidate ALL sessions.
 */
export const logoutUser = async (userId: string): Promise<void> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.tokenVersion += 1;
  user.refreshTokenHash = null;
  await user.save();
};
