import express from 'express';
import authRoute from './auth.routes.js';
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

router.use('/auth', authRoute);
router.use('/group', groupRoute);
router.use('/message', messageRoute);
router.use('/trip', tripRoute);
router.use('/event', eventRoute);
router.use('/sse', sseRoute);
router.use('/notification', notificationRoute);

export default router;
