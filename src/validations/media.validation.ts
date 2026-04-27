import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

const MAX_FILE_SIZE = 1024 * 1024 * 1024;
const MIN_FILE_SIZE = 1;

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  'video/x-matroska',
  'video/3gpp',
] as const;

/** UUID v4 shape used for client-generated image IDs. */
const imageIdSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_\-]+$/, 'imageId contains invalid characters');

const sizeBytesSchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? parseInt(v, 10) : v))
  .refine(
    (n) => Number.isFinite(n) && n >= MIN_FILE_SIZE && n <= MAX_FILE_SIZE,
    `sizeBytes must be between ${MIN_FILE_SIZE} and ${MAX_FILE_SIZE}`
  );

export const initUploadSchema = z.object({
  chatId: objectIdSchema,
  messageId: z.string().trim().min(1).max(128),
  imageId: imageIdSchema,
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: sizeBytesSchema,
});

export const completeUploadSchema = z.object({
  imageId: imageIdSchema,
});

export const batchStatusSchema = z.object({
  imageIds: z
    .array(imageIdSchema)
    .min(1, 'imageIds array is required')
    .max(200, 'Too many imageIds in one request'),
});

export const uploadLegacyBodySchema = z.object({
  chatId: objectIdSchema,
  mimeType: z.string().trim().max(255).optional(),
  sizeBytes: sizeBytesSchema.optional(),
});

export const imageIdParamsSchema = z.object({
  imageId: imageIdSchema,
});

export const mediaIdParamsSchema = z.object({
  mediaId: z
    .string()
    .trim()
    .regex(/^enc_[a-z0-9_]+$/i, 'Invalid mediaId'),
});

export const getMediaQuerySchema = z.object({
  chatId: objectIdSchema.optional(),
  variant: z.enum(['thumbnail', 'optimized', 'original']).optional(),
});

export type InitUploadInput = z.infer<typeof initUploadSchema>;
export type CompleteUploadInput = z.infer<typeof completeUploadSchema>;
export type BatchStatusInput = z.infer<typeof batchStatusSchema>;
export type UploadLegacyBody = z.infer<typeof uploadLegacyBodySchema>;
