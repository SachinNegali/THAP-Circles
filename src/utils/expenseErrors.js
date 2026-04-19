import logger from '../config/logger.js';

const log = logger.child({ module: 'expense' });

export class ExpenseError extends Error {
  constructor(code, message, status = 400, extra = {}) {
    super(message);
    this.code = code;
    this.status = status;
    this.extra = extra;
  }
}

export const handleExpenseError = (res, error, fallbackMessage = 'Request failed') => {
  if (error instanceof ExpenseError) {
    return res.status(error.status).send({
      message: error.message,
      error: error.code,
      ...error.extra,
    });
  }
  log.error({ err: error }, fallbackMessage);
  return res.status(500).send({
    message: fallbackMessage,
    ...(process.env.NODE_ENV === 'development' && { detail: error.message }),
  });
};
