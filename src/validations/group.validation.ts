import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

const settingsSchema = z.object({
  onlyAdminsCanMessage: z.boolean().optional(),
  onlyAdminsCanEditInfo: z.boolean().optional(),
  maxMembers: z.number().int().min(2).max(1024).optional(),
});

export const createGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    memberIds: z.array(objectIdSchema).max(256).optional(),
    type: z.enum(['dm', 'group']).optional(),
  })
  .refine((d) => d.type === 'dm' || !!d.name, {
    message: 'Group name is required for groups',
    path: ['name'],
  });

export const createDMSchema = z.object({
  recipientId: objectIdSchema,
});

export const updateGroupSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    description: z.string().trim().max(500).optional(),
    avatar: z.string().trim().max(2048).nullable().optional(),
    settings: settingsSchema.optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export const addMembersSchema = z.object({
  memberIds: z
    .array(objectIdSchema)
    .min(1, 'memberIds array is required')
    .max(256),
});

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

const imageIdInMetadataSchema = z
  .string()
  .trim()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9_\-]+$/, 'imageId contains invalid characters');

const messageMetadataSchema = z
  .object({
    imageIds: z.array(imageIdInMetadataSchema).max(20).optional(),
  })
  .passthrough();

export const sendMessageSchema = z
  .object({
    content: z.string().max(5000).optional(),
    type: z.enum(['text', 'image', 'file', 'system', 'spend']).optional(),
    metadata: messageMetadataSchema.optional(),
  })
  .superRefine((data, ctx) => {
    const isMedia = data.type === 'image' || data.type === 'file';
    if (!isMedia && (!data.content || !data.content.trim())) {
      ctx.addIssue({
        code: 'custom',
        message: 'Message content is required',
        path: ['content'],
      });
    }
    if (data.type === 'image') {
      const imageIds = data.metadata?.imageIds;
      if (!Array.isArray(imageIds) || imageIds.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'metadata.imageIds array is required for image messages',
          path: ['metadata', 'imageIds'],
        });
      }
    }
  });

export const groupIdParamsSchema = z.object({
  id: objectIdSchema,
});

export const groupIdUserIdParamsSchema = z.object({
  id: objectIdSchema,
  userId: objectIdSchema,
});

export const recipientIdParamsSchema = z.object({
  recipientId: objectIdSchema,
});

export const paginationQuerySchema = z.object({
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

export const messagesListQuerySchema = z.object({
  page: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 1))
    .refine((v) => Number.isFinite(v) && v > 0, 'Page must be > 0'),
  limit: z
    .string()
    .optional()
    .transform((v) => (v ? parseInt(v, 10) : 50))
    .refine((v) => Number.isFinite(v) && v > 0 && v <= 200, 'Limit must be 1-200'),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
export type UpdateGroupInput = z.infer<typeof updateGroupSchema>;
export type AddMembersInput = z.infer<typeof addMembersSchema>;
export type UpdateMemberRoleInput = z.infer<typeof updateMemberRoleSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
