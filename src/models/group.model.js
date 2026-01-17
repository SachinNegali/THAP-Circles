import mongoose from 'mongoose';

const groupSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    description: {
      type: String,
      trim: true,
      maxlength: 500,
    },
    avatar: {
      type: String,
      default: null,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true,
        },
        role: {
          type: String,
          enum: ['admin', 'member'],
          default: 'member',
        },
        joinedAt: {
          type: Date,
          default: Date.now,
        },
      },
    ],
    settings: {
      onlyAdminsCanMessage: {
        type: Boolean,
        default: false,
      },
      onlyAdminsCanEditInfo: {
        type: Boolean,
        default: true,
      },
      maxMembers: {
        type: Number,
        default: 256,
        max: 1024,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    lastActivity: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes for performance
groupSchema.index({ 'members.user': 1 });
groupSchema.index({ createdBy: 1, isActive: 1 });
groupSchema.index({ lastActivity: -1 });
groupSchema.index({ isActive: 1, lastActivity: -1 });

/**
 * Check if user is a member of the group
 * @param {ObjectId} userId
 * @returns {boolean}
 */
groupSchema.methods.isMember = function (userId) {
  return this.members.some((member) => member.user.toString() === userId.toString());
};

/**
 * Check if user is an admin of the group
 * @param {ObjectId} userId
 * @returns {boolean}
 */
groupSchema.methods.isAdmin = function (userId) {
  const member = this.members.find((m) => m.user.toString() === userId.toString());
  return member && member.role === 'admin';
};

/**
 * Check if user is the creator of the group
 * @param {ObjectId} userId
 * @returns {boolean}
 */
groupSchema.methods.isCreator = function (userId) {
  return this.createdBy.toString() === userId.toString();
};

/**
 * Add a member to the group
 * @param {ObjectId} userId
 * @param {string} role
 * @returns {Promise<Group>}
 */
groupSchema.methods.addMember = async function (userId, role = 'member') {
  if (this.isMember(userId)) {
    throw new Error('User is already a member');
  }

  if (this.members.length >= this.settings.maxMembers) {
    throw new Error('Group has reached maximum member limit');
  }

  this.members.push({
    user: userId,
    role,
    joinedAt: new Date(),
  });

  this.lastActivity = new Date();
  return this.save();
};

/**
 * Remove a member from the group
 * @param {ObjectId} userId
 * @returns {Promise<Group>}
 */
groupSchema.methods.removeMember = async function (userId) {
  const memberIndex = this.members.findIndex((m) => m.user.toString() === userId.toString());

  if (memberIndex === -1) {
    throw new Error('User is not a member');
  }

  this.members.splice(memberIndex, 1);
  this.lastActivity = new Date();
  return this.save();
};

/**
 * Update member role
 * @param {ObjectId} userId
 * @param {string} newRole
 * @returns {Promise<Group>}
 */
groupSchema.methods.updateMemberRole = async function (userId, newRole) {
  const member = this.members.find((m) => m.user.toString() === userId.toString());

  if (!member) {
    throw new Error('User is not a member');
  }

  member.role = newRole;
  this.lastActivity = new Date();
  return this.save();
};

/**
 * Get member count
 * @returns {number}
 */
groupSchema.methods.getMemberCount = function () {
  return this.members.length;
};

const Group = mongoose.model('Group', groupSchema);

export default Group;
