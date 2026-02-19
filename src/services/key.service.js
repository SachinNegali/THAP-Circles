import KeyBundle from '../models/keyBundle.model.js';
import Device from '../models/device.model.js';
import sseManager from './sse.service.js';

const PRE_KEY_LOW_THRESHOLD = 25;

/**
 * Upload (upsert) a key bundle for a user/device
 * Detects identity key changes and notifies contacts
 * @param {ObjectId} userId
 * @param {Object} bundleData - { deviceId, identityKey, signedPreKey, oneTimePreKeys }
 * @returns {Promise<Object>}
 */
export const uploadKeyBundle = async (userId, { deviceId, identityKey, signedPreKey, oneTimePreKeys }) => {
  // Verify the device is registered
  const device = await Device.findOne({ userId, deviceId });
  if (!device) {
    const error = new Error('Device not registered');
    error.code = 'E2E_008';
    throw error;
  }

  // Check for identity key change (key rotation / re-registration)
  const existingBundle = await KeyBundle.findOne({ userId, deviceId });
  const identityKeyChanged = existingBundle && existingBundle.identityKey !== identityKey;

  // Upsert the key bundle
  const bundle = await KeyBundle.findOneAndUpdate(
    { userId, deviceId },
    {
      userId,
      deviceId,
      identityKey,
      signedPreKey: {
        id: signedPreKey.id,
        key: signedPreKey.key,
        signature: signedPreKey.signature,
        createdAt: new Date(),
      },
      oneTimePreKeys: oneTimePreKeys || [],
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  // If the identity key changed, notify contacts via SSE
  if (identityKeyChanged) {
    // NOTE: In production, you'd query the user's contacts/chats and notify each.
    // For now, we emit a generic event that the client can act on.
    sseManager.sendToUser(userId, 'device:identity_key_changed', {
      userId: userId.toString(),
      deviceId,
      timestamp: new Date().toISOString(),
    });
  }

  return { message: 'Key bundle uploaded successfully' };
};

/**
 * Fetch a user's key bundles (one per device)
 * Atomically consumes one one-time pre-key per device
 * @param {string} targetUserId - The user whose bundle to fetch
 * @returns {Promise<Object>}
 */
export const fetchKeyBundle = async (targetUserId) => {
  const bundles = await KeyBundle.find({ userId: targetUserId });

  if (!bundles || bundles.length === 0) {
    const error = new Error('Key bundle not found for user');
    error.code = 'E2E_001';
    throw error;
  }

  const devices = [];

  for (const bundle of bundles) {
    const deviceData = {
      deviceId: bundle.deviceId,
      identityKey: bundle.identityKey,
      signedPreKey: {
        id: bundle.signedPreKey.id,
        key: bundle.signedPreKey.key,
        signature: bundle.signedPreKey.signature,
      },
    };

    // Atomically consume one one-time pre-key
    if (bundle.oneTimePreKeys.length > 0) {
      const updated = await KeyBundle.findOneAndUpdate(
        { _id: bundle._id, 'oneTimePreKeys.0': { $exists: true } },
        { $pop: { oneTimePreKeys: -1 } }, // Remove the first element
        { new: false } // Return the document BEFORE update so we can read the consumed key
      );

      if (updated && updated.oneTimePreKeys.length > 0) {
        const consumedKey = updated.oneTimePreKeys[0];
        deviceData.oneTimePreKey = {
          id: consumedKey.id,
          key: consumedKey.key,
        };
      }

      // Check if pre-key count is low after consumption
      const remainingCount = bundle.oneTimePreKeys.length - 1;
      if (remainingCount < PRE_KEY_LOW_THRESHOLD && remainingCount >= 0) {
        sseManager.sendToUser(bundle.userId, 'keys:prekey_low', {
          deviceId: bundle.deviceId,
          remainingCount,
        });
      }
    }

    devices.push(deviceData);
  }

  return {
    userId: targetUserId,
    devices,
  };
};

/**
 * Replenish one-time pre-keys for a device
 * @param {ObjectId} userId
 * @param {string} deviceId
 * @param {Array} preKeys - Array of { id, key }
 * @returns {Promise<Object>}
 */
export const replenishPreKeys = async (userId, deviceId, preKeys) => {
  const bundle = await KeyBundle.findOneAndUpdate(
    { userId, deviceId },
    { $push: { oneTimePreKeys: { $each: preKeys } } },
    { new: true }
  );

  if (!bundle) {
    const error = new Error('Key bundle not found for user');
    error.code = 'E2E_001';
    throw error;
  }

  return { totalPreKeys: bundle.oneTimePreKeys.length };
};

/**
 * Get the count of remaining one-time pre-keys
 * @param {ObjectId} userId
 * @param {string} deviceId
 * @returns {Promise<Object>}
 */
export const getPreKeyCount = async (userId, deviceId) => {
  const bundle = await KeyBundle.findOne({ userId, deviceId });

  if (!bundle) {
    const error = new Error('Key bundle not found for user');
    error.code = 'E2E_001';
    throw error;
  }

  return {
    deviceId,
    count: bundle.oneTimePreKeys.length,
  };
};
