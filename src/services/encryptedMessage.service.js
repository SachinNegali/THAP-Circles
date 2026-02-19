import EncryptedMessage from '../models/encryptedMessage.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import sseManager from './sse.service.js';
import * as notificationService from './notification.service.js';

/**
 * Generic push notification templates
 * Server NEVER includes decrypted content in notifications
 */
const NOTIFICATION_TEMPLATES = {
  text: (senderName) => `New message from ${senderName}`,
  image: (senderName) => `${senderName} sent a photo`,
  video: (senderName) => `${senderName} sent a video`,
  audio: (senderName) => `${senderName} sent an audio message`,
  file: (senderName) => `${senderName} sent a file`,
};

/**
 * Send an encrypted message
 * @param {ObjectId} chatId
 * @param {ObjectId} senderId
 * @param {Object} messageData
 * @returns {Promise<Object>}
 */
export const sendEncryptedMessage = async (chatId, senderId, messageData) => {
  // Verify sender is a participant
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) {
    const error = new Error('Chat not found');
    error.code = 'E2E_004';
    throw error;
  }

  if (!group.isMember(senderId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  // Store the message with all encrypted fields as-is
  const message = await EncryptedMessage.create({
    chatId,
    senderId,
    senderDeviceId: messageData.senderDeviceId,
    type: messageData.type || 'text',
    ciphertext: messageData.ciphertext,
    ephemeralKey: messageData.ephemeralKey || null,
    oneTimePreKeyId: messageData.oneTimePreKeyId || null,
    messageNumber: messageData.messageNumber || 0,
    previousChainLength: messageData.previousChainLength || 0,
    attachments: messageData.attachments || [],
  });

  // Broadcast via SSE to all online participants
  const recipientIds = group.members
    .filter((member) => member.user.toString() !== senderId.toString())
    .map((member) => member.user);

  const ssePayload = {
    id: message._id,
    chatId: message.chatId,
    senderId: message.senderId,
    senderDeviceId: message.senderDeviceId,
    type: message.type,
    ciphertext: message.ciphertext,
    ephemeralKey: message.ephemeralKey,
    messageNumber: message.messageNumber,
    previousChainLength: message.previousChainLength,
    attachments: message.attachments,
    createdAt: message.createdAt,
  };

  sseManager.sendToUsers(recipientIds, 'message:encrypted', ssePayload);

  // Send generic push notifications (NEVER include ciphertext)
  if (recipientIds.length > 0) {
    const sender = await User.findById(senderId);
    const senderName = sender ? `${sender.fName} ${sender.lName}`.trim() : 'Someone';
    const templateFn = NOTIFICATION_TEMPLATES[message.type] || NOTIFICATION_TEMPLATES.text;
    const notifMessage = templateFn(senderName);

    await notificationService.createNotifications(
      recipientIds,
      'message.encrypted',
      notifMessage,
      notifMessage,
      {
        chatId: chatId.toString(),
        messageId: message._id.toString(),
        senderId: senderId.toString(),
        type: message.type,
      }
    );
  }

  // Update the group's lastActivity
  group.lastActivity = new Date();
  await group.save();

  return {
    id: message._id,
    chatId: message.chatId,
    senderId: message.senderId,
    createdAt: message.createdAt,
  };
};

/**
 * Get encrypted messages for a chat (paginated)
 * @param {ObjectId} chatId
 * @param {ObjectId} userId
 * @param {Object} options - { page, limit, before, after }
 * @returns {Promise<Object>}
 */
export const getEncryptedMessages = async (chatId, userId, { page = 1, limit = 50, before, after } = {}) => {
  // Verify user is a participant
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) {
    const error = new Error('Chat not found');
    error.code = 'E2E_004';
    throw error;
  }

  if (!group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  // Build query
  const query = { chatId };

  if (before) {
    query.createdAt = { ...query.createdAt, $lt: new Date(before) };
  }
  if (after) {
    query.createdAt = { ...query.createdAt, $gt: new Date(after) };
  }

  const skip = (page - 1) * limit;

  const messages = await EncryptedMessage.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .select('-__v');

  const total = await EncryptedMessage.countDocuments(query);
  const totalPages = Math.ceil(total / limit);

  return {
    data: messages.reverse(), // Return in chronological order
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
};

/**
 * Mark a message as read
 * @param {ObjectId} chatId
 * @param {ObjectId} messageId
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
export const markAsRead = async (chatId, messageId, userId) => {
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group || !group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  const message = await EncryptedMessage.findOne({ _id: messageId, chatId });
  if (!message) {
    throw new Error('Message not found');
  }

  // Check if already read by this user
  const alreadyRead = message.readBy.some(
    (r) => r.userId.toString() === userId.toString()
  );

  if (!alreadyRead) {
    message.readBy.push({ userId, readAt: new Date() });
    await message.save();
  }

  return message;
};

/**
 * Soft-delete a message
 * @param {ObjectId} chatId
 * @param {ObjectId} messageId
 * @param {ObjectId} userId
 * @returns {Promise<Object>}
 */
export const deleteMessage = async (chatId, messageId, userId) => {
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group || !group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  const message = await EncryptedMessage.findOne({ _id: messageId, chatId });
  if (!message) {
    throw new Error('Message not found');
  }

  // Only sender or group admin can delete
  const isSender = message.senderId.toString() === userId.toString();
  const isAdmin = group.isAdmin(userId);

  if (!isSender && !isAdmin) {
    throw new Error('You can only delete your own messages or be a group admin');
  }

  // Soft delete and clear ciphertext to free storage
  message.isDeleted = true;
  message.ciphertext = '';
  await message.save();

  // Broadcast delete event via SSE
  const memberIds = group.members.map((m) => m.user);
  sseManager.sendToUsers(memberIds, 'message:deleted', {
    chatId: chatId.toString(),
    messageId: messageId.toString(),
    deletedBy: userId.toString(),
  });

  return message;
};
