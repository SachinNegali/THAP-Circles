import * as deviceService from '../services/device.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Register a device
 * POST /api/devices/register
 */
export const registerDevice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { deviceName, platform, pushToken } = req.body;

    if (!platform) {
      return sendBadRequest(res, 'platform is required');
    }

    if (!['ios', 'android'].includes(platform)) {
      return sendBadRequest(res, 'platform must be ios or android');
    }

    const device = await deviceService.registerDevice(userId, {
      // deviceId,
      deviceName,
      platform,
      pushToken,
    });

    res.status(201).send({
      success: true,
      data: {
        deviceId: device.deviceId,
        registeredAt: device.registeredAt,
      },
    });
  } catch (error) {
    return handleError(res, error, 'Failed to register device');
  }
};
