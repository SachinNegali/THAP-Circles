/**
 * Google Token Verification Service
 * ===================================
 *
 * SECURITY DECISIONS:
 * - The OAuth2Client from google-auth-library handles:
 *   ✓ Signature verification against Google's public keys
 *   ✓ Certificate caching and auto-rotation
 *   ✓ Expiry validation (exp claim)
 *   ✓ Issuer validation (iss must be accounts.google.com)
 * - We additionally enforce:
 *   ✓ Audience matches OUR client ID (prevents token from other apps)
 *   ✓ email_verified is true (prevents unverified email impersonation)
 *
 * ATTACK PREVENTION:
 * - Without audience validation, an attacker could use an idToken issued
 *   to a DIFFERENT Google app to authenticate here.
 * - Without email_verified check, an attacker could create a Google
 *   account with someone else's email before they verify it.
 */

import { OAuth2Client, TokenPayload } from 'google-auth-library';
import config from '../config/config.js';

/**
 * Single OAuth2Client instance — reuses cached Google certs.
 * Initialised with our Client ID so verifyIdToken checks audience.
 */
const client = new OAuth2Client(config.google.clientId);

export interface GoogleUserPayload {
  sub: string;          // Unique Google user ID — stable across sessions
  email: string;        // User's email — only trusted when email_verified=true
  name: string;         // Display name
  picture: string;      // Profile picture URL
  email_verified: boolean;
}

/**
 * Verify a Google idToken and extract the user payload.
 *
 * @param idToken - The idToken string from the frontend Google Sign-In
 * @returns Verified user payload
 * @throws Error if token is invalid, expired, wrong audience, or email unverified
 */
export const verifyGoogleToken = async (idToken: string): Promise<GoogleUserPayload> => {
  /**
   * verifyIdToken performs the following server-side checks:
   * 1. Fetches Google's public keys (cached with auto-refresh)
   * 2. Verifies the JWT signature
   * 3. Checks exp (expiry) — rejects expired tokens
   * 4. Checks iss (issuer) — must be accounts.google.com or https://accounts.google.com
   * 5. Checks aud (audience) — must match our GOOGLE_CLIENT_ID
   *
   * If ANY check fails, it throws — we never see the payload.
   */
  const ticket = await client.verifyIdToken({
    idToken,
    audience: config.google.clientId,
  });

  const payload: TokenPayload | undefined = ticket.getPayload();

  if (!payload) {
    throw new Error('Unable to extract token payload');
  }

  /**
   * CRITICAL: Reject unverified emails.
   * Without this check, an attacker could:
   * 1. Create a Google account with victim's email
   * 2. Before email verification, get an idToken
   * 3. Use that token to create an account here as the victim
   */
  if (!payload.email_verified) {
    throw new Error('Email not verified by Google');
  }

  if (!payload.email || !payload.sub) {
    throw new Error('Token payload missing required fields');
  }

  return {
    sub: payload.sub,
    email: payload.email,
    name: payload.name || '',
    picture: payload.picture || '',
    email_verified: payload.email_verified,
  };
};
