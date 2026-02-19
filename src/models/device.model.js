import mongoose, { Types } from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    userId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    deviceId: {
      type: String,
      required: true,
      trim: true,
    },
    deviceName: {
      type: String,
      trim: true,
      maxlength: 100,
    },
    platform: {
      type: String,
      enum: ['ios', 'android'],
      required: true,
    },
    pushToken: {
      type: String,
      default: null,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
    registeredAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one device per user
deviceSchema.index({ userId: 1, deviceId: 1 }, { unique: true });
// For fetching devices sorted by activity
deviceSchema.index({ userId: 1, lastActiveAt: -1 });

const Device = mongoose.model('Device', deviceSchema);

export default Device;
