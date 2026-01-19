import Event from '../models/event.model.js';
import User from '../models/user.model.js';

/**
 * Create a new event
 * @param {Object} eventData - Event data
 * @param {ObjectId} creatorId - Creator user ID
 * @returns {Promise<Event>}
 */
export const createEvent = async (eventData, creatorId) => {
  const { title, description, startLocation, endLocation, startTime, endTime, maxParticipants } = eventData;

  // Verify creator exists
  const creator = await User.findById(creatorId);
  if (!creator) {
    throw new Error('Creator not found');
  }

  // Validate times
  const start = new Date(startTime);
  const end = new Date(endTime);
  
  if (start >= end) {
    throw new Error('End time must be after start time');
  }

  // Validate maxParticipants
  if (maxParticipants !== null && maxParticipants !== -1 && maxParticipants < 1) {
    throw new Error('Max participants must be at least 1 or null/-1 for unlimited');
  }

  // Create event with creator as first participant
  const event = await Event.create({
    title,
    description,
    startLocation,
    endLocation,
    createdBy: creatorId,
    participants: [
      {
        user: creatorId,
        joinedAt: new Date(),
      },
    ],
    startTime: start,
    endTime: end,
    maxParticipants: maxParticipants === -1 ? null : maxParticipants,
  });

  return event.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
};

/**
 * Get event by ID
 * @param {ObjectId} eventId
 * @returns {Promise<Event>}
 */
export const getEventById = async (eventId) => {
  const event = await Event.findOne({ _id: eventId, isActive: true })
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  if (!event) {
    throw new Error('Event not found');
  }

  // Add available slots info
  const eventObj = event.toObject();
  eventObj.availableSlots = event.getAvailableSlots();
  eventObj.participantCount = event.getParticipantCount();

  return eventObj;
};

/**
 * Get all events for a user (created or participating)
 * @param {ObjectId} userId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getUserEvents = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const events = await Event.find({
    $or: [{ createdBy: userId }, { 'participants.user': userId }],
    isActive: true,
  })
    .sort({ startTime: -1 })
    .skip(skip)
    .limit(limit)
    .populate('participants.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  const total = await Event.countDocuments({
    $or: [{ createdBy: userId }, { 'participants.user': userId }],
    isActive: true,
  });

  // Add available slots info to each event
  const eventsWithSlots = events.map((event) => {
    const eventObj = event.toObject();
    eventObj.availableSlots = event.getAvailableSlots();
    eventObj.participantCount = event.getParticipantCount();
    return eventObj;
  });

  return {
    events: eventsWithSlots,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update event information
 * @param {ObjectId} eventId
 * @param {ObjectId} userId
 * @param {Object} updates
 * @returns {Promise<Event>}
 */
export const updateEvent = async (eventId, userId, updates) => {
  const event = await Event.findOne({ _id: eventId, isActive: true });

  if (!event) {
    throw new Error('Event not found');
  }

  if (!event.isCreator(userId)) {
    throw new Error('Only the creator can update the event');
  }

  // Update allowed fields
  const allowedUpdates = ['title', 'description', 'startLocation', 'endLocation', 'startTime', 'endTime', 'maxParticipants'];
  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      if (key === 'maxParticipants' && updates[key] === -1) {
        event[key] = null;
      } else {
        event[key] = updates[key];
      }
    }
  });

  // Validate times if updated
  if (updates.startTime || updates.endTime) {
    const start = new Date(event.startTime);
    const end = new Date(event.endTime);
    
    if (start >= end) {
      throw new Error('End time must be after start time');
    }
  }

  // Validate maxParticipants if updated
  if (updates.maxParticipants !== undefined) {
    const maxP = updates.maxParticipants;
    if (maxP !== null && maxP !== -1 && maxP < event.getParticipantCount()) {
      throw new Error(`Cannot set max participants below current participant count (${event.getParticipantCount()})`);
    }
  }

  await event.save();

  const eventObj = event.toObject();
  eventObj.availableSlots = event.getAvailableSlots();
  eventObj.participantCount = event.getParticipantCount();

  return eventObj;
};

/**
 * Join event
 * @param {ObjectId} eventId
 * @param {ObjectId} userId
 * @returns {Promise<Event>}
 */
export const joinEvent = async (eventId, userId) => {
  const event = await Event.findOne({ _id: eventId, isActive: true });

  if (!event) {
    throw new Error('Event not found');
  }

  // Verify user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  await event.joinEvent(userId);

  const updatedEvent = await event.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
  
  const eventObj = updatedEvent.toObject();
  eventObj.availableSlots = updatedEvent.getAvailableSlots();
  eventObj.participantCount = updatedEvent.getParticipantCount();

  return eventObj;
};

/**
 * Leave event
 * @param {ObjectId} eventId
 * @param {ObjectId} userId
 * @returns {Promise<Event>}
 */
export const leaveEvent = async (eventId, userId) => {
  const event = await Event.findOne({ _id: eventId, isActive: true });

  if (!event) {
    throw new Error('Event not found');
  }

  // Cannot leave if creator
  if (event.isCreator(userId)) {
    throw new Error('Event creator cannot leave the event');
  }

  await event.leaveEvent(userId);

  const updatedEvent = await event.populate('participants.user', 'fName lName email').populate('createdBy', 'fName lName email');
  
  const eventObj = updatedEvent.toObject();
  eventObj.availableSlots = updatedEvent.getAvailableSlots();
  eventObj.participantCount = updatedEvent.getParticipantCount();

  return eventObj;
};

/**
 * Get event participants
 * @param {ObjectId} eventId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getEventParticipants = async (eventId, page = 1, limit = 50) => {
  const event = await Event.findOne({ _id: eventId, isActive: true });

  if (!event) {
    throw new Error('Event not found');
  }

  const skip = (page - 1) * limit;
  const total = event.participants.length;

  // Populate and paginate participants
  const populatedEvent = await Event.findOne({ _id: eventId, isActive: true })
    .populate({
      path: 'participants.user',
      select: 'fName lName email',
      options: {
        skip,
        limit,
      },
    });

  return {
    participants: populatedEvent.participants.slice(skip, skip + limit),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Delete event (soft delete)
 * @param {ObjectId} eventId
 * @param {ObjectId} userId
 * @returns {Promise<Event>}
 */
export const deleteEvent = async (eventId, userId) => {
  const event = await Event.findOne({ _id: eventId, isActive: true });

  if (!event) {
    throw new Error('Event not found');
  }

  if (!event.isCreator(userId)) {
    throw new Error('Only the creator can delete the event');
  }

  event.isActive = false;
  await event.save();

  return event;
};
