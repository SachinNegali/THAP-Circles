import { Request, Response } from 'express';
import { Types } from 'mongoose';
import * as groupService from '../services/group.service.js';
import * as messageService from '../services/message.service.js';
import Group from '../models/group.model.js';
import logger from '../config/logger.js';
import type {
  CreateGroupInput,
  UpdateGroupInput,
  AddMembersInput,
  UpdateMemberRoleInput,
  SendMessageInput,
} from '../validations/group.validation.js';

const log = logger.child({ module: 'group' });

const requireUserId = (req: Request, res: Response): Types.ObjectId | null => {
  if (!req.user?._id) {
    res.status(401).json({ message: 'User not authenticated' });
    return null;
  }
  return req.user._id as Types.ObjectId;
};

const respondWithError = (
  res: Response,
  error: unknown,
  fallback: string
): void => {
  const message = error instanceof Error ? error.message : fallback;
  log.error({ err: error }, fallback);

  if (
    message === 'Group not found' ||
    message === 'Creator not found' ||
    message === 'One or more members not found' ||
    message === 'One or more users not found'
  ) {
    res.status(404).json({ message });
    return;
  }

  if (
    message.startsWith('Only ') ||
    message === 'You are not a member of this group' ||
    message === 'Cannot remove group creator' ||
    message === 'Cannot change creator role'
  ) {
    res.status(403).json({ message });
    return;
  }

  if (
    message === 'User is already a member' ||
    message === 'User is not a member' ||
    message === 'Group has reached maximum member limit'
  ) {
    res.status(400).json({ message });
    return;
  }

  res.status(500).json({ message: fallback });
};

/** POST /groups */
export const createGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { name, description, memberIds, type } = req.body as CreateGroupInput;
    const group = await groupService.createGroup(
      name ?? null,
      description ?? null,
      userId,
      memberIds ?? [],
      type ?? 'group'
    );

    res.status(201).json({
      message: `${type === 'dm' ? 'Chat' : 'Group'} created successfully`,
      group,
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to create group');
  }
};

/** POST /groups/dm */
export const createDM = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { recipientId } = req.body as { recipientId: string };
    const group = await groupService.createDM(userId, recipientId);
    res.status(201).json({
      message: 'DM retrieved or created successfully',
      group,
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to create DM');
  }
};

/** GET /groups/:id */
export const getGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const group = await groupService.getGroupById(groupId, userId);
    res.json({ group });
  } catch (error) {
    respondWithError(res, error, 'Failed to get group');
  }
};

/** GET /groups */
export const getUserGroups = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const result = await groupService.getUserGroups(userId, page, limit);
    res.json(result);
  } catch (error) {
    respondWithError(res, error, 'Failed to get groups');
  }
};

/** PATCH /groups/:id */
export const updateGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const group = await groupService.updateGroupInfo(
      groupId,
      userId,
      req.body as UpdateGroupInput
    );
    res.json({ message: 'Group updated successfully', group });
  } catch (error) {
    respondWithError(res, error, 'Failed to update group');
  }
};

/** POST /groups/:id/members */
export const addMembers = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const { memberIds } = req.body as AddMembersInput;
    const group = await groupService.addMembers(groupId, userId, memberIds);
    res.json({ message: 'Members added successfully', group });
  } catch (error) {
    respondWithError(res, error, 'Failed to add members');
  }
};

/** DELETE /groups/:id/members/:userId */
export const removeMember = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const targetUserId = String(req.params['userId']);
    const group = await groupService.removeMember(groupId, userId, targetUserId);
    res.json({ message: 'Member removed successfully', group });
  } catch (error) {
    respondWithError(res, error, 'Failed to remove member');
  }
};

/** PATCH /groups/:id/members/:userId/role */
export const updateMemberRole = async (
  req: Request,
  res: Response
): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const targetUserId = String(req.params['userId']);
    const { role } = req.body as UpdateMemberRoleInput;
    const group = await groupService.updateMemberRole(
      groupId,
      userId,
      targetUserId,
      role
    );
    res.json({ message: 'Member role updated successfully', group });
  } catch (error) {
    respondWithError(res, error, 'Failed to update member role');
  }
};

/** POST /groups/:id/leave */
export const leaveGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    await groupService.leaveGroup(groupId, userId);
    res.json({ message: 'You have left the group' });
  } catch (error) {
    respondWithError(res, error, 'Failed to leave group');
  }
};

/** DELETE /groups/:id */
export const deleteGroup = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    await groupService.deleteGroup(groupId, userId);
    res.json({ message: 'Group deleted successfully' });
  } catch (error) {
    respondWithError(res, error, 'Failed to delete group');
  }
};

/** POST /groups/:id/messages */
export const sendMessage = async (req: Request, res: Response): Promise<void> => {
  const senderId = requireUserId(req, res);
  if (!senderId) return;

  try {
    const groupId = String(req.params['id']);
    const { content, type, metadata } = req.body as SendMessageInput;

    const message = await messageService.sendMessage(
      groupId,
      senderId,
      content ?? '',
      type ?? 'text',
      metadata ?? {}
    );

    res.status(201).json({
      message: 'Message sent successfully',
      data: message,
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to send message');
  }
};

/** POST /groups/dm/:recipientId/messages */
export const sendDMMessage = async (req: Request, res: Response): Promise<void> => {
  const senderId = requireUserId(req, res);
  if (!senderId) return;

  try {
    const recipientId = String(req.params['recipientId']);
    const { content, type, metadata } = req.body as SendMessageInput;

    const group = await groupService.createDM(senderId, recipientId);
    const message = await messageService.sendMessage(
      group._id,
      senderId,
      content ?? '',
      type ?? 'text',
      metadata ?? {}
    );

    res.status(201).json({
      message: 'Message sent successfully',
      group: group._id,
      data: message,
    });
  } catch (error) {
    respondWithError(res, error, 'Failed to send DM message');
  }
};

/** GET /groups/:id/messages */
export const getMessages = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const groupId = String(req.params['id']);
    const { page, limit } = req.query as unknown as { page: number; limit: number };
    const result = await messageService.getMessages(groupId, userId, page, limit);
    res.json(result);
  } catch (error) {
    respondWithError(res, error, 'Failed to get messages');
  }
};

/** GET /groups/dm/:recipientId/messages */
export const getDMMessages = async (req: Request, res: Response): Promise<void> => {
  const userId = requireUserId(req, res);
  if (!userId) return;

  try {
    const recipientId = String(req.params['recipientId']);
    const { page, limit } = req.query as unknown as { page: number; limit: number };

    const group = await Group.findOne({
      type: 'dm',
      'members.user': { $all: [userId, new Types.ObjectId(recipientId)] },
      isActive: true,
    });

    if (!group) {
      res.json({
        messages: [],
        pagination: { page, limit, total: 0, pages: 0 },
      });
      return;
    }

    const result = await messageService.getMessages(group._id, userId, page, limit);
    res.json(result);
  } catch (error) {
    respondWithError(res, error, 'Failed to get DM messages');
  }
};
