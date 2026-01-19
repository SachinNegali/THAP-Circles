import express from 'express';
import authRoute from './auth.routes.js';
import groupRoute from './group.route.js';
import messageRoute from './message.route.js';
import tripRoute from './trip.route.js';
import eventRoute from './event.route.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

router.use('/auth', authRoute);
router.use('/groups', groupRoute);
router.use('/messages', messageRoute);
router.use('/trips', tripRoute);
router.use('/events', eventRoute);

export default router;
