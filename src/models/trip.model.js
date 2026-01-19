import mongoose, { Types } from 'mongoose';
import locationSchema from './location.schema.js';

const tripSchema = new mongoose.Schema(
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
    destination: {
      type: locationSchema,
      required: true,
    },
    stops: [locationSchema],
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
    startDate: {
      type: Date,
      required: true,
    },
    endDate: {
      type: Date,
      required: true,
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
tripSchema.index({ createdBy: 1, isActive: 1 });
tripSchema.index({ 'participants.user': 1, isActive: 1 });
tripSchema.index({ startDate: 1, isActive: 1 });
tripSchema.index({ isActive: 1, startDate: -1 });

// Validation: endDate must be after startDate
tripSchema.pre('save', function (next) {
  if (this.endDate <= this.startDate) {
    next(new Error('End date must be after start date'));
  } else {
    next();
  }
});

/**
 * Check if user is a participant of the trip
 * @param {ObjectId} userId
 * @returns {boolean}
 */
tripSchema.methods.isParticipant = function (userId) {
  return this.participants.some((participant) => participant.user.toString() === userId.toString());
};

/**
 * Check if user is the creator of the trip
 * @param {ObjectId} userId
 * @returns {boolean}
 */
tripSchema.methods.isCreator = function (userId) {
  return this.createdBy.toString() === userId.toString();
};

/**
 * Add a participant to the trip
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
tripSchema.methods.addParticipant = async function (userId) {
  if (this.isParticipant(userId)) {
    throw new Error('User is already a participant');
  }

  this.participants.push({
    user: userId,
    joinedAt: new Date(),
  });

  return this.save();
};

/**
 * Remove a participant from the trip
 * @param {ObjectId} userId
 * @returns {Promise<Trip>}
 */
tripSchema.methods.removeParticipant = async function (userId) {
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
tripSchema.methods.getParticipantCount = function () {
  return this.participants.length;
};

const Trip = mongoose.model('Trip', tripSchema);

export default Trip;
