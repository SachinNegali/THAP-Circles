import express from 'express';
import * as keyController from '../../controllers/key.controller.js';
import auth from '../../middlewares/auth.js';
import { keyBundleRateLimiter } from '../../middlewares/rateLimit.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Key bundle management
router.post('/bundle', keyController.uploadKeyBundle);
router.get('/bundle/:userId', keyBundleRateLimiter, keyController.fetchKeyBundle);

// Pre-key management
router.post('/prekeys', keyController.replenishPreKeys);
router.get('/prekeys/count', keyController.getPreKeyCount);

export default router;
