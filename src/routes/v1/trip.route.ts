/**
 * Trip Routes — TypeScript
 * ==========================
 *
 * All routes require authentication. Each route validates its inputs
 * with Zod middleware before the controller sees them — params and
 * query strings are validated alongside bodies.
 *
 * Route order matters: /filter must be declared before /:id so the
 * literal path isn't swallowed by the ObjectId param matcher.
 */

import { Router } from 'express';
import authMiddleware from '../../middlewares/auth.middleware.js';
import { validate } from '../../middlewares/validate.middleware.js';
import {
  createTripSchema,
  updateTripSchema,
  addParticipantsSchema,
  tripIdParamsSchema,
  tripIdUserIdParamsSchema,
  listUserTripsQuerySchema,
  searchTripsQuerySchema,
} from '../../validations/trip.validation.js';
import {
  createTrip,
  getTrip,
  getUserTrips,
  updateTrip,
  deleteTrip,
  addParticipants,
  removeParticipant,
  requestToJoin,
  acceptJoinRequest,
  getJoinRequests,
  searchTrips,
} from '../../controllers/trip.controller.js';

const router = Router();

router.use(authMiddleware);

// Search — must come before the :id catch-all
router.get('/filter', validate(searchTripsQuerySchema, 'query'), searchTrips);

// Trip CRUD
router.post('/', validate(createTripSchema), createTrip);
router.get('/', validate(listUserTripsQuerySchema, 'query'), getUserTrips);
router.get('/:id', validate(tripIdParamsSchema, 'params'), getTrip);
router.patch(
  '/:id',
  validate(tripIdParamsSchema, 'params'),
  validate(updateTripSchema),
  updateTrip
);
router.delete('/:id', validate(tripIdParamsSchema, 'params'), deleteTrip);

// Participant management
router.post(
  '/:id/participants',
  validate(tripIdParamsSchema, 'params'),
  validate(addParticipantsSchema),
  addParticipants
);
router.delete(
  '/:id/participants/:userId',
  validate(tripIdUserIdParamsSchema, 'params'),
  removeParticipant
);

// Join request flow
router.post('/:id/join', validate(tripIdParamsSchema, 'params'), requestToJoin);
router.get('/:id/requests', validate(tripIdParamsSchema, 'params'), getJoinRequests);
router.post(
  '/:id/requests/:userId/accept',
  validate(tripIdUserIdParamsSchema, 'params'),
  acceptJoinRequest
);

export default router;
