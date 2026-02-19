import * as encryptedMessageService from '../services/encryptedMessage.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';
import { sendE2EError } from '../utils/e2eErrors.js';

/**
 * Send an encrypted message
 * POST /chats/:chatId/messages/encrypted
 */
export const sendEncryptedMessage = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const senderId = req.user._id;
    const { senderDeviceId, type, ciphertext, ephemeralKey, oneTimePreKeyId, messageNumber, previousChainLength, attachments } = req.body;

    if (!senderDeviceId || !ciphertext) {
      return sendBadRequest(res, 'senderDeviceId and ciphertext are required');
    }

    const data = await encryptedMessageService.sendEncryptedMessage(chatId, senderId, {
      senderDeviceId,
      type,
      ciphertext,
      ephemeralKey,
      oneTimePreKeyId,
      messageNumber,
      previousChainLength,
      attachments,
    });

    res.status(201).send({
      success: true,
      data,
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to send encrypted message');
  }
};

/**
 * Get encrypted messages for a chat
 * GET /chats/:chatId/messages/encrypted
 */
export const getEncryptedMessages = async (req, res) => {
  try {
    const chatId = req.params.chatId;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const { before, after } = req.query;

    const result = await encryptedMessageService.getEncryptedMessages(chatId, userId, {
      page,
      limit,
      before,
      after,
    });

    res.send({
      success: true,
      ...result,
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to get encrypted messages');
  }
};

/**
 * Mark a message as read
 * POST /chats/:chatId/messages/:messageId/read
 */
export const markAsRead = async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user._id;

    await encryptedMessageService.markAsRead(chatId, messageId, userId);

    res.send({
      success: true,
      message: 'Message marked as read',
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to mark message as read');
  }
};

/**
 * Delete a message (soft delete)
 * DELETE /chats/:chatId/messages/:messageId
 */
export const deleteMessage = async (req, res) => {
  try {
    const { chatId, messageId } = req.params;
    const userId = req.user._id;

    await encryptedMessageService.deleteMessage(chatId, messageId, userId);

    res.send({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    if (error.code === 'E2E_004') {
      return sendE2EError(res, 'E2E_004');
    }
    return handleError(res, error, 'Failed to delete message');
  }
};
