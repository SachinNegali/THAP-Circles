import express from 'express';
import * as eventController from '../../controllers/event.controller.js';
import auth from '../../middlewares/auth.js';

const router = express.Router();

// All routes require authentication
router.use(auth);

// Event management routes
router.post('/', eventController.createEvent);
router.get('/', eventController.getUserEvents);
router.get('/:id', eventController.getEvent);
router.patch('/:id', eventController.updateEvent);
router.delete('/:id', eventController.deleteEvent);

// Participant management routes
router.post('/:id/join', eventController.joinEvent);
router.post('/:id/leave', eventController.leaveEvent);
router.get('/:id/participants', eventController.getEventParticipants);

export default router;
