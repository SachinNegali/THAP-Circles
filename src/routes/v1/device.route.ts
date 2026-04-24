/**
 * Device Routes — TypeScript
 * ============================
 *
 * All routes require authentication. Registration payload is validated
 * by a Zod schema before the controller sees it.
 */

import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { registerDeviceSchema } from '../../validations/device.validation.js';
import { registerDevice } from '../../controllers/device.controller.js';

const router = Router();

router.use(authMiddleware);

router.post('/register', validate(registerDeviceSchema), registerDevice);

export default router;
