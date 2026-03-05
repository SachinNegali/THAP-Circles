/**
 * Token Service — JWT Generation, Verification & Hashing
 * ========================================================
 *
 * SECURITY DECISIONS:
 * - SEPARATE SECRETS: Access and refresh tokens use different secrets.
 *   If an access token secret is compromised (e.g., via leaked logs),
 *   refresh tokens remain secure and vice versa.
 * - TOKEN VERSIONING: Every token embeds a `tokenVersion`. On logout,
 *   the user's version is incremented, making all previously issued
 *   tokens invalid without maintaining a denylist.
 * - SHA-256 HASHING: Refresh tokens are hashed with SHA-256 before
 *   storage. We use SHA-256 (not bcrypt) because:
 *   1. Refresh tokens are high-entropy (cryptographically random JWTs),
 *      so brute-force is infeasible regardless of hash speed.
 *   2. We need constant-time comparison (timingSafeEqual), which is
 *      straightforward with fixed-length SHA-256 digests.
 * - TIMING-SAFE COMPARISON: Prevents timing side-channel attacks
 *   where an attacker measures response time to guess tokens byte-by-byte.
 */

import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/config.js';

export interface TokenPayload extends JwtPayload {
  userId: string;
  tokenVersion: number;
  type: 'access' | 'refresh';
}

/**
 * Generate a short-lived access token.
 *
 * Includes userId and tokenVersion so the auth middleware can:
 * 1. Look up the user
 * 2. Verify the token was issued AFTER the last logout
 *
 * @param userId - MongoDB ObjectId as string
 * @param tokenVersion - Current user's token version
 */
export const generateAccessToken = (userId: string, tokenVersion: number): string => {
  return jwt.sign(
    {
      userId,
      tokenVersion,
      type: 'access',
    },
    config.jwt.accessSecret,
    {
      expiresIn: `${config.jwt.accessExpirationMinutes}m`,
      /**
       * SECURITY: Short expiry (15 min default) limits the damage window
       * if an access token is stolen. The attacker has at most 15 minutes
       * before they need a refresh token (which they don't have).
       */
    }
  );
};

/**
 * Generate a long-lived refresh token.
 *
 * This token is NEVER sent to any API except /auth/refresh.
 * It is rotated on every use (one-time use pattern).
 *
 * @param userId - MongoDB ObjectId as string
 * @param tokenVersion - Current user's token version
 */
export const generateRefreshToken = (userId: string, tokenVersion: number): string => {
  return jwt.sign(
    {
      userId,
      tokenVersion,
      type: 'refresh',
    },
    config.jwt.refreshSecret,
    {
      expiresIn: `${config.jwt.refreshExpirationDays}d`,
    }
  );
};

/**
 * Verify an access token and return the decoded payload.
 *
 * @param token - Raw JWT string
 * @throws JsonWebTokenError if signature is invalid
 * @throws TokenExpiredError if token has expired
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
};

/**
 * Verify a refresh token and return the decoded payload.
 *
 * @param token - Raw JWT string
 * @throws JsonWebTokenError if signature is invalid
 * @throws TokenExpiredError if token has expired
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
};

/**
 * Hash a token using SHA-256.
 *
 * WHY SHA-256 and not bcrypt?
 * - JWTs are ~200+ chars of high-entropy data. Brute-forcing a SHA-256
 *   hash of a JWT is computationally infeasible (2^256 search space).
 * - bcrypt's slow hashing is designed for LOW-entropy passwords.
 *   For high-entropy tokens, SHA-256 is sufficient and much faster.
 * - SHA-256 produces fixed-length output, enabling timingSafeEqual.
 *
 * @param token - Raw token string
 * @returns Hex-encoded SHA-256 hash
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Compare a raw token against a stored hash in constant time.
 *
 * SECURITY: Using crypto.timingSafeEqual prevents timing side-channel
 * attacks. Without this, an attacker could:
 * 1. Send many requests with slight variations of a token
 * 2. Measure response times
 * 3. Determine how many leading bytes match
 * 4. Reconstruct the hash byte-by-byte
 *
 * @param token - Raw token to compare
 * @param storedHash - Previously stored SHA-256 hash
 * @returns true if the token matches the hash
 */
export const compareTokenHash = (token: string, storedHash: string): boolean => {
  const tokenHash = hashToken(token);
  const tokenHashBuffer = Buffer.from(tokenHash, 'hex');
  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  /**
   * timingSafeEqual requires both buffers to be the same length.
   * SHA-256 always produces 32 bytes, so this should always hold.
   * The length check is a safety net, not a shortcut.
   */
  if (tokenHashBuffer.length !== storedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenHashBuffer, storedHashBuffer);
};
