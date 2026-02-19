import express from 'express';
import * as encryptedMessageController from '../../controllers/encryptedMessage.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Encrypted message operations
router.post('/:chatId/messages/encrypted', encryptedMessageController.sendEncryptedMessage);
router.get('/:chatId/messages/encrypted', encryptedMessageController.getEncryptedMessages);
router.post('/:chatId/messages/:messageId/read', encryptedMessageController.markAsRead);
router.delete('/:chatId/messages/:messageId', encryptedMessageController.deleteMessage);

export default router;
