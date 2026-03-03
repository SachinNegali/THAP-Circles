import express from 'express';
import * as sseController from '../../controllers/sse.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// SSE stream endpoint
router.get('/stream', sseController.streamSSE);
router.get('/stream/1', (req, res) => {
  console.log("stream/1", "========", req, "========>>>>.", req?.user);
  res.send("stream/1");
});

// Long polling endpoint (fallback)
router.get('/poll', sseController.pollNotifications);

export default router;
