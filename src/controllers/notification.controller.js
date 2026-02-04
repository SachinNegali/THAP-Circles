import httpStatus from 'http-status';
import * as notificationService from '../services/notification.service.js';

/**
 * Get notifications for the authenticated user
 * @param {Request} req
 * @param {Response} res
 */
export const getNotifications = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await notificationService.getNotifications(userId, page, limit);

    res.status(httpStatus.OK).json(result);
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      message: error.message,
    });
  }
};

/**
 * Get unread notification count
 * @param {Request} req
 * @param {Response} res
 */
export const getUnreadCount = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await notificationService.getUnreadCount(userId);

    res.status(httpStatus.OK).json({ count });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      message: error.message,
    });
  }
};

/**
 * Mark a notification as read
 * @param {Request} req
 * @param {Response} res
 */
export const markAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;

    const notification = await notificationService.markAsRead(notificationId, userId);

    res.status(httpStatus.OK).json({
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    res.status(httpStatus.NOT_FOUND).json({
      message: error.message,
    });
  }
};

/**
 * Mark all notifications as read
 * @param {Request} req
 * @param {Response} res
 */
export const markAllAsRead = async (req, res) => {
  try {
    const userId = req.user._id;
    const count = await notificationService.markAllAsRead(userId);

    res.status(httpStatus.OK).json({
      message: 'All notifications marked as read',
      count,
    });
  } catch (error) {
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      message: error.message,
    });
  }
};

/**
 * Delete a notification
 * @param {Request} req
 * @param {Response} res
 */
export const deleteNotification = async (req, res) => {
  try {
    const userId = req.user._id;
    const notificationId = req.params.id;

    await notificationService.deleteNotification(notificationId, userId);

    res.status(httpStatus.OK).json({
      message: 'Notification deleted',
    });
  } catch (error) {
    res.status(httpStatus.NOT_FOUND).json({
      message: error.message,
    });
  }
};
