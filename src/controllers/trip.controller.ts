/**
 * Trip Controller — TypeScript
 * ==============================
 *
 * Thin HTTP layer. All input validation is performed by Zod middleware
 * in the routes file; handlers assume shapes are already trusted.
 */

import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as tripService from '../services/trip.service.js';
import logger from '../config/logger.js';
import type {
  CreateTripInput,
  UpdateTripInput,
  AddParticipantsInput,
  ListUserTripsQuery,
  SearchTripsQuery,
} from '../validations/trip.validation.js';

const log = logger.child({ module: 'trip' });

/**
 * Translate domain errors to client-visible HTTP status codes without
 * leaking stack traces. 400 for client-correctable, 403 for forbidden,
 * 404 for missing, 500 for everything else.
 */
const respondWithError = (
  res: Response,
  error: unknown,
  fallback: string
): void => {
  const message = error instanceof Error ? error.message : fallback;
  log.error({ err: error }, fallback);

  if (
    message === 'Trip not found' ||
    message === 'Creator not found' ||
    message === 'One or more participants not found' ||
    message === 'One or more users not found'
  ) {
    res.status(404).json({ message });
    return;
  }

  if (
    message.startsWith('Only the creator') ||
    message === 'You are not a participant of this trip' ||
    message === 'You are the creator of this trip' ||
    message === 'Cannot remove trip creator'
  ) {
    res.status(403).json({ message });
    return;
  }

  if (
    message === 'End date must be after start date' ||
    message === 'User is already a participant' ||
    message === 'Join request already exists' ||
    message === 'No pending join request from this user' ||
    message === 'User is not a participant' ||
    message === 'Trip is full' ||
    message === 'Participants exceed available spots' ||
    message === 'spots cannot be lower than current participant count'
  ) {
    res.status(400).json({ message });
    return;
  }

  res.status(500).json({ message: fallback });
};

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

/** POST /trips */
export const createTrip = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const data = req.body as CreateTripInput;
    const trip = await tripService.createTrip(
      {
        title: data.title,
        description: data.description,
        startLocation: data.startLocation,
        destination: data.destination,
        stops: data.stops,
        startDate: data.startDate,
        startTime: data.startTime ?? null,
        days: data.days,
        spots: data.spots,
        requireApproval: data.requireApproval,
        distance: data.distance,
        elevation: data.elevation,
        participantIds: data.participantIds,
      },
      userId
    );

    res.status(201).json({ message: 'Trip created successfully', trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to create trip');
  }
};

/** GET /trips/:id */
export const getTrip = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const trip = await tripService.getTripById(tripId, userId);
    res.json({ trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to get trip');
  }
};

/** GET /trips */
export const getUserTrips = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { page, limit } = req.query as unknown as ListUserTripsQuery;
    const result = await tripService.getUserTrips(userId, page, limit);
    res.json(result);
  } catch (error) {
    respondWithError(res, error, 'Failed to get trips');
  }
};

/** PATCH /trips/:id */
export const updateTrip = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const trip = await tripService.updateTrip(
      tripId,
      userId,
      req.body as UpdateTripInput
    );
    res.json({ message: 'Trip updated successfully', trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to update trip');
  }
};

/** POST /trips/:id/participants */
export const addParticipants = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const { participantIds } = req.body as AddParticipantsInput;
    const trip = await tripService.addParticipants(tripId, userId, participantIds);
    res.json({ message: 'Participants added successfully', trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to add participants');
  }
};

/** DELETE /trips/:id/participants/:userId */
export const removeParticipant = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const targetUserId = String(req.params['userId']);
    const trip = await tripService.removeParticipant(tripId, userId, targetUserId);
    res.json({ message: 'Participant removed successfully', trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to remove participant');
  }
};

/** DELETE /trips/:id */
export const deleteTrip = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    await tripService.deleteTrip(tripId, userId);
    res.json({ message: 'Trip deleted successfully' });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete trip');
  }
};

/** POST /trips/:id/join */
export const requestToJoin = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const { trip, status } = await tripService.requestToJoinTrip(tripId, userId);
    const message =
      status === 'joined' ? 'Joined trip successfully' : 'Join request sent successfully';
    res.json({ message, status, trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to send join request');
  }
};

/** POST /trips/:id/requests/:userId/accept */
export const acceptJoinRequest = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const requesterId = String(req.params['userId']);
    const trip = await tripService.acceptJoinRequest(tripId, userId, requesterId);
    res.json({ message: 'Join request accepted', trip });
  } catch (error) {
    respondWithError(res, error, 'Failed to accept join request');
  }
};

/** GET /trips/:id/requests */
export const getJoinRequests = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const tripId = String(req.params['id']);
    const joinRequests = await tripService.getJoinRequests(tripId, userId);
    res.json({ joinRequests });
  } catch (error) {
    respondWithError(res, error, 'Failed to get join requests');
  }
};

/** GET /trips/filter */
export const searchTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const { from, to, startDate, endDate, page, limit } =
      req.query as unknown as SearchTripsQuery;
    const result = await tripService.searchTrips(
      { from, to, startDate, endDate },
      page,
      limit
    );
    res.json(result);
  } catch (error) {
    respondWithError(res, error, 'Failed to filter trips');
  }
};
