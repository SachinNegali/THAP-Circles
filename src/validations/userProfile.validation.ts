import { z } from 'zod';
import { Types } from 'mongoose';

const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'] as const;

/**
 * Phone: permissive E.164-ish — digits with optional leading "+",
 * length 7–20. Deeper carrier validation belongs outside the API.
 */
const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9][0-9\s\-]{6,19}$/, 'Invalid phone number');

const addressSchema = z.object({
  line1: z.string().trim().max(200).optional(),
  line2: z.string().trim().max(200).optional(),
  city: z.string().trim().max(100).optional(),
  state: z.string().trim().max(100).optional(),
  country: z.string().trim().max(100).optional(),
  postalCode: z.string().trim().max(20).optional(),
});

export const emergencyContactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: phoneSchema,
  relation: z.string().trim().max(50).optional(),
});

/**
 * PATCH /user/profile — any subset; missing field = unchanged.
 * Sending address: {} clears the address. Sending null on a field
 * within address clears that field.
 */
export const updateProfileSchema = z
  .object({
    bloodGroup: z.enum(BLOOD_GROUPS).optional(),
    address: addressSchema.optional(),
    emergencyContacts: z.array(emergencyContactSchema).max(10).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const addEmergencyContactSchema = emergencyContactSchema;

export const updateEmergencyContactSchema = emergencyContactSchema.partial().refine(
  (data) => Object.keys(data).length > 0,
  { message: 'At least one field must be provided' }
);

/**
 * Validates :contactId path param as a 24-char hex ObjectId so malformed
 * ids fail fast with 400 instead of reaching Mongoose and throwing
 * CastError from deep inside the query.
 */
export const contactIdParamsSchema = z.object({
  contactId: z
    .string()
    .trim()
    .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid contactId' }),
});
