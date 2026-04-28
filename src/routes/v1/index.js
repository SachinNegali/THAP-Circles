import express from 'express';
/**
 * Import the NEW TypeScript-compiled auth routes.
 * These replace the old auth.routes.js with production-grade
 * Google authentication, refresh token rotation, and logout.
 */
import authRoute from '../../../dist/routes/v1/auth.routes.js';
import groupRoute from '../../../dist/routes/v1/group.route.js';
import messageRoute from '../../../dist/routes/v1/message.route.js';
import tripRoute from '../../../dist/routes/v1/trip.route.js';
import eventRoute from './event.route.js';
import sseRoute from '../../../dist/routes/v1/sse.route.js';
import notificationRoute from '../../../dist/routes/v1/notification.route.js';

// E2EE routes
import deviceRoute from '../../../dist/routes/v1/device.route.js';
import keyRoute from './key.route.js';
import encryptedMessageRoute from './encryptedMessage.route.js';
import mediaRoute from '../../../dist/routes/v1/media.route.js';
import senderKeyRoute from './senderKey.route.js';
import expenseRoute from '../../../dist/routes/v1/expense.route.js';
import userRoute from '../../../dist/routes/v1/user.route.js';
import userProfileRoute from '../../../dist/routes/v1/userProfile.route.js';

const router = express.Router();

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
router.use('/expense', expenseRoute);
router.use('/user', userRoute);
router.use('/profile', userProfileRoute);

export default router;
