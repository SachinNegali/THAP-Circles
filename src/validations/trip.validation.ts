/**
 * Trip Validation Schemas — Zod
 * ================================
 *
 * Reject malformed input before it reaches the service layer.
 * Every user-supplied string is trimmed and length-capped; every
 * numeric coordinate is range-checked; every ObjectId is format-checked.
 */

import { z } from 'zod';
import { Types } from 'mongoose';

/** 24-char hex ObjectId validator. */
const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

/**
 * Location subdocument.
 * Aligns with src/models/location.schema.js — type = point | area | city.
 * Coordinates are optional but must be in valid lat/lng range if provided.
 */
const locationSchema = z
  .object({
    type: z.enum(['point', 'area', 'city']),
    name: z.string().trim().min(1, 'Location name is required').max(200),
    coordinates: z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
      })
      .optional(),
    city: z.string().trim().max(100).optional(),
    area: z.string().trim().max(100).optional(),
  })
  .refine(
    (loc) => loc.type !== 'point' || !!loc.coordinates,
    { message: 'coordinates are required when type=point' }
  );

/**
 * ISO-ish date string accepted by `new Date(...)`. We reject anything
 * that parses to Invalid Date rather than trusting free-form input.
 */
const dateStringSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: 'Invalid date' });

/** "HH:MM" 24-hour clock, optional and nullable on input. */
const startTimeSchema = z
  .string()
  .trim()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'startTime must be HH:MM')
  .nullable()
  .optional();

const daysSchema = z
  .number()
  .int('days must be an integer')
  .min(1, 'days must be at least 1')
  .max(365, 'days must be at most 365');

const spotsSchema = z
  .number()
  .int('spots must be an integer')
  .min(1, 'spots must be at least 1')
  .max(100, 'spots must be at most 100')
  .nullable();

const distanceSchema = z.number().min(0).max(100000).optional();
const elevationSchema = z.number().min(-1000).max(20000).optional();

/**
 * POST /trips — create a trip.
 * Trip duration is expressed as `days`; the service derives endDate from
 * startDate + days. `requireApproval` controls whether /join auto-admits.
 */
export const createTripSchema = z.object({
  title: z.string().trim().min(1, 'Trip title is required').max(200),
  description: z.string().trim().max(1000).optional(),
  startLocation: locationSchema,
  destination: locationSchema,
  stops: z.array(locationSchema).max(20).optional(),
  startDate: dateStringSchema,
  startTime: startTimeSchema,
  days: daysSchema,
  spots: spotsSchema,
  requireApproval: z.boolean().optional().default(true),
  distance: distanceSchema,
  elevation: elevationSchema,
  participantIds: z.array(objectIdSchema).max(100).optional(),
});

/**
 * PATCH /trips/:id — all fields optional; at least one required.
 */
export const updateTripSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    description: z.string().trim().max(1000).optional(),
    startLocation: locationSchema.optional(),
    destination: locationSchema.optional(),
    stops: z.array(locationSchema).max(20).optional(),
    startDate: dateStringSchema.optional(),
    startTime: startTimeSchema,
    days: daysSchema.optional(),
    spots: spotsSchema.optional(),
    requireApproval: z.boolean().optional(),
    distance: distanceSchema,
    elevation: elevationSchema,
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

/**
 * POST /trips/:id/participants — bulk-add participants by id.
 */
export const addParticipantsSchema = z.object({
  participantIds: z
    .array(objectIdSchema)
    .min(1, 'participantIds array is required')
    .max(100, 'Too many participants in one request'),
});

/** :id param schema — used by any /trips/:id route. */
export const tripIdParamsSchema = z.object({
  id: objectIdSchema,
});

/** :id + :userId param schema — used for participant and join-request subroutes. */
export const tripIdUserIdParamsSchema = z.object({
  id: objectIdSchema,
  userId: objectIdSchema,
});

/**
 * GET /trips — current user's trips, paginated.
 */
export const listUserTripsQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .refine((v) => Number.isFinite(v) && v > 0, 'Page must be > 0'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 100, 'Limit must be 1-100'),
});

/**
 * GET /trips/filter — search. All filters are optional; when provided,
 * `from`/`to` are fed into a regex, so we length-cap and strip regex
 * specials in the service to prevent ReDoS. Dates use dateStringSchema.
 */
export const searchTripsQuerySchema = z.object({
  from: z.string().trim().max(100).optional(),
  to: z.string().trim().max(100).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .refine((v) => Number.isFinite(v) && v > 0, 'Page must be > 0'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 20))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 100, 'Limit must be 1-100'),
});

export type CreateTripInput = z.infer<typeof createTripSchema>;
export type UpdateTripInput = z.infer<typeof updateTripSchema>;
export type AddParticipantsInput = z.infer<typeof addParticipantsSchema>;
export type ListUserTripsQuery = z.infer<typeof listUserTripsQuerySchema>;
export type SearchTripsQuery = z.infer<typeof searchTripsQuerySchema>;
