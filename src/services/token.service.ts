/**
 * Token Service — JWT Generation, Verification & Hashing
 * ========================================================
 *
 * SECURITY DECISIONS:
 * - SEPARATE SECRETS for access and refresh tokens.
 * - TOKEN VERSIONING: tokens embed tokenVersion for logout invalidation.
 * - SHA-256 HASHING: Refresh tokens hashed before storage.
 * - TIMING-SAFE COMPARISON: Prevents timing side-channel attacks.
 */

import jwt, { JwtPayload } from 'jsonwebtoken';
import crypto from 'crypto';
import config from '../config/config.js';

export interface TokenPayload extends JwtPayload {
  userId: string;
  tokenVersion: number;
  type: 'access' | 'refresh';
}

export interface TokenWithExpiry {
  token: string;
  expires: string; // ISO 8601 date string
}

export interface AuthTokenPair {
  access: TokenWithExpiry;
  refresh: TokenWithExpiry;
}

/**
 * Generate access + refresh token pair with expiry dates.
 */
export const generateTokenPair = (userId: string, tokenVersion: number): AuthTokenPair => {
  const now = new Date();

  const accessExpiresAt = new Date(now.getTime() + config.jwt.accessExpirationMinutes * 60 * 1000);
  const refreshExpiresAt = new Date(now.getTime() + config.jwt.refreshExpirationDays * 24 * 60 * 60 * 1000);

  const accessToken = jwt.sign(
    { userId, tokenVersion, type: 'access' },
    config.jwt.accessSecret,
    { expiresIn: `${config.jwt.accessExpirationMinutes}m` }
  );

  const refreshToken = jwt.sign(
    { userId, tokenVersion, type: 'refresh' },
    config.jwt.refreshSecret,
    { expiresIn: `${config.jwt.refreshExpirationDays}d` }
  );

  return {
    access: { token: accessToken, expires: accessExpiresAt.toISOString() },
    refresh: { token: refreshToken, expires: refreshExpiresAt.toISOString() },
  };
};

/**
 * Verify an access token and return the decoded payload.
 */
export const verifyAccessToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.accessSecret) as TokenPayload;
};

/**
 * Verify a refresh token and return the decoded payload.
 */
export const verifyRefreshToken = (token: string): TokenPayload => {
  return jwt.verify(token, config.jwt.refreshSecret) as TokenPayload;
};

/**
 * Hash a token using SHA-256.
 */
export const hashToken = (token: string): string => {
  return crypto.createHash('sha256').update(token).digest('hex');
};

/**
 * Compare a raw token against a stored hash in constant time.
 */
export const compareTokenHash = (token: string, storedHash: string): boolean => {
  const tokenHash = hashToken(token);
  const tokenHashBuffer = Buffer.from(tokenHash, 'hex');
  const storedHashBuffer = Buffer.from(storedHash, 'hex');

  if (tokenHashBuffer.length !== storedHashBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(tokenHashBuffer, storedHashBuffer);
};
