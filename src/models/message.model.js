import mongoose, { Types } from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    group: {
      type: Types.ObjectId,
      ref: 'Group',
      required: true,
      index: true,
    },
    sender: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
    },
    content: {
      type: String,
      required: true,
      maxlength: 5000,
    },
    type: {
      type: String,
      enum: ['text', 'image', 'file', 'system', 'spend'],
      default: 'text',
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
      default: null,
    },
    readBy: [
      {
        type: Types.ObjectId,
        ref: 'User',
      },
    ],
    deliveredTo: [
      {
        type: Types.ObjectId,
        ref: 'User',
      },
    ],
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
messageSchema.index({ group: 1, createdAt: -1 });
messageSchema.index({ sender: 1, group: 1 });
messageSchema.index({ group: 1, isDeleted: 1, createdAt: -1 });
messageSchema.index({ deliveredTo: 1 });

/**
 * Soft delete message
 * @returns {Promise<Message>}
 */
messageSchema.methods.softDelete = async function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

/**
 * Mark message as read by user
 * @param {ObjectId} userId
 * @returns {Promise<Message>}
 */
messageSchema.methods.markAsReadBy = async function (userId) {
  if (!this.readBy.includes(userId)) {
    this.readBy.push(userId);
    return this.save();
  }
  return this;
};

/**
 * Check if message was read by user
 * @param {ObjectId} userId
 * @returns {boolean}
 */
messageSchema.methods.isReadBy = function (userId) {
  return this.readBy.some((id) => id.toString() === userId.toString());
};

/**
 * Mark message as delivered to user
 * @param {ObjectId} userId
 * @returns {Promise<Message>}
 */
messageSchema.methods.markAsDeliveredTo = async function (userId) {
  if (!this.deliveredTo.includes(userId)) {
    this.deliveredTo.push(userId);
    return this.save();
  }
  return this;
};

/**
 * Check if message was delivered to user
 * @param {ObjectId} userId
 * @returns {boolean}
 */
messageSchema.methods.isDeliveredTo = function (userId) {
  return this.deliveredTo.some((id) => id.toString() === userId.toString());
};

/**
 * Get delivery status statistics
 * @param {number} totalMembers - Total number of group members
 * @returns {Object}
 */
messageSchema.methods.getDeliveryStatus = function (totalMembers) {
  return {
    total: totalMembers,
    delivered: this.deliveredTo.length,
    read: this.readBy.length,
  };
};

const Message = mongoose.model('Message', messageSchema);

export default Message;
