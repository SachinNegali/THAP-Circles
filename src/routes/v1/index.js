import express from 'express';
/**
 * Import the NEW TypeScript-compiled auth routes.
 * These replace the old auth.routes.js with production-grade
 * Google authentication, refresh token rotation, and logout.
 */
import authRoute from '../../../dist/routes/v1/auth.routes.js';
import groupRoute from './group.route.js';
import messageRoute from './message.route.js';
import tripRoute from './trip.route.js';
import eventRoute from './event.route.js';
import sseRoute from './sse.route.js';
import notificationRoute from './notification.route.js';

// E2EE routes
import deviceRoute from './device.route.js';
import keyRoute from './key.route.js';
import encryptedMessageRoute from './encryptedMessage.route.js';
import mediaRoute from './media.route.js';
import senderKeyRoute from './senderKey.route.js';
import userRoute from '../../../dist/routes/v1/user.route.js';

const router = express.Router();

console.log("call here")
router.get('/status', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

router.use('/auth', authRoute.default || authRoute);
router.use('/group', groupRoute);
router.use('/message', messageRoute);
router.use('/trip', tripRoute);
router.use('/event', eventRoute);
router.use('/sse', sseRoute);
router.use('/notification', notificationRoute);

// E2EE endpoints
router.use('/devices', deviceRoute);
router.use('/keys', keyRoute);
router.use('/chats', encryptedMessageRoute);
router.use('/media', mediaRoute);
router.use('/groups', senderKeyRoute);
router.use('/user', userRoute);

export default router;
