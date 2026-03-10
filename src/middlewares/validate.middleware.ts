/**
 * Zod Validation Middleware
 * ==========================
 *
 * Generic middleware factory that validates req.body against a Zod schema.
 *
 * SECURITY DECISIONS:
 * - Validation happens BEFORE any business logic, rejecting malformed
 *   input at the gate.
 * - Error messages are sanitised — we return Zod's field-level errors
 *   (which are helpful) but not stack traces or internal details.
 *
 * NOTE: We validate req.body directly (as a plain object copy) because
 * Express 5 uses null-prototype objects that Zod v4 can't parse.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

/**
 * Creates an Express middleware that validates req.body against
 * the provided Zod schema.
 *
 * Usage:
 *   router.post('/auth/google', validate(googleAuthSchema), googleAuth);
 *
 * @param schema - Zod schema that describes the expected req.body shape
 */
export const validate = (schema: z.ZodType) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      /**
       * Spread req.body into a plain object to strip the null prototype.
       * Express 5 creates req.body as [Object: null prototype] which
       * can confuse Zod's instanceof checks.
       */
      const body = { ...req.body };
      schema.parse(body);

      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors = error.issues.map((issue: z.ZodIssue) => ({
          field: issue.path.join('.'),
          message: issue.message,
        }));

        res.status(400).json({
          message: 'Validation failed',
          errors,
        });
        return;
      }

      res.status(500).json({ message: 'Internal validation error' });
    }
  };
};
