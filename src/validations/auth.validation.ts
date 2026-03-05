/**
 * Auth Validation Schemas — Zod
 * ==============================
 *
 * SECURITY DECISIONS:
 * - Input validation is the FIRST line of defense.
 * - Zod schemas reject malformed input BEFORE it reaches any business logic.
 * - This prevents injection attacks, unexpected types, and malformed payloads.
 * - We validate structure ONLY — actual token verification happens in services.
 *
 * NOTE: Schemas validate req.body directly (not wrapped in { body, query, params })
 * because Express 5 uses null-prototype objects for req.query/params which break Zod.
 */

import { z } from 'zod';

/**
 * Schema for POST /auth/google
 * Accepts ONLY an idToken string — nothing else.
 * The frontend MUST NOT send email, name, or any user data.
 */
export const googleAuthSchema = z.object({
  idToken: z.string().min(1, 'idToken is required'),
});

/**
 * Schema for POST /auth/refresh
 * Accepts ONLY a refreshToken string.
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});
