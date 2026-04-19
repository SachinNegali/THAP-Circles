import Trip from '../models/trip.model.js';
import User from '../models/user.model.js';
import * as notificationService from './notification.service.js';

/**
 * Create a new trip
 * @param {Object} tripData - Trip data
 * @param {ObjectId} creatorId - Creator user ID
 * @returns {Promise<Trip>}
 */
export const createTrip = async (tripData, creatorId) => {
  const { title, description, startLocation, destination, stops, startDate, endDate, participantIds } = tripData;

  // Verify creator exists
  const creator = await User.findById(creatorId);
  if (!creator) {
    throw new Error('Creator not found');
  }

  // Verify all participants exist if provided
  if (participantIds && participantIds.length > 0) {
    const participants = await User.find({ _id: { $in: participantIds } });
    if (participants.length !== participantIds.length) {
      throw new Error('One or more participants not found');
    }
  }

  // Validate dates
  const start = new Date(startDate);
  const end = new Date(endDate);
  
  if (start >= end) {
    throw new Error('End date must be after start date');
  }

  // Create trip with creator as first participant
  const tripDoc = new Trip({
    title,
    description,
    startLocation,
    destination,
    stops: stops || [],
    createdBy: creatorId,
    participants: [
      {
        user: creatorId,
        joinedAt: new Date(),
      },
      ...(participantIds || []).map((id) => ({
        user: id,
        joinedAt: new Date(),
      })),
    ],
    startDate: start,
    endDate: end,
  });

  tripDoc.trackingGroupId = `trip_${tripDoc._id.toString().slice(-8)}`;
  await tripDoc.save();

  const populatedTrip = await Trip.findById(tripDoc._id)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  return populatedTrip;
};

/**
 * Get trip by ID
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
export const getTripById = async (tripId, userId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true })
    .populate('participants.user', 'fName lName')
    .populate('joinRequests.user', 'fName lName')
    .populate('createdBy', 'fName lName');

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.isParticipant(userId)) {
    throw new Error('You are not a participant of this trip');
  }

  return trip;
};

/**
 * Get all trips for a user (created or participating)
 * @param {ObjectId} userId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getUserTrips = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const trips = await Trip.find({
    $or: [{ createdBy: userId }, { 'participants.user': userId }],
    isActive: true,
  })
    .sort({ startDate: -1 })
    .skip(skip)
    .limit(limit)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  const total = await Trip.countDocuments({
    $or: [{ createdBy: userId }, { 'participants.user': userId }],
    isActive: true,
  });

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

/**
 * Update trip information
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @param {Object} updates
 * @returns {Promise<Trip>}
 */
export const updateTrip = async (tripId, userId, updates) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can update the trip');
  }

  // Update allowed fields
  const allowedUpdates = ['title', 'description', 'startLocation', 'destination', 'stops', 'startDate', 'endDate'];
  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      trip[key] = updates[key];
    }
  });

  // Validate dates if updated
  if (updates.startDate || updates.endDate) {
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate);
    
    if (start >= end) {
      throw new Error('End date must be after start date');
    }
  }

  await trip.save();

  await trip.populate([{ path: 'participants.user', select: 'fName lName email' }, { path: 'createdBy', select: 'fName lName email' }]);
  return trip;
};

/**
 * Add participants to trip
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @param {Array<ObjectId>} participantIds
 * @returns {Promise<Trip>}
 */
export const addParticipants = async (tripId, userId, participantIds) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can add participants');
  }

  // Verify all participants exist
  const participants = await User.find({ _id: { $in: participantIds } });
  if (participants.length !== participantIds.length) {
    throw new Error('One or more users not found');
  }

  // Add participants
  for (const participantId of participantIds) {
    try {
      await trip.addParticipant(participantId);
    } catch (error) {
      // Skip if already a participant
      if (error.message !== 'User is already a participant') {
        throw error;
      }
    }
    // Clear any pending join request once the user is a participant
    await trip.removeJoinRequest(participantId);
  }

  await trip.populate([{ path: 'participants.user', select: 'fName lName email' }, { path: 'createdBy', select: 'fName lName email' }]);
  return trip;
};

/**
 * Request to join a trip
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
export const requestToJoinTrip = async (tripId, userId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (trip.isCreator(userId)) {
    throw new Error('You are the creator of this trip');
  }

  await trip.addJoinRequest(userId);

  const requester = await User.findById(userId).select('fName lName email');
  const requesterName = `${requester?.fName || ''} ${requester?.lName || ''}`.trim() || 'Someone';

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

  return trip;
};

/**
 * Get pending join requests for a trip (creator only)
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @returns {Promise<Array>}
 */
export const getJoinRequests = async (tripId, userId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true })
    .populate('joinRequests.user', 'fName lName email');

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can view join requests');
  }

  return trip.joinRequests;
};

/**
 * Remove participant from trip
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @param {ObjectId} targetUserId
 * @returns {Promise<Trip>}
 */
export const removeParticipant = async (tripId, userId, targetUserId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });

  if (!trip) {
    throw new Error('Trip not found');
  }

  // Allow self-removal or creator removal
  const isSelfRemoval = userId.toString() === targetUserId.toString();
  if (!isSelfRemoval && !trip.isCreator(userId)) {
    throw new Error('Only the creator can remove participants');
  }

  // Cannot remove creator
  if (trip.isCreator(targetUserId)) {
    throw new Error('Cannot remove trip creator');
  }

  await trip.removeParticipant(targetUserId);

  await trip.populate([{ path: 'participants.user', select: 'fName lName email' }, { path: 'createdBy', select: 'fName lName email' }]);
  return trip;
};

/**
 * Delete trip (soft delete)
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
export const deleteTrip = async (tripId, userId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true });

  if (!trip) {
    throw new Error('Trip not found');
  }

  if (!trip.isCreator(userId)) {
    throw new Error('Only the creator can delete the trip');
  }

  trip.isActive = false;
  await trip.save();

  return trip;
};

/**
 * Search trips with filters
 * @param {Object} filters - Filter criteria (from, to, startDate, endDate)
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const searchTrips = async (filters, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;
  const query = { isActive: true };

  // Always enforce upcoming trips by default
  query.startDate = { $gte: new Date() };

  if (filters.from) {
    query.$or = [
      { 'startLocation.city': { $regex: filters.from, $options: 'i' } },
      { 'startLocation.name': { $regex: filters.from, $options: 'i' } },
    ];
  }

  if (filters.to) {
    const toCondition = {
      $or: [
        { 'destination.city': { $regex: filters.to, $options: 'i' } },
        { 'destination.name': { $regex: filters.to, $options: 'i' } },
      ]
    };
    
    if (query.$or) {
      query.$and = [{ $or: query.$or }, toCondition];
      delete query.$or;
    } else {
      query.$or = toCondition.$or;
    }
  }

  if (filters.startDate || filters.endDate) {
    const dateQuery = {};
    if (filters.startDate) {
      const start = new Date(filters.startDate);
      const now = new Date();
      dateQuery.$gte = start > now ? start : now;
    } else {
      dateQuery.$gte = new Date();
    }
    
    if (filters.endDate) {
      dateQuery.$lte = new Date(filters.endDate);
    }
    query.startDate = dateQuery;
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
