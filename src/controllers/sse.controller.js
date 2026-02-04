import httpStatus from 'http-status';
import * as notificationService from '../services/notification.service.js';
import sseManager from '../services/sse.service.js';

/**
 * Establish SSE connection
 * @param {Request} req
 * @param {Response} res
 */
export const streamSSE = async (req, res) => {
  const userId = req.user._id;

  // Set SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable buffering for nginx

  // Send initial connection success event
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: userId.toString(), timestamp: Date.now() })}\n\n`);

  // Register connection
  sseManager.addConnection(userId, res);

  // Send any undelivered notifications
  try {
    const undelivered = await notificationService.getUndeliveredNotifications(userId);
    
    if (undelivered.length > 0) {
      const notificationIds = [];
      
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

      // Mark as delivered
      if (notificationIds.length > 0) {
        await notificationService.markAsDelivered(notificationIds, userId);
      }
    }
  } catch (error) {
    console.error('Error sending undelivered notifications:', error);
  }

  // Set up heartbeat interval (every 30 seconds)
  const heartbeatInterval = setInterval(() => {
    sseManager.sendHeartbeat(userId);
  }, 30000);

  // Handle client disconnect
  req.on('close', () => {
    clearInterval(heartbeatInterval);
    sseManager.removeConnection(userId);
  });
};

/**
 * Long polling endpoint (fallback for SSE)
 * @param {Request} req
 * @param {Response} res
 */
export const pollNotifications = async (req, res) => {
  const userId = req.user._id;
  const timeout = 30000; // 30 seconds
  const pollInterval = 1000; // Check every 1 second

  let elapsed = 0;
  let notifications = [];

  // Poll for notifications
  const poll = async () => {
    notifications = await notificationService.getUndeliveredNotifications(userId);

    if (notifications.length > 0 || elapsed >= timeout) {
      // Mark as delivered
      if (notifications.length > 0) {
        const notificationIds = notifications.map((n) => n._id);
        await notificationService.markAsDelivered(notificationIds, userId);
      }

      // Return notifications
      return res.status(httpStatus.OK).json({
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
    }

    elapsed += pollInterval;
    setTimeout(poll, pollInterval);
  };

  poll();
};
