/**
 * Trip Service — TypeScript
 * ==========================
 *
 * Business logic for trips. Inputs arriving here are already Zod-validated
 * by the route layer; we still defend invariants (auth, existence,
 * participant membership) before touching state.
 */

import { Types } from 'mongoose';
import Trip, { ITrip, TripDocument } from '../models/trip.model.js';
import User from '../models/user.model.js';
import * as notificationService from './notification.service.js';

type ObjectIdLike = string | Types.ObjectId;

/** Mongo regex metacharacters that must be escaped for safe user-input search. */
const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export interface CreateTripData {
  title: string;
  description?: string;
  startLocation: ITrip['startLocation'];
  destination: ITrip['destination'];
  stops?: ITrip['stops'];
  startDate: string | Date;
  startTime?: string | null;
  days: number;
  spots: number | null;
  requireApproval?: boolean;
  distance?: number;
  elevation?: number;
  participantIds?: ObjectIdLike[];
}

export const createTrip = async (
  tripData: CreateTripData,
  creatorId: ObjectIdLike
): Promise<TripDocument> => {
  const {
    title,
    description,
    startLocation,
    destination,
    stops,
    startDate,
    startTime,
    days,
    spots,
    requireApproval,
    distance,
    elevation,
    participantIds,
  } = tripData;

  const creator = await User.findById(creatorId);
  if (!creator) throw new Error('Creator not found');

  if (participantIds && participantIds.length > 0) {
    const participants = await User.find({ _id: { $in: participantIds } });
    if (participants.length !== participantIds.length) {
      throw new Error('One or more participants not found');
    }
  }

  // Creator counts as one occupied spot. `null` spots = unlimited.
  const initialParticipantCount = 1 + (participantIds?.length ?? 0);
  if (spots != null && initialParticipantCount > spots) {
    throw new Error('Participants exceed available spots');
  }

  const start = new Date(startDate);

  const tripDoc = new Trip({
    title,
    description,
    startLocation,
    destination,
    stops: stops ?? [],
    createdBy: new Types.ObjectId(creatorId.toString()),
    participants: [
      { user: new Types.ObjectId(creatorId.toString()), joinedAt: new Date() },
      ...(participantIds ?? []).map((id) => ({
        user: new Types.ObjectId(id.toString()),
        joinedAt: new Date(),
      })),
    ],
    startDate: start,
    startTime: startTime ?? null,
    days,
    spots,
    requireApproval: requireApproval ?? true,
    ...(distance !== undefined ? { distance } : {}),
    ...(elevation !== undefined ? { elevation } : {}),
  });

  tripDoc.trackingGroupId = `trip_${tripDoc._id.toString().slice(-8)}`;
  await tripDoc.save();

  const populated = await Trip.findById(tripDoc._id)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  if (!populated) throw new Error('Trip creation failed');
  return populated;
};

export const getTripById = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true })
    .populate('participants.user', 'fName lName')
    .populate('joinRequests.user', 'fName lName')
    .populate('createdBy', 'fName lName');

  if (!trip) throw new Error('Trip not found');
  if (!trip.isParticipant(userId)) {
    throw new Error('You are not a participant of this trip');
  }
  return trip;
};

export const getUserTrips = async (
  userId: ObjectIdLike,
  page = 1,
  limit = 20
): Promise<{
  trips: TripDocument[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> => {
  const skip = (page - 1) * limit;
  const query = {
    $or: [{ createdBy: userId }, { 'participants.user': userId }],
    isActive: true,
  };

  const trips = await Trip.find(query)
    .sort({ startDate: -1 })
    .skip(skip)
    .limit(limit)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  const total = await Trip.countDocuments(query);

  return {
    trips,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export interface UpdateTripData {
  title?: string;
  description?: string;
  startLocation?: ITrip['startLocation'];
  destination?: ITrip['destination'];
  stops?: ITrip['stops'];
  startDate?: string | Date;
  startTime?: string | null;
  days?: number;
  spots?: number | null;
  requireApproval?: boolean;
  distance?: number;
  elevation?: number;
}

export const updateTrip = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike,
  updates: UpdateTripData
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');
  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can update the trip');
  }

  const allowed: Array<keyof UpdateTripData> = [
    'title',
    'description',
    'startLocation',
    'destination',
    'stops',
    'startDate',
    'startTime',
    'days',
    'spots',
    'requireApproval',
    'distance',
    'elevation',
  ];

  for (const key of allowed) {
    if (updates[key] !== undefined) {
      if (key === 'startDate') {
        trip.startDate = new Date(updates[key] as string | Date);
      } else {
        (trip as unknown as Record<string, unknown>)[key] = updates[key];
      }
    }
  }

  if (
    updates.spots !== undefined &&
    updates.spots !== null &&
    trip.participants.length > updates.spots
  ) {
    throw new Error('spots cannot be lower than current participant count');
  }

  await trip.save();
  await trip.populate([
    { path: 'participants.user', select: 'fName lName email' },
    { path: 'createdBy', select: 'fName lName email' },
  ]);
  return trip;
};

export const addParticipants = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike,
  participantIds: ObjectIdLike[]
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');
  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can add participants');
  }

  const participants = await User.find({ _id: { $in: participantIds } });
  if (participants.length !== participantIds.length) {
    throw new Error('One or more users not found');
  }

  const newcomers = participantIds.filter((id) => !trip.isParticipant(id));
  if (
    trip.spots != null &&
    trip.participants.length + newcomers.length > trip.spots
  ) {
    throw new Error('Trip is full');
  }

  for (const participantId of participantIds) {
    try {
      await trip.addParticipant(participantId);
    } catch (error) {
      // Swallow the specific "already a participant" case — idempotent add.
      const msg = error instanceof Error ? error.message : '';
      if (msg !== 'User is already a participant') throw error;
    }
    await trip.removeJoinRequest(participantId);
  }

  await trip.populate([
    { path: 'participants.user', select: 'fName lName email' },
    { path: 'createdBy', select: 'fName lName email' },
  ]);
  return trip;
};

export const requestToJoinTrip = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<{ trip: TripDocument; status: 'joined' | 'requested' }> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');
  if (trip.isCreator(userId)) {
    throw new Error('You are the creator of this trip');
  }
  if (trip.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }

  const requester = await User.findById(userId).select('fName lName email');
  const requesterName =
    `${requester?.fName ?? ''} ${requester?.lName ?? ''}`.trim() || 'Someone';

  if (!trip.requireApproval) {
    if (trip.spots != null && trip.participants.length >= trip.spots) {
      throw new Error('Trip is full');
    }
    await trip.addParticipant(userId);
    await trip.removeJoinRequest(userId);

    await notificationService.createNotification(
      trip.createdBy,
      'trip.join_accepted',
      'New trip participant',
      `${requesterName} joined ${trip.title}`,
      {
        tripId: trip._id,
        tripTitle: trip.title,
        requesterId: userId,
        requesterName,
      }
    );

    return { trip, status: 'joined' };
  }

  await trip.addJoinRequest(userId);

  await notificationService.createNotification(
    trip.createdBy,
    'trip.join_request',
    'New trip join request',
    `${requesterName} requested to join ${trip.title}`,
    {
      tripId: trip._id,
      tripTitle: trip.title,
      requesterId: userId,
      requesterName,
    }
  );

  return { trip, status: 'requested' };
};

export const acceptJoinRequest = async (
  tripId: ObjectIdLike,
  creatorId: ObjectIdLike,
  requesterId: ObjectIdLike
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');
  if (!trip.isCreator(creatorId)) {
    throw new Error('Only the creator can accept join requests');
  }
  if (!trip.hasJoinRequest(requesterId)) {
    throw new Error('No pending join request from this user');
  }
  if (trip.spots != null && trip.participants.length >= trip.spots) {
    throw new Error('Trip is full');
  }

  await trip.addParticipant(requesterId);
  await trip.removeJoinRequest(requesterId);

  const creator = await User.findById(creatorId).select('fName lName');
  const creatorName =
    `${creator?.fName ?? ''} ${creator?.lName ?? ''}`.trim() || 'The creator';

  await notificationService.createNotification(
    requesterId,
    'trip.join_accepted',
    'Join request accepted',
    `${creatorName} accepted your request to join ${trip.title}`,
    {
      tripId: trip._id,
      tripTitle: trip.title,
      creatorId,
    }
  );

  await trip.populate([
    { path: 'participants.user', select: 'fName lName email' },
    { path: 'createdBy', select: 'fName lName email' },
  ]);
  return trip;
};

export const getJoinRequests = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<TripDocument['joinRequests']> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true }).populate(
    'joinRequests.user',
    'fName lName email'
  );
  if (!trip) throw new Error('Trip not found');
  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can view join requests');
  }
  return trip.joinRequests;
};

export const removeParticipant = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike,
  targetUserId: ObjectIdLike
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');

  const isSelfRemoval = userId.toString() === targetUserId.toString();
  if (!isSelfRemoval && !trip.isCreator(userId)) {
    throw new Error('Only the creator can remove participants');
  }
  if (trip.isCreator(targetUserId)) {
    throw new Error('Cannot remove trip creator');
  }

  await trip.removeParticipant(targetUserId);
  await trip.populate([
    { path: 'participants.user', select: 'fName lName email' },
    { path: 'createdBy', select: 'fName lName email' },
  ]);
  return trip;
};

export const deleteTrip = async (
  tripId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<TripDocument> => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });
  if (!trip) throw new Error('Trip not found');
  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can delete the trip');
  }

  trip.isActive = false;
  await trip.save();
  return trip;
};

export interface SearchTripsFilters {
  from?: string;
  to?: string;
  startDate?: string;
  endDate?: string;
}

export const searchTrips = async (
  filters: SearchTripsFilters,
  page = 1,
  limit = 20
): Promise<{
  trips: TripDocument[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> => {
  const skip = (page - 1) * limit;
  const query: Record<string, unknown> = { isActive: true };

  // Default: only upcoming trips.
  (query as { startDate: Record<string, Date> }).startDate = { $gte: new Date() };

  const fromOr = filters.from
    ? [
        { 'startLocation.city': { $regex: escapeRegex(filters.from), $options: 'i' } },
        { 'startLocation.name': { $regex: escapeRegex(filters.from), $options: 'i' } },
      ]
    : null;

  const toOr = filters.to
    ? [
        { 'destination.city': { $regex: escapeRegex(filters.to), $options: 'i' } },
        { 'destination.name': { $regex: escapeRegex(filters.to), $options: 'i' } },
      ]
    : null;

  if (fromOr && toOr) {
    query['$and'] = [{ $or: fromOr }, { $or: toOr }];
  } else if (fromOr) {
    query['$or'] = fromOr;
  } else if (toOr) {
    query['$or'] = toOr;
  }

  if (filters.startDate || filters.endDate) {
    const dateQuery: Record<string, Date> = {};
    const now = new Date();
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      dateQuery['$gte'] = start > now ? start : now;
    } else {
      dateQuery['$gte'] = now;
    }
    if (filters.endDate) {
      dateQuery['$lte'] = new Date(filters.endDate);
    }
    (query as { startDate: Record<string, Date> }).startDate = dateQuery;
  }

  const trips = await Trip.find(query)
    .sort({ startDate: 1 })
    .skip(skip)
    .limit(limit)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  const total = await Trip.countDocuments(query);

  return {
    trips,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};
