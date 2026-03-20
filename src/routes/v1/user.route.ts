import { Router } from 'express';
import { getMe, updateMe } from '../../controllers/user.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { updateMeSchema } from '../../validations/user.validation.js';

const router = Router();

/**
 * GET /user/me
 * Security: authMiddleware required
 */
router.get('/me', authMiddleware, getMe);

/**
 * PATCH /user/me
 * Security: authMiddleware required
 * Updates fName, lName, and/or userId. userId must be globally unique.
 */
router.patch('/me', 
    (req, res, next)=> {console.log("call here", req.body, req.params, req.query); next()},authMiddleware, validate(updateMeSchema), updateMe);

export default router;
