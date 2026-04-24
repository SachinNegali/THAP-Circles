/**
 * Device Controller — TypeScript
 * ================================
 *
 * Thin HTTP layer for device registration. Input shape is validated
 * by Zod middleware before the handler runs.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as deviceService from './../services/device.service.js';
import logger from '../config/logger.js';
import type { RegisterDeviceInput } from '../validations/device.validation.js';

const log = logger.child({ module: 'device' });

/** POST /devices/register */
export const registerDevice = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = req.user?._id as Types.ObjectId | undefined;
  if (!userId) {
    res.status(401).json({ message: 'User not authenticated' });
    return;
  }

  try {
    const { deviceName, platform, pushToken } = req.body as RegisterDeviceInput;
    const device = await deviceService.registerDevice(userId, {
      deviceName,
      platform,
      pushToken,
    });

    res.status(201).json({
      success: true,
      data: {
        id: device._id,
        platform: device.platform,
        registeredAt: device.registeredAt,
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to register device';
    log.error({ err: error }, 'Failed to register device');
    res.status(500).json({ message });
  }
};
