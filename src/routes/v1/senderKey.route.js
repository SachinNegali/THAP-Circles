import express from 'express';
import * as senderKeyController from '../../controllers/senderKey.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Sender key distribution and retrieval
router.post('/:groupId/sender-keys', senderKeyController.distributeSenderKeys);
router.get('/:groupId/sender-keys', senderKeyController.getSenderKeys);

export default router;
