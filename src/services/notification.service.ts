import { Types } from 'mongoose';
import Notification, { INotification, NotificationType } from '../models/notification.model.js';
import sseManager from './sse.service.js';
import firebaseService from './firebase.service.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'notification' });

type ObjectIdLike = Types.ObjectId | string;

export interface NotificationListResult {
  notifications: INotification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export const createNotification = async (
  userId: ObjectIdLike,
  type: NotificationType | string,
  title: string,
  message: string,
  data: Record<string, unknown> = {}
): Promise<INotification> => {
  const notification = await Notification.create({
    user: userId,
    type,
    title,
    message,
    data,
    isDelivered: false,
    isRead: false,
  });

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

    if (sent) {
      notification.isDelivered = true;
      await notification.save();
    }
  } else {
    try {
      await firebaseService.sendPushToUser(userId, {
        type: notification.type,
        title: notification.title,
        body: notification.message,
        data: { notificationId: notification._id.toString(), ...notification.data },
      });
    } catch (error) {
      log.error({ err: error, userId: userId.toString() }, 'FCM push failed');
    }
  }

  return notification;
};

export const createNotifications = async (
  userIds: ObjectIdLike[],
  type: NotificationType | string,
  title: string,
  message: string,
  data: Record<string, unknown> = {}
): Promise<INotification[]> => {
  const notifications = await Promise.all(
    userIds.map((userId) => createNotification(userId, type, title, message, data))
  );

  return notifications;
};

export const getNotifications = async (
  userId: ObjectIdLike,
  page = 1,
  limit = 20
): Promise<NotificationListResult> => {
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

export const getUndeliveredNotifications = async (
  userId: ObjectIdLike
): Promise<INotification[]> => {
  return Notification.find({
    user: userId,
    isDelivered: false,
  }).sort({ createdAt: 1 });
};

export const markAsDelivered = async (
  notificationIds: ObjectIdLike[],
  userId: ObjectIdLike
): Promise<number> => {
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

export const markAsRead = async (
  notificationId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<INotification> => {
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

export const markAllAsRead = async (userId: ObjectIdLike): Promise<number> => {
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

export const deleteNotification = async (
  notificationId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<INotification> => {
  const notification = await Notification.findOneAndDelete({
    _id: notificationId,
    user: userId,
  });

  if (!notification) {
    throw new Error('Notification not found');
  }

  return notification;
};

export const getUnreadCount = async (userId: ObjectIdLike): Promise<number> => {
  return Notification.countDocuments({
    user: userId,
    isRead: false,
  });
};
