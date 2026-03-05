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

export default router;
