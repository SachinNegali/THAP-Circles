import * as messageService from '../services/message.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';

/**
 * Delete a message
 * DELETE /messages/:id
 */
export const deleteMessage = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    await messageService.deleteMessage(messageId, userId);

    res.send({
      message: 'Message deleted successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to delete message');
  }
};

/**
 * Mark message as read
 * POST /messages/:id/read
 */
export const markAsRead = async (req, res) => {
  try {
    const messageId = req.params.id;
    const userId = req.user._id;

    const message = await messageService.markAsRead(messageId, userId);

    res.send({
      message: 'Message marked as read',
      data: message,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to mark message as read');
  }
};
