import Message from '../models/message.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import * as notificationService from './notification.service.js';
import sseManager from './sse.service.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'message' });

/**
 * Send a message to a group
 * @param {ObjectId} groupId
 * @param {ObjectId} senderId
 * @param {string} content
 * @param {string} type
 * @param {Object} metadata
 * @returns {Promise<Message>}
 */
export const sendMessage = async (groupId, senderId, content, type = 'text', metadata = {}) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isMember(senderId)) {
    throw new Error('You are not a member of this group');
  }

  // Check if only admins can message
  if (group.settings.onlyAdminsCanMessage && !group.isAdmin(senderId)) {
    throw new Error('Only admins can send messages in this group');
  }

  // For image messages with imageIds provided, initialize pending placeholders.
  // The client uploads each image afterwards using this message's _id as messageId.
  let finalMetadata = metadata || {};
  if (type === 'image' && Array.isArray(finalMetadata.imageIds) && finalMetadata.imageIds.length > 0) {
    finalMetadata = {
      ...finalMetadata,
      images: finalMetadata.imageIds.map((imageId) => ({
        imageId,
        status: 'pending',
        thumbnailUrl: null,
        optimizedUrl: null,
        width: null,
        height: null,
      })),
    };
  }

  const message = await Message.create({
    group: groupId,
    sender: senderId,
    content: content || '',
    type,
    metadata: finalMetadata,
  });

  // Update group last activity
  group.lastActivity = new Date();
  await group.save();

  // Image messages with pending uploads: defer the message.new broadcast and
  // notifications until updateMessageImage sees all images complete. Otherwise
  // recipients get an empty/placeholder push before any image URL is ready.
  const hasPendingImages =
    type === 'image' && Array.isArray(finalMetadata.images) && finalMetadata.images.length > 0;

  if (!hasPendingImages) {
    await broadcastNewMessage(group, message);
  }

  return message;
};

/**
 * Broadcast a message.new SSE event to recipients and create notifications.
 * Used for normal sends and for deferred delivery once an image message's
 * uploads finish processing.
 */
export const broadcastNewMessage = async (group, message) => {
  const senderId = message.sender;
  const recipientIds = group.members
    .filter((member) => member.user.toString() !== senderId.toString())
    .map((member) => member.user);

  if (recipientIds.length === 0) return;

  sseManager.sendToUsers(recipientIds, 'message.new', message.toJSON());

  const sender = await User.findById(senderId);
  const text = message.content || '';
  const fallback = message.type === 'image' ? 'Sent an image' : '';
  const contentPreview = text.length > 50 ? text.substring(0, 50) + '...' : text || fallback;

  const notifications = await notificationService.createNotifications(
    recipientIds,
    'message.new',
    `${sender.fName} in ${group.name}`,
    contentPreview,
    {
      groupId: group._id,
      groupName: group.name,
      messageId: message._id,
      senderId: sender._id,
    }
  );

  const deliveredUserIds = notifications
    .filter((notif) => notif.isDelivered)
    .map((notif) => notif.user);

  if (deliveredUserIds.length > 0) {
    for (const userId of deliveredUserIds) {
      await message.markAsDeliveredTo(userId);
    }

    await notificationService.createNotification(
      senderId,
      'message.delivered',
      'Message delivered',
      `Your message was delivered to ${deliveredUserIds.length} member(s)`,
      {
        messageId: message._id,
        groupId: group._id,
        deliveredCount: deliveredUserIds.length,
      }
    );
  }
};

/**
 * Get messages for a group
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getMessages = async (groupId, userId, page = 1, limit = 50) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  const skip = (page - 1) * limit;

  const messages = await Message.find({
    group: groupId,
    isDeleted: false,
  })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
;

  const total = await Message.countDocuments({
    group: groupId,
    isDeleted: false,
  });

  return {
    messages: messages.reverse(), // Reverse to show oldest first
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Delete a message (soft delete)
 * @param {ObjectId} messageId
 * @param {ObjectId} userId
 * @returns {Promise<Message>}
 */
export const deleteMessage = async (messageId, userId) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  if (message.isDeleted) {
    throw new Error('Message already deleted');
  }

  // Only sender or group admin can delete
  const group = await Group.findById(message.group);
  const isSender = message.sender.toString() === userId.toString();
  const isAdmin = group && group.isAdmin(userId);

  if (!isSender && !isAdmin) {
    throw new Error('You can only delete your own messages or be a group admin');
  }

  await message.softDelete();

  // Notify all group members about deletion
  if (group) {
    const recipientIds = group.members.map((member) => member.user);
    const deleter = await User.findById(userId);

    await notificationService.createNotifications(
      recipientIds,
      'message.deleted',
      `Message deleted in ${group.name}`,
      `${deleter.fName} deleted a message`,
      {
        groupId: group._id,
        groupName: group.name,
        messageId: message._id,
      }
    );
  }

  return message;
};

/**
 * Update a single image entry within an image-type Message's metadata and
 * broadcast the change to all group members via SSE so chat UIs can swap
 * placeholders for real thumbnails once processing finishes.
 *
 * @param {String} messageId  - Mongo _id of the Message document
 * @param {String} imageId    - client-generated UUID identifying the image
 * @param {Object} update     - { status, thumbnailUrl, optimizedUrl, width, height }
 * @returns {Promise<{message: Message, allComplete: boolean} | null>}
 */
export const updateMessageImage = async (messageId, imageId, update) => {
  const message = await Message.findById(messageId);
  if (!message) {
    log.warn({ messageId }, 'Message not found for image update');
    return null;
  }

  const images = Array.isArray(message.metadata?.images) ? message.metadata.images : [];
  const idx = images.findIndex((img) => img.imageId === imageId);
  if (idx === -1) {
    log.warn({ imageId, messageId }, 'imageId not found on message');
    return null;
  }

  const wasComplete = images.length > 0 && images.every((img) => img.status === 'completed');

  images[idx] = { ...images[idx], ...update };

  const allComplete = images.every((img) => img.status === 'completed');

  // Mixed-type fields need explicit markModified so Mongoose persists nested changes.
  message.metadata = { ...message.metadata, images };
  message.markModified('metadata');
  await message.save();

  // Broadcast to every group member (uploader + others) so all clients update.
  const group = await Group.findById(message.group);
  if (group) {
    const memberIds = group.members.map((m) => m.user);
    sseManager.sendToUsers(memberIds, 'message.image_updated', {
      messageId: message._id.toString(),
      groupId: message.group.toString(),
      imageId,
      image: images[idx],
      allComplete,
    });

    if (allComplete) {
      sseManager.sendToUsers(memberIds, 'message.media_ready', {
        messageId: message._id.toString(),
        groupId: message.group.toString(),
        images,
      });
    }

    // First time all images for this image-message complete: deliver the
    // deferred message.new SSE event + notifications so recipients only see it
    // once real image URLs are available.
    if (allComplete && !wasComplete && message.type === 'image') {
      await broadcastNewMessage(group, message);
    }
  }

  return { message, allComplete };
};

/**
 * Mark message as read
 * @param {ObjectId} messageId
 * @param {ObjectId} userId
 * @returns {Promise<Message>}
 */
export const markAsRead = async (messageId, userId) => {
  const message = await Message.findById(messageId);

  if (!message) {
    throw new Error('Message not found');
  }

  // Verify user is a member of the group
  const messageGroup = await Group.findById(message.group);
  if (!messageGroup || !messageGroup.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  await message.markAsReadBy(userId);

  // Send read receipt to message sender (if not the same user)
  if (message.sender.toString() !== userId.toString()) {
    const reader = await User.findById(userId);

    await notificationService.createNotification(
      message.sender,
      'message.read',
      'Message read',
      `${reader.fName} read your message in ${messageGroup.name}`,
      {
        messageId: message._id,
        groupId: messageGroup._id,
        groupName: messageGroup.name,
        readerId: userId,
      }
    );
  }

  return message;
};
