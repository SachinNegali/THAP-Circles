import mongoose, { Types } from 'mongoose';

const keyBundleSchema = new mongoose.Schema(
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

    // Long-term X25519 public key (base64-encoded) — OPAQUE to server
    identityKey: {
      type: String,
      required: true,
    },

    // Signed pre-key (rotated periodically by the client)
    signedPreKey: {
      id: {
        type: Number,
        required: true,
      },
      key: {
        type: String, // X25519 public key (base64)
        required: true,
      },
      signature: {
        type: String, // Ed25519 signature over the key (base64)
        required: true,
      },
      createdAt: {
        type: Date,
        default: Date.now,
      },
    },

    // One-time pre-keys (consumed on fetch — single use)
    oneTimePreKeys: [
      {
        id: {
          type: Number,
          required: true,
        },
        key: {
          type: String, // X25519 public key (base64)
          required: true,
        },
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Unique compound index: one key bundle per user-device pair
keyBundleSchema.index({ userId: 1, deviceId: 1 }, { unique: true });

const KeyBundle = mongoose.model('KeyBundle', keyBundleSchema);

export default KeyBundle;
