import Trip from '../models/trip.model.js';
import User from '../models/user.model.js';

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
  const trip = await Trip.create({
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

  return trip.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
};

/**
 * Get trip by ID
 * @param {ObjectId} tripId
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
export const getTripById = async (tripId, userId) => {
  const trip = await Trip.findOne({ _id: tripId, isActive: true })
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

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

  return trip.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
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
  }

  return trip.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
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

  return trip.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
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
