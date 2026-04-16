import { Router } from 'express';
import {
  getProfile,
  updateProfile,
  addEmergencyContact,
  updateEmergencyContact,
  deleteEmergencyContact,
} from '../../controllers/userProfile.controller.js';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  updateProfileSchema,
  addEmergencyContactSchema,
  updateEmergencyContactSchema,
} from '../../validations/userProfile.validation.js';

const router = Router();

router.get('/', authMiddleware, getProfile);
router.patch('/', authMiddleware, validate(updateProfileSchema), updateProfile);

router.post(
  '/emergency-contacts',
  authMiddleware,
  validate(addEmergencyContactSchema),
  addEmergencyContact
);
router.patch(
  '/emergency-contacts/:contactId',
  authMiddleware,
  validate(updateEmergencyContactSchema),
  updateEmergencyContact
);
router.delete('/emergency-contacts/:contactId', authMiddleware, deleteEmergencyContact);

export default router;
