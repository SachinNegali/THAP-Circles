import express from 'express';
import * as tripController from '../../controllers/trip.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Trip management routes
router.post('/', tripController.createTrip);
router.get('/', tripController.getUserTrips);
router.get('/:id', tripController.getTrip);
router.patch('/:id', tripController.updateTrip);
router.delete('/:id', tripController.deleteTrip);

// Participant management routes
router.post('/:id/participants', tripController.addParticipants);
router.delete('/:id/participants/:userId', tripController.removeParticipant);

export default router;
