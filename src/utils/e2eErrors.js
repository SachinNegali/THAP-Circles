/**
 * E2EE-specific error codes and helpers
 * These codes are returned in error responses for E2EE operations
 */

export const E2E_ERRORS = {
  E2E_001: { code: 'E2E_001', status: 404, message: 'Key bundle not found for user' },
  E2E_002: { code: 'E2E_002', status: 410, message: 'No one-time pre-keys available' },
  E2E_003: { code: 'E2E_003', status: 400, message: 'Invalid key bundle format' },
  E2E_004: { code: 'E2E_004', status: 403, message: 'Not a participant in this chat' },
  E2E_005: { code: 'E2E_005', status: 413, message: 'Media file exceeds maximum size (100 MB)' },
  E2E_006: { code: 'E2E_006', status: 429, message: 'Key bundle fetch rate limit exceeded' },
  E2E_007: { code: 'E2E_007', status: 404, message: 'Sender key not found for group member' },
  E2E_008: { code: 'E2E_008', status: 400, message: 'Device not registered' },
};

/**
 * Send an E2EE-specific error response
 * @param {Object} res - Express response object
 * @param {string} errorCode - E2E error code (e.g., 'E2E_001')
 * @param {string} [detail] - Optional additional detail
 */
export const sendE2EError = (res, errorCode, detail = null) => {
  const error = E2E_ERRORS[errorCode];
  if (!error) {
    return res.status(500).send({ success: false, message: 'Unknown E2EE error' });
  }

  return res.status(error.status).send({
    success: false,
    code: error.code,
    message: error.message,
    ...(detail && { detail }),
  });
};
