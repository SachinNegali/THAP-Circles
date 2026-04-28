import { Request, Response, Router } from 'express';
import * as sseController from '../../controllers/sse.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/stream', sseController.streamSSE);
router.get('/stream/1', (_req: Request, res: Response) => {
  res.send('stream/1');
});

router.get('/poll', sseController.pollNotifications);

export default router;
