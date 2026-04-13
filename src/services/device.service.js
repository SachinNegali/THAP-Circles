import Device from '../models/device.model.js';

/**
 * Register or update a device for a user
 * @param {ObjectId} userId
 * @param {Object} deviceData - { deviceId, deviceName, platform, pushToken }
 * @returns {Promise<Device>}
 */
export const registerDevice = async (userId, { deviceName, platform, pushToken }) => {
  const device = await Device.findOneAndUpdate(
    { userId },
    {
      userId,
      // deviceId,
      deviceName,
      platform,
      pushToken,
      lastActiveAt: new Date(),
      $setOnInsert: { registeredAt: new Date() },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return device;
};

/**
 * Get all devices for a user
 * @param {ObjectId} userId
 * @returns {Promise<Array<Device>>}
 */
export const getUserDevices = async (userId) => {
  return Device.find({ userId }).sort({ lastActiveAt: -1 });
};

/**
 * Update push token for a device
 * @param {ObjectId} userId
 * @param {string} deviceId
 * @param {string} pushToken
 * @returns {Promise<Device>}
 */
export const updatePushToken = async (userId, deviceId, pushToken) => {
  const device = await Device.findOneAndUpdate(
    { userId, deviceId },
    { pushToken },
    { new: true }
  );

  if (!device) {
    throw new Error('Device not found');
  }

  return device;
};

/**
 * Update lastActiveAt timestamp
 * @param {ObjectId} userId
 * @param {string} deviceId
 * @returns {Promise<Device>}
 */
export const updateLastActive = async (userId, deviceId) => {
  await Device.findOneAndUpdate(
    { userId, deviceId },
    { lastActiveAt: new Date() }
  );
};

/**
 * Check if a device is registered for a user
 * @param {ObjectId} userId
 * @param {string} deviceId
 * @returns {Promise<boolean>}
 */
export const isDeviceRegistered = async (userId, deviceId) => {
  const device = await Device.findOne({ userId, deviceId });
  return !!device;
};

/**
 * Get devices with a valid push token for a user
 * @param {ObjectId} userId
 * @returns {Promise<Array<Device>>}
 */
export const getDevicesWithPushToken = async (userId) => {
  return Device.find({ userId, pushToken: { $ne: null } });
};

/**
 * Remove a stale push token from any device that has it
 * @param {string} pushToken
 * @returns {Promise<void>}
 */
export const removePushToken = async (pushToken) => {
  await Device.updateMany({ pushToken }, { $set: { pushToken: null } });
};
