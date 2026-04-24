import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

const amountSchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === 'string' ? Number(v) : v))
  .refine((v) => Number.isFinite(v) && v > 0, 'amount must be > 0')
  .refine((v) => v <= 10_000_000, 'amount exceeds maximum');

const currencySchema = z
  .string()
  .trim()
  .regex(/^[A-Z]{3}$/, 'currency must be a 3-letter ISO code')
  .optional();

const customSplitSchema = z.object({
  userId: objectIdSchema,
  amount: z
    .union([z.number(), z.string()])
    .transform((v) => (typeof v === 'string' ? Number(v) : v))
    .refine((v) => Number.isFinite(v) && v >= 0, 'split amount must be >= 0'),
});

const dateStringSchema = z
  .string()
  .trim()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Invalid date');

export const createCycleSchema = z.object({
  currency: currencySchema,
});

export const createExpenseSchema = z
  .object({
    amount: amountSchema,
    category: z.string().trim().min(1).max(50),
    note: z.string().trim().max(500).optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
    splitType: z.enum(['equal', 'custom']).optional(),
    memberIds: z.array(objectIdSchema).max(256).optional(),
    paidBy: objectIdSchema.optional(),
    customSplits: z.array(customSplitSchema).max(256).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.splitType === 'custom') {
      if (!data.customSplits || data.customSplits.length === 0) {
        ctx.addIssue({
          code: 'custom',
          message: 'customSplits required for custom split',
          path: ['customSplits'],
        });
      }
    } else if (!data.memberIds || data.memberIds.length === 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'memberIds required for equal split',
        path: ['memberIds'],
      });
    }
  });

export const updateExpenseSchema = z
  .object({
    amount: amountSchema.optional(),
    category: z.string().trim().min(1).max(50).optional(),
    note: z.string().trim().max(500).optional(),
    imageUrl: z.string().trim().max(2048).nullable().optional(),
    splitType: z.enum(['equal', 'custom']).optional(),
    memberIds: z.array(objectIdSchema).max(256).optional(),
    paidBy: objectIdSchema.optional(),
    customSplits: z.array(customSplitSchema).max(256).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: 'At least one field must be provided',
  });

export const listExpensesQuerySchema = z.object({
  cycleId: objectIdSchema.optional(),
  category: z.string().trim().max(50).optional(),
  paidBy: objectIdSchema.optional(),
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
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

export const addCommentSchema = z.object({
  text: z.string().trim().min(1).max(500),
});

export const initiateSettlementSchema = z.object({
  fromUserId: objectIdSchema,
  toUserId: objectIdSchema,
  amount: amountSchema,
});

export const sendNudgeSchema = z.object({
  toUserId: objectIdSchema,
});

export const groupIdParamsSchema = z.object({
  groupId: objectIdSchema,
});

export const groupExpenseIdParamsSchema = z.object({
  groupId: objectIdSchema,
  expenseId: objectIdSchema,
});

export const groupSettlementIdParamsSchema = z.object({
  groupId: objectIdSchema,
  settlementId: objectIdSchema,
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;
export type CreateExpenseInput = z.infer<typeof createExpenseSchema>;
export type UpdateExpenseInput = z.infer<typeof updateExpenseSchema>;
export type ListExpensesQuery = z.infer<typeof listExpensesQuerySchema>;
export type AddCommentInput = z.infer<typeof addCommentSchema>;
export type InitiateSettlementInput = z.infer<typeof initiateSettlementSchema>;
export type SendNudgeInput = z.infer<typeof sendNudgeSchema>;
