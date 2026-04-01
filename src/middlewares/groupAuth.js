import mongoose from 'mongoose';
import Group from '../models/group.model.js';
import { sendUnauthorized, sendNotFound, sendBadRequest } from '../utils/errorHandler.js';

/**
 * Verify user is a member of the group
 */
export const verifyGroupMembership = async (req, res, next) => {
  try {
    const groupId = req.params.id || req.params.groupId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return sendBadRequest(res, 'Invalid group ID format');
    }

    const group = await Group.findOne({ _id: groupId, isActive: true });

    if (!group) {
      return sendNotFound(res, 'Group not found');
    }

    if (!group.isMember(userId)) {
      return sendUnauthorized(res, 'You are not a member of this group');
    }

    req.group = group;
    next();
  } catch (error) {
    return sendBadRequest(res, 'Failed to verify group membership');
  }
};

/**
 * Verify user is an admin of the group
 */
export const verifyGroupAdmin = async (req, res, next) => {
  try {
    const groupId = req.params.id || req.params.groupId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return sendBadRequest(res, 'Invalid group ID format');
    }

    const group = await Group.findOne({ _id: groupId, isActive: true });

    if (!group) {
      return sendNotFound(res, 'Group not found');
    }

    if (!group.isAdmin(userId)) {
      return sendUnauthorized(res, 'Only admins can perform this action');
    }

    req.group = group;
    next();
  } catch (error) {
    return sendBadRequest(res, 'Failed to verify group admin status');
  }
};

/**
 * Verify user is the creator of the group
 */
export const verifyGroupCreator = async (req, res, next) => {
  try {
    const groupId = req.params.id || req.params.groupId;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(groupId)) {
      return sendBadRequest(res, 'Invalid group ID format');
    }

    const group = await Group.findOne({ _id: groupId, isActive: true });

    if (!group) {
      return sendNotFound(res, 'Group not found');
    }

    if (!group.isCreator(userId)) {
      return sendUnauthorized(res, 'Only the group creator can perform this action');
    }

    req.group = group;
    next();
  } catch (error) {
    return sendBadRequest(res, 'Failed to verify group creator status');
  }
};
