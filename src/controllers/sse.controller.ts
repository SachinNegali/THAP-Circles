import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { Types } from 'mongoose';
import * as notificationService from '../services/notification.service.js';
import sseManager from '../services/sse.service.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'sse-controller' });

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

export const streamSSE = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');

  res.write(
    `event: connected\ndata: ${JSON.stringify({
      userId: userId.toString(),
      timestamp: Date.now(),
    })}\n\n`
  );

  sseManager.addConnection(userId, res);

  try {
    const undelivered = await notificationService.getUndeliveredNotifications(userId);

    if (undelivered.length > 0) {
      const notificationIds: Types.ObjectId[] = [];
      undelivered.forEach((notification) => {
        const sent = sseManager.sendToUser(userId, 'notification', {
          id: notification._id,
          type: notification.type,
          title: notification.title,
          message: notification.message,
          data: notification.data,
          createdAt: notification.createdAt,
        });

        if (sent) {
          notificationIds.push(notification._id);
        }
      });

      if (notificationIds.length > 0) {
        await notificationService.markAsDelivered(notificationIds, userId);
      }
    }
  } catch (error) {
    log.error({ err: error }, 'Error sending undelivered notifications');
  }

  const heartbeatInterval = setInterval(() => {
    sseManager.sendHeartbeat(userId);
  }, 30000);

  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseManager.removeConnection(userId);
  });
};

export const pollNotifications = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  const timeout = 30000;
  const pollInterval = 1000;

  let elapsed = 0;

  const poll = async (): Promise<void> => {
    const notifications = await notificationService.getUndeliveredNotifications(userId);

    if (notifications.length > 0 || elapsed >= timeout) {
      if (notifications.length > 0) {
        const notificationIds = notifications.map((n) => n._id);
        await notificationService.markAsDelivered(notificationIds, userId);
      }

      res.status(httpStatus.OK).json({
        notifications: notifications.map((n) => ({
          id: n._id,
          type: n.type,
          title: n.title,
          message: n.message,
          data: n.data,
          createdAt: n.createdAt,
        })),
        timestamp: Date.now(),
      });
      return;
    }

    elapsed += pollInterval;
    setTimeout(poll, pollInterval);
  };

  poll();
};
