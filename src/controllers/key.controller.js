import * as keyService from '../services/key.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Upload key bundle
 * POST /api/keys/bundle
 */
export const uploadKeyBundle = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, identityKey, signedPreKey, oneTimePreKeys } = req.body;

    if (!deviceId || !identityKey || !signedPreKey) {
      return sendE2EError(res, 'E2E_003', 'deviceId, identityKey, and signedPreKey are required');
    }

    if (!signedPreKey.id || !signedPreKey.key || !signedPreKey.signature) {
      return sendE2EError(res, 'E2E_003', 'signedPreKey must include id, key, and signature');
    }

    const result = await keyService.uploadKeyBundle(userId, {
      deviceId,
      identityKey,
      signedPreKey,
      oneTimePreKeys: oneTimePreKeys || [],
    });

    res.status(201).send({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.code === 'E2E_008') {
      return sendE2EError(res, 'E2E_008');
    }
    return handleError(res, error, 'Failed to upload key bundle');
  }
};

/**
 * Fetch key bundle for a user
 * GET /api/keys/bundle/:userId
 */
export const fetchKeyBundle = async (req, res) => {
  try {
    const targetUserId = req.params.userId;

    const data = await keyService.fetchKeyBundle(targetUserId);

    res.send({
      success: true,
      data,
    });
  } catch (error) {
    if (error.code === 'E2E_001') {
      return sendE2EError(res, 'E2E_001');
    }
    return handleError(res, error, 'Failed to fetch key bundle');
  }
};

/**
 * Replenish one-time pre-keys
 * POST /api/keys/prekeys
 */
export const replenishPreKeys = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId, oneTimePreKeys } = req.body;

    if (!deviceId || !oneTimePreKeys || !Array.isArray(oneTimePreKeys) || oneTimePreKeys.length === 0) {
      return sendBadRequest(res, 'deviceId and oneTimePreKeys array are required');
    }

    const data = await keyService.replenishPreKeys(userId, deviceId, oneTimePreKeys);

    res.send({
      success: true,
      data,
    });
  } catch (error) {
    if (error.code === 'E2E_001') {
      return sendE2EError(res, 'E2E_001');
    }
    return handleError(res, error, 'Failed to replenish pre-keys');
  }
};

/**
 * Get pre-key count
 * GET /api/keys/prekeys/count
 */
export const getPreKeyCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceId } = req.query;

    if (!deviceId) {
      return sendBadRequest(res, 'deviceId query parameter is required');
    }

    const data = await keyService.getPreKeyCount(userId, deviceId);

    res.send({
      success: true,
      data,
    });
  } catch (error) {
    if (error.code === 'E2E_001') {
      return sendE2EError(res, 'E2E_001');
    }
    return handleError(res, error, 'Failed to get pre-key count');
  }
};
