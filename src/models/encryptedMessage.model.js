import mongoose, { Types } from 'mongoose';

const encryptedMessageSchema = new mongoose.Schema(
  {
    chatId: {
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

    // Message type hint (server needs for routing/notification, NOT encrypted content)
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'video', 'audio'],
      default: 'text',
    },

    // Encrypted payload — OPAQUE to server
    ciphertext: {
      type: String,
      required: true,
    },

    // Key exchange metadata (for initial X3DH messages)
    ephemeralKey: {
      type: String, // base64 sender's ephemeral public key
      default: null,
    },
    oneTimePreKeyId: {
      type: Number, // which OPK was consumed (initial msg only)
      default: null,
    },

    // Ratchet state (used by receiver for decryption ordering)
    messageNumber: {
      type: Number,
      default: 0,
    },
    previousChainLength: {
      type: Number,
      default: 0,
    },

    // Server-managed metadata (NOT encrypted)
    isDeleted: {
      type: Boolean,
      default: false,
    },
    readBy: [
      {
        userId: {
          type: Types.ObjectId,
          ref: 'User',
        },
        readAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],

    // Encrypted attachment references
    attachments: [
      {
        encryptedUrl: String,    // URL of encrypted blob on storage
        mimeType: String,        // e.g., 'image/jpeg', 'video/mp4'
        sizeBytes: Number,       // file size (plaintext for quota)
        thumbnailUrl: String,    // URL of encrypted thumbnail (optional)
        // NOTE: AES key, IV, and hash are INSIDE the ciphertext field
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
encryptedMessageSchema.index({ chatId: 1, createdAt: -1 });
encryptedMessageSchema.index({ senderId: 1, createdAt: -1 });
encryptedMessageSchema.index({ chatId: 1, 'readBy.userId': 1 });

const EncryptedMessage = mongoose.model('EncryptedMessage', encryptedMessageSchema);

export default EncryptedMessage;
