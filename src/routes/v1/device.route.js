import express from 'express';
import * as deviceController from '../../controllers/device.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Device registration
router.post('/register', deviceController.registerDevice);

export default router;
