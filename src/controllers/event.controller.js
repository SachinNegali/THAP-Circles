import * as eventService from '../services/event.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';

/**
 * Create a new event
 * POST /events
 */
export const createEvent = async (req, res) => {
  try {
    const { title, description, startLocation, endLocation, startTime, endTime, maxParticipants } = req.body;
    const creatorId = req.user._id;

    if (!title) {
      return sendBadRequest(res, 'Event title is required');
    }

    if (!startLocation || !endLocation) {
      return sendBadRequest(res, 'Start location and end location are required');
    }

    if (!startTime || !endTime) {
      return sendBadRequest(res, 'Start time and end time are required');
    }

    const event = await eventService.createEvent(
      { title, description, startLocation, endLocation, startTime, endTime, maxParticipants },
      creatorId
    );

    res.status(201).send({
      message: 'Event created successfully',
      event,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to create event');
  }
};

/**
 * Get event details
 * GET /events/:id
 */
export const getEvent = async (req, res) => {
  try {
    const eventId = req.params.id;

    const event = await eventService.getEventById(eventId);

    res.send({ event });
  } catch (error) {
    return handleError(res, error, 'Failed to get event');
  }
};

/**
 * Get all events for current user
 * GET /events
 */
export const getUserEvents = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await eventService.getUserEvents(userId, page, limit);

    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get events');
  }
};

/**
 * Update event information
 * PATCH /events/:id
 */
export const updateEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user._id;
    const updates = req.body;

    const event = await eventService.updateEvent(eventId, userId, updates);

    res.send({
      message: 'Event updated successfully',
      event,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to update event');
  }
};

/**
 * Join event
 * POST /events/:id/join
 */
export const joinEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user._id;

    const event = await eventService.joinEvent(eventId, userId);

    res.send({
      message: 'Successfully joined the event',
      event,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to join event');
  }
};

/**
 * Leave event
 * POST /events/:id/leave
 */
export const leaveEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user._id;

    const event = await eventService.leaveEvent(eventId, userId);

    res.send({
      message: 'Successfully left the event',
      event,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to leave event');
  }
};

/**
 * Get event participants
 * GET /events/:id/participants
 */
export const getEventParticipants = async (req, res) => {
  try {
    const eventId = req.params.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const result = await eventService.getEventParticipants(eventId, page, limit);

    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get event participants');
  }
};

/**
 * Delete event
 * DELETE /events/:id
 */
export const deleteEvent = async (req, res) => {
  try {
    const eventId = req.params.id;
    const userId = req.user._id;

    await eventService.deleteEvent(eventId, userId);

    res.send({
      message: 'Event deleted successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to delete event');
  }
};
