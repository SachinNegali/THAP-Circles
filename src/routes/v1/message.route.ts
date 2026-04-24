import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { messageIdParamsSchema } from '../../validations/message.validation.js';
import { deleteMessage, markAsRead } from '../../controllers/message.controller.js';

const router = Router();

router.use(authMiddleware);

router.delete('/:id', validate(messageIdParamsSchema, 'params'), deleteMessage);
router.post('/:id/read', validate(messageIdParamsSchema, 'params'), markAsRead);

export default router;
