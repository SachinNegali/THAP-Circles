import { z } from 'zod';
import { Types } from 'mongoose';

const objectIdSchema = z
  .string()
  .trim()
  .refine((v) => Types.ObjectId.isValid(v), { message: 'Invalid id' });

export const messageIdParamsSchema = z.object({
  id: objectIdSchema,
});
