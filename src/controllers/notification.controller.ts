import { Request, Response } from 'express';
import httpStatus from 'http-status';
import { Types } from 'mongoose';
import * as notificationService from '../services/notification.service.js';

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

export const getNotifications = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const page = parseInt(String(req.query.page ?? ''), 10) || 1;
    const limit = parseInt(String(req.query.limit ?? ''), 10) || 20;

    const result = await notificationService.getNotifications(userId, page, limit);

    res.status(httpStatus.OK).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message });
  }
};

export const getUnreadCount = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const count = await notificationService.getUnreadCount(userId);

    res.status(httpStatus.OK).json({ count });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message });
  }
};

export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const notificationId = String(req.params.id);

    const notification = await notificationService.markAsRead(notificationId, userId);

    res.status(httpStatus.OK).json({
      message: 'Notification marked as read',
      notification,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification not found';
    res.status(httpStatus.NOT_FOUND).json({ message });
  }
};

export const markAllAsRead = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const count = await notificationService.markAllAsRead(userId);

    res.status(httpStatus.OK).json({
      message: 'All notifications marked as read',
      count,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({ message });
  }
};

export const deleteNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const userId = requireUserId(req, res);
    if (!userId) return;

    const notificationId = String(req.params.id);

    await notificationService.deleteNotification(notificationId, userId);

    res.status(httpStatus.OK).json({ message: 'Notification deleted' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Notification not found';
    res.status(httpStatus.NOT_FOUND).json({ message });
  }
};
