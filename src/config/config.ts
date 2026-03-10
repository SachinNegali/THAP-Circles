/**
 * Application Configuration
 * =========================
 * Centralised, typed config pulling from environment variables.
 *
 * SECURITY DECISIONS:
 * - Separate secrets for access and refresh tokens so that compromise
 *   of one does not compromise the other.
 * - Access tokens are short-lived (15 min) to limit damage window.
 * - Refresh tokens last 7 days with rotation to detect replay.
 */

import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  mongoose: {
    url: process.env.MONGO_URI || 'mongodb://localhost:27017/circles',
  },

  /** Google OAuth — used to verify idTokens from the frontend */
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
  },

  jwt: {
    /** Access token secret — NEVER reuse across token types */
    accessSecret: process.env.JWT_ACCESS_SECRET || 'access-secret-change-me',
    /** Refresh token secret — separate from access to isolate compromise */
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'refresh-secret-change-me',
    /** 15 minutes — short window limits damage from stolen access tokens */
    accessExpirationMinutes: parseInt(process.env.JWT_ACCESS_EXPIRATION_MINUTES || '15', 10),
    /** 7 days — longer lifespan, but rotated on every refresh */
    refreshExpirationDays: parseInt(process.env.JWT_REFRESH_EXPIRATION_DAYS || '7', 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
  },
} as const;

export default config;
