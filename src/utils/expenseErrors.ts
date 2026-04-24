import { Response } from 'express';
import logger from '../config/logger.js';

const log = logger.child({ module: 'expense' });

export class ExpenseError extends Error {
  code: string;
  status: number;
  extra: Record<string, unknown>;

  constructor(
    code: string,
    message: string,
    status = 400,
    extra: Record<string, unknown> = {}
  ) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export const handleExpenseError = (
  res: Response,
  error: unknown,
  fallbackMessage = 'Request failed'
): Response => {
  if (error instanceof ExpenseError) {
    return res.status(error.status).send({
      message: error.message,
      error: error.code,
      ...error.extra,
    });
  }
  log.error({ err: error }, fallbackMessage);
  const detail = error instanceof Error ? error.message : undefined;
  return res.status(500).send({
    message: fallbackMessage,
    ...(process.env['NODE_ENV'] === 'development' && detail ? { detail } : {}),
  });
};
