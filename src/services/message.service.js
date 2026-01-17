import Message from '../models/message.model.js';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';

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

  return message.populate('sender', 'fName lName email');
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
  const group = await Group.findById(message.group);
  if (!group || !group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  await message.markAsReadBy(userId);
  return message;
};
