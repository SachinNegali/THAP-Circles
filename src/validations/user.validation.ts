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

/**
 * Schema for GET /user/search
 * Validates query parameters for fuzzy search and pagination.
 * q: search key (fName, lName, or userId)
 * page: page number (default 1)
 * limit: results per page (default 10)
 */
export const searchUsersSchema = z.object({
  q: z.string().trim().default(''),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .refine((val) => val > 0, 'Page must be greater than 0'),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .refine((val) => val > 0 && val <= 100, 'Limit must be between 1 and 100'),
});
