import mongoose, { Types } from 'mongoose';

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: [
        'message.new',
        'message.deleted',
        'message.delivered',
        'message.read',
        'group.invite',
        'group.member_removed',
        'group.member_left',
        'group.role_updated',
        'group.updated',
        'group.deleted',
      ],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    message: {
      type: String,
      required: true,
      maxlength: 500,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    isRead: {
      type: Boolean,
      default: false,
    },
    isDelivered: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for efficient queries
notificationSchema.index({ user: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isRead: 1, createdAt: -1 });
notificationSchema.index({ user: 1, isDelivered: 1, createdAt: -1 });

/**
 * Mark notification as read
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markAsRead = async function () {
  this.isRead = true;
  return this.save();
};

/**
 * Mark notification as delivered
 * @returns {Promise<Notification>}
 */
notificationSchema.methods.markAsDelivered = async function () {
  this.isDelivered = true;
  return this.save();
};

const Notification = mongoose.model('Notification', notificationSchema);

export default Notification;
