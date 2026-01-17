import httpStatus from 'http-status';
import Group from '../models/group.model.js';
import User from '../models/user.model.js';
import Message from '../models/message.model.js';

/**
 * Create a new group
 * @param {string} name
 * @param {string} description
 * @param {ObjectId} creatorId
 * @param {Array<ObjectId>} memberIds
 * @returns {Promise<Group>}
 */
export const createGroup = async (name, description, creatorId, memberIds = []) => {
  // Verify creator exists
  const creator = await User.findById(creatorId);
  if (!creator) {
    throw new Error('Creator not found');
  }

  // Verify all members exist
  if (memberIds.length > 0) {
    const members = await User.find({ _id: { $in: memberIds } });
    if (members.length !== memberIds.length) {
      throw new Error('One or more members not found');
    }
  }

  // Create group with creator as admin
  const group = await Group.create({
    name,
    description,
    createdBy: creatorId,
    members: [
      {
        user: creatorId,
        role: 'admin',
        joinedAt: new Date(),
      },
      ...memberIds.map((id) => ({
        user: id,
        role: 'member',
        joinedAt: new Date(),
      })),
    ],
  });

  // Create system message
  await Message.create({
    group: group._id,
    sender: creatorId,
    content: `${creator.fName} created the group`,
    type: 'system',
  });

  return group.populate('members.user', 'fName lName email');
};

/**
 * Get group by ID
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @returns {Promise<Group>}
 */
export const getGroupById = async (groupId, userId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true }).populate(
    'members.user',
    'fName lName email'
  );

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  return group;
};

/**
 * Get all groups for a user
 * @param {ObjectId} userId
 * @param {number} page
 * @param {number} limit
 * @returns {Promise<Object>}
 */
export const getUserGroups = async (userId, page = 1, limit = 20) => {
  const skip = (page - 1) * limit;

  const groups = await Group.find({
    'members.user': userId,
    isActive: true,
  })
    .sort({ lastActivity: -1 })
    .skip(skip)
    .limit(limit)
    .populate('members.user', 'fName lName email')
    .populate('createdBy', 'fName lName email');

  const total = await Group.countDocuments({
    'members.user': userId,
    isActive: true,
  });

  return {
    groups,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

/**
 * Update group information
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @param {Object} updates
 * @returns {Promise<Group>}
 */
export const updateGroupInfo = async (groupId, userId, updates) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  // Check permissions
  if (group.settings.onlyAdminsCanEditInfo && !group.isAdmin(userId)) {
    throw new Error('Only admins can edit group information');
  }

  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  // Update allowed fields
  const allowedUpdates = ['name', 'description', 'avatar', 'settings'];
  Object.keys(updates).forEach((key) => {
    if (allowedUpdates.includes(key)) {
      if (key === 'settings') {
        group.settings = { ...group.settings, ...updates.settings };
      } else {
        group[key] = updates[key];
      }
    }
  });

  group.lastActivity = new Date();
  await group.save();

  return group.populate('members.user', 'fName lName email');
};

/**
 * Add members to group
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @param {Array<ObjectId>} memberIds
 * @returns {Promise<Group>}
 */
export const addMembers = async (groupId, userId, memberIds) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isAdmin(userId)) {
    throw new Error('Only admins can add members');
  }

  // Verify all members exist
  const members = await User.find({ _id: { $in: memberIds } });
  if (members.length !== memberIds.length) {
    throw new Error('One or more users not found');
  }

  // Add members
  for (const memberId of memberIds) {
    try {
      await group.addMember(memberId);
    } catch (error) {
      // Skip if already a member
      if (error.message !== 'User is already a member') {
        throw error;
      }
    }
  }

  // Create system message
  const adder = await User.findById(userId);
  await Message.create({
    group: group._id,
    sender: userId,
    content: `${adder.fName} added ${members.length} member(s)`,
    type: 'system',
  });

  return group.populate('members.user', 'fName lName email');
};

/**
 * Remove member from group
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @param {ObjectId} targetUserId
 * @returns {Promise<Group>}
 */
export const removeMember = async (groupId, userId, targetUserId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  // Allow self-removal or admin removal
  const isSelfRemoval = userId.toString() === targetUserId.toString();
  if (!isSelfRemoval && !group.isAdmin(userId)) {
    throw new Error('Only admins can remove members');
  }

  // Cannot remove creator
  if (group.isCreator(targetUserId)) {
    throw new Error('Cannot remove group creator');
  }

  await group.removeMember(targetUserId);

  // Create system message
  const remover = await User.findById(userId);
  const removed = await User.findById(targetUserId);
  const message = isSelfRemoval
    ? `${removed.fName} left the group`
    : `${remover.fName} removed ${removed.fName}`;

  await Message.create({
    group: group._id,
    sender: userId,
    content: message,
    type: 'system',
  });

  return group.populate('members.user', 'fName lName email');
};

/**
 * Update member role
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @param {ObjectId} targetUserId
 * @param {string} newRole
 * @returns {Promise<Group>}
 */
export const updateMemberRole = async (groupId, userId, targetUserId, newRole) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isAdmin(userId)) {
    throw new Error('Only admins can change member roles');
  }

  // Cannot change creator role
  if (group.isCreator(targetUserId)) {
    throw new Error('Cannot change creator role');
  }

  await group.updateMemberRole(targetUserId, newRole);

  // Create system message
  const changer = await User.findById(userId);
  const target = await User.findById(targetUserId);
  await Message.create({
    group: group._id,
    sender: userId,
    content: `${changer.fName} made ${target.fName} ${newRole === 'admin' ? 'an admin' : 'a member'}`,
    type: 'system',
  });

  return group.populate('members.user', 'fName lName email');
};

/**
 * Leave group
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @returns {Promise<void>}
 */
export const leaveGroup = async (groupId, userId) => {
  return removeMember(groupId, userId, userId);
};

/**
 * Delete group (soft delete)
 * @param {ObjectId} groupId
 * @param {ObjectId} userId
 * @returns {Promise<Group>}
 */
export const deleteGroup = async (groupId, userId) => {
  const group = await Group.findOne({ _id: groupId, isActive: true });

  if (!group) {
    throw new Error('Group not found');
  }

  if (!group.isCreator(userId)) {
    throw new Error('Only the creator can delete the group');
  }

  group.isActive = false;
  await group.save();

  return group;
};
