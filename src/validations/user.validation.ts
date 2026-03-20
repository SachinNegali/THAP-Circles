import { z } from 'zod';

/**
 * Schema for PATCH /user/me
 * All fields are optional — client sends only what changed.
 * At least one field must be present.
 */
export const updateMeSchema = z
  .object({
    fName: z.string().trim().min(1, 'First name cannot be empty').max(50).optional(),
    lName: z.string().trim().max(50).optional(),
    userId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z0-9_]{3,20}$/,
        'Username must be 3–20 characters: lowercase letters, numbers, and underscores only'
      )
      .optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });
