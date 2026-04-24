/**
 * Device Validation Schemas — Zod
 * ==================================
 *
 * Inputs from the app when registering or updating a device. The push
 * token is a free-form provider string (FCM/APNs) so we only bound its
 * length and strip whitespace.
 */

import { z } from 'zod';

/** Provider push tokens vary in format; bound length to prevent abuse. */
const pushTokenSchema = z.string().trim().min(1).max(4096);

/**
 * POST /devices/register
 * deviceName is optional metadata; platform is constrained to ios/android
 * (matches the mongoose enum); pushToken is optional — a device may
 * register before push permissions are granted.
 */
export const registerDeviceSchema = z.object({
  deviceName: z.string().trim().max(100).optional(),
  platform: z.enum(['ios', 'android']),
  pushToken: pushTokenSchema.optional(),
});

export type RegisterDeviceInput = z.infer<typeof registerDeviceSchema>;
