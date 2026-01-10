import express from 'express';
import {socialLogin, refreshTokens} from '../../controllers/auth.controller.js';

const router = express.Router();

router.post('/social-login', socialLogin);
router.post('/refresh-tokens', refreshTokens);

export default router;
