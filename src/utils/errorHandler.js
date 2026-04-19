import logger from '../config/logger.js';

const log = logger.child({ module: 'errorHandler' });

export const handleError = (res, error, message = null, statusCode = 500) => {
  log.error({ err: error, statusCode }, message || error.message);

  return res.status(statusCode).send({
    message: message || error.message || 'Internal Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
  });
};

/**
 * Common error responses for convenience
 */
export const sendBadRequest = (res, message = 'Bad Request') => {
  return res.status(400).send({ message });
};

export const sendUnauthorized = (res, message = 'Unauthorized') => {
  return res.status(401).send({ message });
};

export const sendForbidden = (res, message = 'Forbidden') => {
  return res.status(403).send({ message });
};

export const sendNotFound = (res, message = 'Not Found') => {
  return res.status(404).send({ message });
};

export const sendServerError = (res, message = 'Internal Server Error') => {
  return res.status(500).send({ message });
};
