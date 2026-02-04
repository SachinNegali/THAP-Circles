import Message from '../models/message.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import * as notificationService from './notification.service.js';

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

  const message = await Message.create({
    group: groupId,
    sender: senderId,
    content,
    type,
    metadata,
  });

  // Update group last activity
  group.lastActivity = new Date();
  await group.save();

  // Populate sender info
  await message.populate('sender', 'fName lName email');

  // Send notifications to all group members except sender
  const recipientIds = group.members
    .filter((member) => member.user.toString() !== senderId.toString())
    .map((member) => member.user);

  if (recipientIds.length > 0) {
    const sender = await User.findById(senderId);
    const contentPreview = content.length > 50 ? content.substring(0, 50) + '...' : content;

    // Create notifications for all recipients
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
        senderName: `${sender.fName} ${sender.lName}`,
      }
    );

    // Track delivery: mark message as delivered to users who received notification via SSE
    const deliveredUserIds = notifications
      .filter((notif) => notif.isDelivered)
      .map((notif) => notif.user);

    if (deliveredUserIds.length > 0) {
      for (const userId of deliveredUserIds) {
        await message.markAsDeliveredTo(userId);
      }

      // Send delivery receipt to sender
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
  }

  return message;
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
    .populate('sender', 'fName lName email');

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
        readerName: `${reader.fName} ${reader.lName}`,
      }
    );
  }

  return message;
};
