import * as groupService from '../services/group.service.js';
import { handleError, sendBadRequest } from '../utils/errorHandler.js';

/**
 * Create a new group
 * POST /groups
 */
export const createGroup = async (req, res) => {
  try {
    const { name, description, memberIds, type } = req.body;
    const creatorId = req.user._id;

    if (type !== 'dm' && !name) {
      return sendBadRequest(res, 'Group name is required for groups');
    }

    const group = await groupService.createGroup(name, description, creatorId, memberIds || [], type || 'group');

    res.status(201).send({
      message: `${type === 'dm' ? 'Chat' : 'Group'} created successfully`,
      group,
    });
  } catch (error) {
    return handleError(res, error, `Failed to create ${req.body.type === 'dm' ? 'chat' : 'group'}`);
  }
};

/**
 * Create or get a DM
 * POST /groups/dm
 */
export const createDM = async (req, res) => {
  try {
    const { recipientId } = req.body;
    const creatorId = req.user._id;

    if (!recipientId) {
      return sendBadRequest(res, 'recipientId is required');
    }

    const group = await groupService.createDM(creatorId, recipientId);

    res.status(201).send({
      message: 'DM retrieved or created successfully',
      group,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to create DM');
  }
};

/**
 * Get group details
 * GET /groups/:id
 */
export const getGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;

    const group = await groupService.getGroupById(groupId, userId);

    res.send({ group });
  } catch (error) {
    return handleError(res, error, 'Failed to get group');
  }
};

/**
 * Get all groups for current user
 * GET /groups
 */
export const getUserGroups = async (req, res) => {
  try {
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    const result = await groupService.getUserGroups(userId, page, limit);

    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get groups');
  }
};

/**
 * Update group information
 * PATCH /groups/:id
 */
export const updateGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;
    const updates = req.body;

    const group = await groupService.updateGroupInfo(groupId, userId, updates);

    res.send({
      message: 'Group updated successfully',
      group,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to update group');
  }
};

/**
 * Add members to group
 * POST /groups/:id/members
 */
export const addMembers = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;
    const { memberIds } = req.body;

    if (!memberIds || !Array.isArray(memberIds) || memberIds.length === 0) {
      return sendBadRequest(res, 'memberIds array is required');
    }

    const group = await groupService.addMembers(groupId, userId, memberIds);

    res.send({
      message: 'Members added successfully',
      group,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to add members');
  }
};

/**
 * Remove member from group
 * DELETE /groups/:id/members/:userId
 */
export const removeMember = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;
    const targetUserId = req.params.userId;

    const group = await groupService.removeMember(groupId, userId, targetUserId);

    res.send({
      message: 'Member removed successfully',
      group,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to remove member');
  }
};

/**
 * Update member role
 * PATCH /groups/:id/members/:userId/role
 */
export const updateMemberRole = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;
    const targetUserId = req.params.userId;
    const { role } = req.body;

    if (!role || !['admin', 'member'].includes(role)) {
      return sendBadRequest(res, 'Valid role (admin or member) is required');
    }

    const group = await groupService.updateMemberRole(groupId, userId, targetUserId, role);

    res.send({
      message: 'Member role updated successfully',
      group,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to update member role');
  }
};

/**
 * Leave group
 * POST /groups/:id/leave
 */
export const leaveGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;

    await groupService.leaveGroup(groupId, userId);

    res.send({
      message: 'You have left the group',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to leave group');
  }
};

/**
 * Delete group
 * DELETE /groups/:id
 */
export const deleteGroup = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;

    await groupService.deleteGroup(groupId, userId);

    res.send({
      message: 'Group deleted successfully',
    });
  } catch (error) {
    return handleError(res, error, 'Failed to delete group');
  }
};

/**
 * Send message to group
 * POST /groups/:id/messages
 */
export const sendMessage = async (req, res) => {
  try {
    const groupId = req.params.id;
    const senderId = req.user._id;
    const { content, type, metadata } = req.body;

    if (!content) {
      return sendBadRequest(res, 'Message content is required');
    }

    const messageService = await import('../services/message.service.js');
    const message = await messageService.sendMessage(groupId, senderId, content, type, metadata);

    res.status(201).send({
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to send message');
  }
};

/**
 * Send a DM message to a recipient
 * POST /groups/dm/:recipientId/messages
 * Creates or retrieves the DM group, then sends the message under it
 */
export const sendDMMessage = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const senderId = req.user._id;
    const { content, type, metadata } = req.body;

    if (!recipientId) {
      return sendBadRequest(res, 'recipientId is required');
    }

    if (!content) {
      return sendBadRequest(res, 'Message content is required');
    }

    // Create or retrieve the DM group
    const group = await groupService.createDM(senderId, recipientId);

    // Send the message under the DM group
    const messageService = await import('../services/message.service.js');
    const message = await messageService.sendMessage(group._id, senderId, content, type, metadata);

    res.status(201).send({
      message: 'Message sent successfully',
      group: group._id,
      data: message,
    });
  } catch (error) {
    return handleError(res, error, 'Failed to send DM message');
  }
};

/**
 * Get group messages
 * GET /groups/:id/messages
 */
export const getMessages = async (req, res) => {
  try {
    const groupId = req.params.id;
    const userId = req.user._id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    const messageService = await import('../services/message.service.js');
    const result = await messageService.getMessages(groupId, userId, page, limit);

    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get messages');
  }
};

/**
 * Get DM messages by recipient ID
 * GET /groups/dm/:recipientId/messages
 */
export const getDMMessages = async (req, res) => {
  try {
    const { recipientId } = req.params;
    const userId = req.user._id;

    if (!recipientId) {
      return sendBadRequest(res, 'recipientId is required');
    }

    // Look up existing DM group without creating one
    const { default: Group } = await import('../models/group.model.js');
    const group = await Group.findOne({
      type: 'dm',
      'members.user': { $all: [userId, recipientId] },
      isActive: true,
    });

    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;

    // If no DM group exists, return empty messages
    if (!group) {
      return res.send({
        messages: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
    }

    const messageService = await import('../services/message.service.js');
    const result = await messageService.getMessages(group._id, userId, page, limit);
    res.send(result);
  } catch (error) {
    return handleError(res, error, 'Failed to get DM messages');
  }
};
