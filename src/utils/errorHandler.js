/**
 * Simple error handler utility to send consistent error responses
 * Usage in catch blocks:
 * catch (error) {
 *   return handleError(res, error, 'Custom error message', 500);
 * }
 */

/**
 * Send error response
 * @param {Object} res - Express response object
 * @param {Error} error - Error object
 * @param {string} [message] - Custom error message (optional)
 * @param {number} [statusCode] - HTTP status code (default: 500)
 */
export const handleError = (res, error, message = null, statusCode = 500) => {
  // Log the error for debugging
  console.error('Error:', error);

  // Send response
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
