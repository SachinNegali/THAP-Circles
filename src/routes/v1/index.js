import express from 'express';
import authRoute from './auth.routes.js';
import groupRoute from './group.route.js';
import messageRoute from './message.route.js';

const router = express.Router();

router.get('/status', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date() });
});

router.use('/auth', authRoute);
router.use('/groups', groupRoute);
router.use('/messages', messageRoute);

export default router;
