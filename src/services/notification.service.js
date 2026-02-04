import Notification from '../models/notification.model.js';
import sseManager from './sse.service.js';

/**
 * Create and send a notification to a user
 * @param {ObjectId} userId - Recipient user ID
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 * @returns {Promise<Notification>}
 */
export const createNotification = async (userId, type, title, message, data = {}) => {
  // Create notification in database
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    message,
    data,
    isDelivered: false,
    isRead: false,
  });

  // Try to send via SSE if user is online
  const isOnline = sseManager.isUserOnline(userId);
  
  if (isOnline) {
    const sent = sseManager.sendToUser(userId, 'notification', {
      id: notification._id,
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
      createdAt: notification.createdAt,
    });

    // Mark as delivered if sent successfully
    if (sent) {
      notification.isDelivered = true;
      await notification.save();
    }
  }

  return notification;
};

/**
 * Create and send notifications to multiple users
 * @param {Array<ObjectId>} userIds - Array of recipient user IDs
 * @param {string} type - Notification type
 * @param {string} title - Notification title
 * @param {string} message - Notification message
 * @param {Object} data - Additional data
 * @returns {Promise<Array<Notification>>}
 */
export const createNotifications = async (userIds, type, title, message, data = {}) => {
  const notifications = await Promise.all(
    userIds.map((userId) => createNotification(userId, type, title, message, data))
  );

  return notifications;
};

/**
 * Get notifications for a user (paginated)
 * @param {ObjectId} userId - User ID
 * @param {number} page - Page number
 * @param {number} limit - Items per page
 * @returns {Promise<Object>}
 */
export const getNotifications = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const notifications = await Notification.find({ user: userId })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  const total = await Notification.countDocuments({ user: userId });

  return {
    notifications,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Get undelivered notifications for a user (for long polling)
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Array<Notification>>}
 */
export const getUndeliveredNotifications = async (userId) => {
  const notifications = await Notification.find({
    user: userId,
    isDelivered: false,
  }).sort({ createdAt: 1 });

  return notifications;
};

/**
 * Mark notifications as delivered
 * @param {Array<ObjectId>} notificationIds - Array of notification IDs
 * @param {ObjectId} userId - User ID (for verification)
 * @returns {Promise<number>}
 */
export const markAsDelivered = async (notificationIds, userId) => {
  const result = await Notification.updateMany(
    {
      _id: { $in: notificationIds },
      user: userId,
      isDelivered: false,
    },
    {
      $set: { isDelivered: true },
    }
  );

  return result.modifiedCount;
};

/**
 * Mark a notification as read
 * @param {ObjectId} notificationId - Notification ID
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Notification>}
 */
export const markAsRead = async (notificationId, userId) => {
  const notification = await Notification.findOne({
    _id: notificationId,
    user: userId,
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  if (!notification.isRead) {
    await notification.markAsRead();
  }

  return notification;
};

/**
 * Mark all notifications as read for a user
 * @param {ObjectId} userId - User ID
 * @returns {Promise<number>}
 */
export const markAllAsRead = async (userId) => {
  const result = await Notification.updateMany(
    {
      user: userId,
      isRead: false,
    },
    {
      $set: { isRead: true },
    }
  );

  return result.modifiedCount;
};

/**
 * Delete a notification
 * @param {ObjectId} notificationId - Notification ID
 * @param {ObjectId} userId - User ID
 * @returns {Promise<Notification>}
 */
export const deleteNotification = async (notificationId, userId) => {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId,
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  return notification;
};

/**
 * Get unread notification count
 * @param {ObjectId} userId - User ID
 * @returns {Promise<number>}
 */
export const getUnreadCount = async (userId) => {
  const count = await Notification.countDocuments({
    user: userId,
    isRead: false,
  });

  return count;
};
