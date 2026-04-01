import { Router } from 'express';
import { getMe, updateMe, searchUsers } from '../../controllers/user.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import { updateMeSchema, searchUsersSchema } from '../../validations/user.validation.js';

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
router.patch('/me', authMiddleware, validate(updateMeSchema), updateMe);

/**
 * GET /user/search
 * Security: authMiddleware required
 * Fuzzy search for users by name or userId. Paginated.
 */
router.get('/search', authMiddleware, validate(searchUsersSchema, 'query'), searchUsers);

export default router;
