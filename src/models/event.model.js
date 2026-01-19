import mongoose, { Types } from 'mongoose';
import locationSchema from './location.schema.js';

const eventSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    startLocation: {
      type: locationSchema,
      required: true,
    },
    endLocation: {
      type: locationSchema,
      required: true,
    },
    createdBy: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    participants: [
      {
        user: {
          type: Types.ObjectId,
          ref: 'User',
          required: true,
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    startTime: {
      type: Date,
      required: true,
    },
    endTime: {
      type: Date,
      required: true,
    },
    maxParticipants: {
      type: Number,
      default: null, // null means unlimited
      min: -1, // -1 also means unlimited
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
eventSchema.index({ createdBy: 1, isActive: 1 });
eventSchema.index({ 'participants.user': 1, isActive: 1 });
eventSchema.index({ startTime: 1, isActive: 1 });
eventSchema.index({ isActive: 1, startTime: -1 });

// Validation: endTime must be after startTime
eventSchema.pre('save', function (next) {
  if (this.endTime <= this.startTime) {
    next(new Error('End time must be after start time'));
  } else {
    next();
  }
});

/**
 * Check if user is a participant of the event
 * @param {ObjectId} userId
 * @returns {boolean}
 */
eventSchema.methods.isParticipant = function (userId) {
  return this.participants.some((participant) => participant.user.toString() === userId.toString());
};

/**
 * Check if user is the creator of the event
 * @param {ObjectId} userId
 * @returns {boolean}
 */
eventSchema.methods.isCreator = function (userId) {
  return this.createdBy.toString() === userId.toString();
};

/**
 * Check if event has available slots
 * @returns {boolean}
 */
eventSchema.methods.hasAvailableSlots = function () {
  // Unlimited slots
  if (this.maxParticipants === null || this.maxParticipants === -1) {
    return true;
  }
  
  return this.participants.length < this.maxParticipants;
};

/**
 * Get available slots count
 * @returns {number|string}
 */
eventSchema.methods.getAvailableSlots = function () {
  // Unlimited slots
  if (this.maxParticipants === null || this.maxParticipants === -1) {
    return 'unlimited';
  }
  
  return Math.max(0, this.maxParticipants - this.participants.length);
};

/**
 * Check if user can join the event
 * @param {ObjectId} userId
 * @returns {boolean}
 */
eventSchema.methods.canJoin = function (userId) {
  if (this.isParticipant(userId)) {
    return false;
  }
  
  return this.hasAvailableSlots();
};

/**
 * Join event
 * @param {ObjectId} userId
 * @returns {Promise<Event>}
 */
eventSchema.methods.joinEvent = async function (userId) {
  if (this.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }

  if (!this.hasAvailableSlots()) {
    throw new Error('Event is full');
  }

  this.participants.push({
    user: userId,
    joinedAt: new Date(),
  });

  return this.save();
};

/**
 * Leave event
 * @param {ObjectId} userId
 * @returns {Promise<Event>}
 */
eventSchema.methods.leaveEvent = async function (userId) {
  const participantIndex = this.participants.findIndex(
    (p) => p.user.toString() === userId.toString()
  );

  if (participantIndex === -1) {
    throw new Error('User is not a participant');
  }

  this.participants.splice(participantIndex, 1);
  return this.save();
};

/**
 * Get participant count
 * @returns {number}
 */
eventSchema.methods.getParticipantCount = function () {
  return this.participants.length;
};

const Event = mongoose.model('Event', eventSchema);

export default Event;
