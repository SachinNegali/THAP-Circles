/**
 * Device Service — TypeScript
 * =============================
 *
 * All writes are keyed on userId (one device per user), which matches
 * the schema's unique index.
 */

import { Types } from 'mongoose';
import Device, { IDevice, DevicePlatform } from '../models/device.model.js';

type ObjectIdLike = string | Types.ObjectId;

export interface RegisterDeviceInput {
  deviceName?: string;
  platform: DevicePlatform;
  pushToken?: string;
}

export const registerDevice = async (
  userId: ObjectIdLike,
  { deviceName, platform, pushToken }: RegisterDeviceInput
): Promise<IDevice> => {
  const device = await Device.findOneAndUpdate(
    { userId },
    {
      userId,
      deviceName,
      platform,
      pushToken: pushToken ?? null,
      lastActiveAt: new Date(),
      $setOnInsert: { registeredAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!device) throw new Error('Device registration failed');
  return device;
};

export const getUserDevices = async (userId: ObjectIdLike): Promise<IDevice[]> => {
  return Device.find({ userId }).sort({ lastActiveAt: -1 });
};

export const updatePushToken = async (
  userId: ObjectIdLike,
  pushToken: string
): Promise<IDevice> => {
  const device = await Device.findOneAndUpdate(
    { userId },
    { pushToken },
    { new: true }
  );
  if (!device) throw new Error('Device not found');
  return device;
};

export const updateLastActive = async (userId: ObjectIdLike): Promise<void> => {
  await Device.findOneAndUpdate({ userId }, { lastActiveAt: new Date() });
};

export const isDeviceRegistered = async (userId: ObjectIdLike): Promise<boolean> => {
  const device = await Device.findOne({ userId });
  return !!device;
};

export const getDevicesWithPushToken = async (
  userId: ObjectIdLike
): Promise<IDevice[]> => {
  return Device.find({ userId, pushToken: { $ne: null } });
};

export const removePushToken = async (pushToken: string): Promise<void> => {
  await Device.updateMany({ pushToken }, { $set: { pushToken: null } });
};
