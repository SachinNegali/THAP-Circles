import * as senderKeyService from '../services/senderKey.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Distribute sender keys to group members
 * POST /groups/:groupId/sender-keys
 */
export const distributeSenderKeys = async (req, res) => {
  try {
    const { groupId } = req.params;
    const senderId = req.user._id;
    const { senderDeviceId, distributions } = req.body;

    if (!senderDeviceId || !distributions || !Array.isArray(distributions) || distributions.length === 0) {
      return sendBadRequest(res, 'senderDeviceId and distributions array are required');
    }

    // Validate each distribution entry
    for (const dist of distributions) {
      if (!dist.recipientId || !dist.recipientDeviceId || !dist.encryptedSenderKey) {
        return sendBadRequest(res, 'Each distribution must include recipientId, recipientDeviceId, and encryptedSenderKey');
      }
    }

    const result = await senderKeyService.distributeSenderKeys(groupId, senderId, senderDeviceId, distributions);

    res.status(201).send({
      success: true,
      message: result.message,
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to distribute sender keys');
  }
};

/**
 * Get sender keys for the current user in a group
 * GET /groups/:groupId/sender-keys
 */
export const getSenderKeys = async (req, res) => {
  try {
    const { groupId } = req.params;
    const recipientId = req.user._id;
    const { deviceId } = req.query;

    const keys = await senderKeyService.getSenderKeys(groupId, recipientId, deviceId);

    res.send({
      success: true,
      data: keys,
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to get sender keys');
  }
};
