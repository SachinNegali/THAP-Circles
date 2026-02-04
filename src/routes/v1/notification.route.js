import express from 'express';
import * as notificationController from '../../controllers/notification.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Notification operations
router.get('/', notificationController.getNotifications);
router.get('/unread-count', notificationController.getUnreadCount);
router.patch('/:id/read', notificationController.markAsRead);
router.patch('/read-all', notificationController.markAllAsRead);
router.delete('/:id', notificationController.deleteNotification);

export default router;
