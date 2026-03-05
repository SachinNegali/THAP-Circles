/**
 * Auth Service — Core Authentication Business Logic
 * ===================================================
 *
 * Orchestrates the entire auth flow:
 * 1. Google token verification → user lookup/creation → token issuance
 * 2. Refresh token rotation with replay detection
 * 3. Logout with full session invalidation
 *
 * SECURITY DECISIONS:
 * - User lookup is by googleId (payload.sub), NEVER by email.
 *   Email can change; sub is immutable and guaranteed unique by Google.
 * - Refresh token rotation: every refresh issues a NEW refresh token
 *   and invalidates the old one. If an old token is reused, we know
 *   it was stolen (replay attack) and invalidate ALL sessions.
 * - On logout, tokenVersion is incremented. All access tokens carrying
 *   the old version are rejected by the auth middleware.
 */

import User, { IUser } from '../models/user.model.js';
import { verifyGoogleToken } from './google.service.js';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyRefreshToken,
  hashToken,
  compareTokenHash,
} from './token.service.js';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: IUser;
  tokens: AuthTokens;
}

/**
 * Authenticate a user with a Google idToken.
 *
 * Flow:
 * 1. Verify idToken with Google (signature, audience, issuer, expiry)
 * 2. Extract verified payload (sub, email, name, picture)
 * 3. Find user by googleId OR create new user
 * 4. Generate access + refresh tokens
 * 5. Hash refresh token and store on user document
 * 6. Return user + tokens
 *
 * @param idToken - Google idToken from frontend Sign-In
 */
export const authenticateWithGoogle = async (idToken: string): Promise<AuthResult> => {
  /**
   * STEP 1: Server-side verification of the Google idToken.
   * This is the critical security step — we NEVER trust the frontend.
   * The google-auth-library verifies:
   * - JWT signature against Google's rotating public keys
   * - Token expiry (prevents replay of old tokens)
   * - Audience matches our GOOGLE_CLIENT_ID (prevents cross-app token reuse)
   * - Issuer is accounts.google.com
   * We additionally check email_verified inside verifyGoogleToken.
   */
  const googlePayload = await verifyGoogleToken(idToken);

  /**
   * STEP 2: Find existing user by googleId.
   * WHY googleId and NOT email?
   * - Google's `sub` claim is IMMUTABLE and unique per Google account.
   * - Email can change (user changes their Gmail, org reassigns email).
   * - Using email as the primary key would allow account takeover
   *   if Google reassigns an email address.
   */
  let user = await User.findOne({ googleId: googlePayload.sub });

  if (user) {
    /**
     * Update profile data on each login.
     * Name and picture can change; email may change too.
     * Since we verified the token, these values are trustworthy.
     */
    user.name = googlePayload.name;
    user.picture = googlePayload.picture;
    user.email = googlePayload.email;
    await user.save();
  } else {
    /**
     * MIGRATION: If user exists by email but has no googleId,
     * they were created under the old schema. Link their Google
     * account by setting googleId from the verified token.
     * This is a one-time migration path per user.
     */
    user = await User.findOne({ email: googlePayload.email });

    if (user) {
      user.googleId = googlePayload.sub;
      user.name = googlePayload.name;
      user.picture = googlePayload.picture;
      if (user.tokenVersion === undefined) user.tokenVersion = 0;
      if (user.refreshTokenHash === undefined) user.refreshTokenHash = null;
      await user.save();
    } else {
      /**
       * STEP 3: Create new user from verified Google payload.
       * ALL fields come from the server-verified token, not from
       * any user-supplied request body.
       */
      user = await User.create({
        email: googlePayload.email,
        googleId: googlePayload.sub,
        name: googlePayload.name,
        picture: googlePayload.picture,
        role: 'user',
        tokenVersion: 0,
        refreshTokenHash: null,
      });
    }
  }

  /**
   * STEP 4: Generate tokens.
   * Both tokens embed the current tokenVersion so they can be
   * invalidated on logout without a token blacklist.
   */
  const accessToken = generateAccessToken(
    user._id.toString(),
    user.tokenVersion
  );
  const refreshToken = generateRefreshToken(
    user._id.toString(),
    user.tokenVersion
  );

  /**
   * STEP 5: Store HASHED refresh token.
   * We hash with SHA-256 before storing. If the DB is breached,
   * the attacker gets useless hashes, not usable tokens.
   */
  user.refreshTokenHash = hashToken(refreshToken);
  await user.save();

  return {
    user,
    tokens: {
      accessToken,
      refreshToken,
    },
  };
};

/**
 * Refresh authentication tokens.
 *
 * Implements REFRESH TOKEN ROTATION with replay detection:
 * - Valid refresh → issue new tokens, replace hash
 * - Reused/stolen refresh → invalidate ALL sessions (nuclear option)
 *
 * WHY ROTATION?
 * Without rotation, a stolen refresh token gives the attacker
 * indefinite access. With rotation, a stolen token can only be
 * used once — when the legitimate user tries to refresh next,
 * the hash won't match, triggering full invalidation.
 *
 * @param refreshToken - Raw refresh token from the client
 */
export const refreshAuthTokens = async (refreshToken: string): Promise<AuthTokens> => {
  /**
   * STEP 1: Verify JWT signature and expiry.
   * Uses the REFRESH secret (separate from access secret).
   */
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new Error('Invalid or expired refresh token');
  }

  /**
   * STEP 2: Find the user.
   */
  const user = await User.findById(payload.userId);
  if (!user) {
    throw new Error('User not found');
  }

  /**
   * STEP 3: Verify tokenVersion.
   * If the user logged out after this token was issued,
   * tokenVersion will have been incremented. Reject stale tokens.
   */
  if (payload.tokenVersion !== user.tokenVersion) {
    throw new Error('Token version mismatch — session invalidated');
  }

  /**
   * STEP 4: Compare refresh token hash.
   * This detects replay attacks:
   * - If hash matches → this is the current valid token
   * - If hash doesn't match → this token was already rotated out,
   *   meaning someone is replaying a stolen token
   */
  if (!user.refreshTokenHash || !compareTokenHash(refreshToken, user.refreshTokenHash)) {
    /**
     * REPLAY ATTACK DETECTED!
     * Someone is using an old refresh token. This means either:
     * a) The token was stolen and the attacker already used it
     * b) The legitimate user already refreshed, getting a new token
     *
     * NUCLEAR OPTION: Invalidate ALL sessions.
     * - Increment tokenVersion → all access tokens become invalid
     * - Clear refreshTokenHash → the current refresh token becomes invalid
     * Now BOTH the attacker AND the legitimate user must re-authenticate.
     * This is the safest response to potential token theft.
     */
    user.tokenVersion += 1;
    user.refreshTokenHash = null;
    await user.save();
    throw new Error('Refresh token reuse detected — all sessions invalidated');
  }

  /**
   * STEP 5: Issue new tokens (ROTATION).
   * The old refresh token hash is replaced, making the old token
   * single-use. Even if someone intercepts this refresh token,
   * it can only be used once.
   */
  const newAccessToken = generateAccessToken(
    user._id.toString(),
    user.tokenVersion
  );
  const newRefreshToken = generateRefreshToken(
    user._id.toString(),
    user.tokenVersion
  );

  /** Replace the stored hash with the new token's hash */
  user.refreshTokenHash = hashToken(newRefreshToken);
  await user.save();

  return {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken,
  };
};

/**
 * Logout user — invalidate ALL sessions.
 *
 * Two-pronged approach:
 * 1. Increment tokenVersion → all access tokens immediately invalid
 * 2. Clear refreshTokenHash → refresh token cannot be used
 *
 * The user must re-authenticate with Google to get new tokens.
 *
 * @param userId - The authenticated user's ID (from auth middleware)
 */
export const logoutUser = async (userId: string): Promise<void> => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  /**
   * Increment tokenVersion: any access token that was issued with
   * the old version will be rejected by the auth middleware's
   * tokenVersion check. No need for a token blacklist.
   */
  user.tokenVersion += 1;

  /**
   * Clear the refresh token hash: even if someone has the refresh
   * token, the hash comparison will fail (comparing against null).
   */
  user.refreshTokenHash = null;

  await user.save();
};
