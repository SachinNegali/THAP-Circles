import * as tripService from '../services/trip.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';

/**
 * Create a new trip
 * POST /trips
 */
export const createTrip = async (req, res) => {
  try {
    const { title, description, startLocation, destination, stops, startDate, endDate, participantIds } = req.body;
    const creatorId = req.user._id;

    if (!title) {
      return sendBadRequest(res, 'Trip title is required');
    }

    if (!startLocation || !destination) {
      return sendBadRequest(res, 'Start location and destination are required');
    }

    if (!startDate || !endDate) {
      return sendBadRequest(res, 'Start date and end date are required');
    }

    const trip = await tripService.createTrip(
      { title, description, startLocation, destination, stops, startDate, endDate, participantIds },
      creatorId
    );

    res.status(201).send({
      message: 'Trip created successfully',
      trip,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to create trip');
  }
};

/**
 * Get trip details
 * GET /trips/:id
 */
export const getTrip = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user._id;

    const trip = await tripService.getTripById(tripId, userId);

    res.send({ trip });
  } catch (error) {
    return handleError(res, error, 'Failed to get trip');
  }
};

/**
 * Get all trips for current user
 * GET /trips
 */
export const getUserTrips = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await tripService.getUserTrips(userId, page, limit);

    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get trips');
  }
};

/**
 * Update trip information
 * PATCH /trips/:id
 */
export const updateTrip = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user._id;
    const updates = req.body;

    const trip = await tripService.updateTrip(tripId, userId, updates);

    res.send({
      message: 'Trip updated successfully',
      trip,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to update trip');
  }
};

/**
 * Add participants to trip
 * POST /trips/:id/participants
 */
export const addParticipants = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user._id;
    const { participantIds } = req.body;

    if (!participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
      return sendBadRequest(res, 'participantIds array is required');
    }

    const trip = await tripService.addParticipants(tripId, userId, participantIds);

    res.send({
      message: 'Participants added successfully',
      trip,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to add participants');
  }
};

/**
 * Remove participant from trip
 * DELETE /trips/:id/participants/:userId
 */
export const removeParticipant = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user._id;
    const targetUserId = req.params.userId;

    const trip = await tripService.removeParticipant(tripId, userId, targetUserId);

    res.send({
      message: 'Participant removed successfully',
      trip,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to remove participant');
  }
};

/**
 * Delete trip
 * DELETE /trips/:id
 */
export const deleteTrip = async (req, res) => {
  try {
    const tripId = req.params.id;
    const userId = req.user._id;

    await tripService.deleteTrip(tripId, userId);

    res.send({
      message: 'Trip deleted successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to delete trip');
  }
};
