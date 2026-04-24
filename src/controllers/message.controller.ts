import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as messageService from '../services/message.service.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'message' });

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

const respondWithError = (
  res: Response,
  error: unknown,
  fallback: string
): void => {
  const message = error instanceof Error ? error.message : fallback;
  log.error({ err: error }, fallback);

  if (message === 'Message not found' || message === 'Group not found') {
    res.status(404).json({ message });
    return;
  }
  if (
    message === 'You are not a member of this group' ||
    message === 'You can only delete your own messages or be a group admin'
  ) {
    res.status(403).json({ message });
    return;
  }
  if (message === 'Message already deleted') {
    res.status(400).json({ message });
    return;
  }
  res.status(500).json({ message: fallback });
};

/** DELETE /messages/:id */
export const deleteMessage = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const messageId = String(req.params['id']);
    await messageService.deleteMessage(messageId, userId);
    res.json({ message: 'Message deleted successfully' });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete message');
  }
};

/** POST /messages/:id/read */
export const markAsRead = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;
  try {
    const messageId = String(req.params['id']);
    const message = await messageService.markAsRead(messageId, userId);
    res.json({ message: 'Message marked as read', data: message });
  } catch (error) {
    respondWithError(res, error, 'Failed to mark message as read');
  }
};
