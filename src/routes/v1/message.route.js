import express from 'express';
import * as messageController from '../../controllers/message.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Message operations
router.delete('/:id', messageController.deleteMessage);
router.post('/:id/read', messageController.markAsRead);

export default router;
