import GroupSenderKey from '../models/groupSenderKey.model.js';
import Group from '../models/group.model.js';
import sseManager from './sse.service.js';

/**
 * Distribute sender keys to group members
 * @param {ObjectId} groupId
 * @param {ObjectId} senderId
 * @param {string} senderDeviceId
 * @param {Array} distributions - [{ recipientId, recipientDeviceId, encryptedSenderKey, version }]
 * @returns {Promise<Object>}
 */
export const distributeSenderKeys = async (groupId, senderId, senderDeviceId, distributions) => {
  // Verify sender is a group member
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isMember(senderId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  // Bulk upsert sender keys
  const bulkOps = distributions.map((dist) => ({
    updateOne: {
      filter: {
        groupId,
        senderId,
        senderDeviceId,
        recipientId: dist.recipientId,
        recipientDeviceId: dist.recipientDeviceId,
      },
      update: {
        $set: {
          encryptedSenderKey: dist.encryptedSenderKey,
          version: dist.version || 1,
        },
        $setOnInsert: {
          groupId,
          senderId,
          senderDeviceId,
          recipientId: dist.recipientId,
          recipientDeviceId: dist.recipientDeviceId,
        },
      },
      upsert: true,
    },
  }));

  await GroupSenderKey.bulkWrite(bulkOps);

  // Notify recipients via SSE that a new sender key is available
  const recipientIds = [...new Set(distributions.map((d) => d.recipientId.toString()))];
  sseManager.sendToUsers(recipientIds, 'group:sender_key_update', {
    groupId: groupId.toString(),
    senderId: senderId.toString(),
    senderDeviceId,
  });

  return { message: `Sender keys distributed to ${distributions.length} recipients` };
};

/**
 * Get all sender keys for a user in a group
 * @param {ObjectId} groupId
 * @param {ObjectId} recipientId
 * @param {string} recipientDeviceId
 * @returns {Promise<Array>}
 */
export const getSenderKeys = async (groupId, recipientId, recipientDeviceId) => {
  // Verify recipient is a group member
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isMember(recipientId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  const query = { groupId, recipientId };
  if (recipientDeviceId) {
    query.recipientDeviceId = recipientDeviceId;
  }

  const keys = await GroupSenderKey.find(query)
    .select('senderId senderDeviceId encryptedSenderKey version')
    .sort({ version: -1 });

  return keys;
};

/**
 * Delete all sender keys for a removed member in a group
 * @param {ObjectId} groupId
 * @param {ObjectId} userId - the removed member
 * @returns {Promise<number>} - number of deleted keys
 */
export const deleteSenderKeysForUser = async (groupId, userId) => {
  // Delete keys where the user is either sender or recipient
  const result = await GroupSenderKey.deleteMany({
    groupId,
    $or: [{ senderId: userId }, { recipientId: userId }],
  });

  return result.deletedCount;
};

/**
 * Delete all sender keys for a group (used on group deletion)
 * @param {ObjectId} groupId
 * @returns {Promise<number>}
 */
export const deleteAllSenderKeysForGroup = async (groupId) => {
  const result = await GroupSenderKey.deleteMany({ groupId });
  return result.deletedCount;
};
