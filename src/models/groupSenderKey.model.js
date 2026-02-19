import mongoose, { Types } from 'mongoose';

const groupSenderKeySchema = new mongoose.Schema(
  {
    groupId: {
      type: Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    senderId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    senderDeviceId: {
      type: String,
      required: true,
    },
    recipientId: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recipientDeviceId: {
      type: String,
      required: true,
    },

    // The sender key, encrypted for the recipient — OPAQUE to server
    encryptedSenderKey: {
      type: String,
      required: true,
    },

    // Versioning for key rotation
    version: {
      type: Number,
      default: 1,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
groupSenderKeySchema.index({ groupId: 1, recipientId: 1, recipientDeviceId: 1 });
groupSenderKeySchema.index({ groupId: 1, senderId: 1, version: -1 });
groupSenderKeySchema.index(
  { groupId: 1, senderId: 1, senderDeviceId: 1, recipientId: 1, recipientDeviceId: 1 },
  { unique: true }
);

const GroupSenderKey = mongoose.model('GroupSenderKey', groupSenderKeySchema);

export default GroupSenderKey;
