import { Types } from 'mongoose';
import Group, { GroupDocument, GroupType, IGroupSettings, MemberRole } from '../models/group.model.js';
import User from '../models/user.model.js';
import Message from '../models/message.model.js';
import * as notificationService from './notification.service.js';
import * as senderKeyService from './senderKey.service.js';
import sseManager from './sse.service.js';

type ObjectIdLike = string | Types.ObjectId;

export const createGroup = async (
  name: string | null,
  description: string | null,
  creatorId: ObjectIdLike,
  memberIds: ObjectIdLike[] = [],
  type: GroupType = 'group'
): Promise<GroupDocument> => {
  const creator = await User.findById(creatorId);
  if (!creator) throw new Error('Creator not found');

  if (memberIds.length > 0) {
    const members = await User.find({ _id: { $in: memberIds } });
    if (members.length !== memberIds.length) {
      throw new Error('One or more members not found');
    }
  }

  const creatorObjectId = new Types.ObjectId(creatorId.toString());
  const group = await Group.create({
    name: name ?? undefined,
    description: description ?? undefined,
    type,
    createdBy: creatorObjectId,
    members: [
      { user: creatorObjectId, role: 'admin' as MemberRole, joinedAt: new Date() },
      ...memberIds.map((id) => ({
        user: new Types.ObjectId(id.toString()),
        role: 'member' as MemberRole,
        joinedAt: new Date(),
      })),
    ],
  });

  await Message.create({
    group: group._id,
    sender: creatorId,
    content:
      type === 'dm'
        ? `${creator.fName} started a chat`
        : `${creator.fName} created the group`,
    type: 'system',
  });

  if (memberIds.length > 0) {
    await notificationService.createNotifications(
      memberIds,
      'group.invite',
      type === 'dm' ? 'New Message' : 'Group Invitation',
      type === 'dm'
        ? `${creator.fName} started a chat with you`
        : `${creator.fName} added you to ${group.name ?? ''}`,
      {
        groupId: group._id,
        groupName: group.name,
        invitedBy: creatorId,
        inviterName: `${creator.fName} ${creator.lName}`,
      }
    );
  }

  return group.populate('members.user', 'fName lName email');
};

export const createDM = async (
  creatorId: ObjectIdLike,
  recipientId: ObjectIdLike
): Promise<GroupDocument> => {
  const existingDM = await Group.findOne({
    type: 'dm',
    members: {
      $all: [
        { $elemMatch: { user: creatorId } },
        { $elemMatch: { user: recipientId } },
      ],
    },
    isActive: true,
  });

  if (existingDM) {
    return existingDM.populate('members.user', 'fName lName email');
  }

  return createGroup(null, null, creatorId, [recipientId], 'dm');
};

export const getGroupById = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true }).populate(
    'members.user',
    'fName lName'
  );
  if (!group) throw new Error('Group not found');
  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }
  return group;
};

export const getUserGroups = async (
  userId: ObjectIdLike,
  page = 1,
  limit = 20
): Promise<{
  groups: unknown[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> => {
  const skip = (page - 1) * limit;
  const userObjectId = new Types.ObjectId(userId.toString());

  const [result] = (await Group.aggregate([
    { $match: { 'members.user': userObjectId, isActive: true } },
    {
      $facet: {
        total: [{ $count: 'count' }],
        groups: [
          { $sort: { lastActivity: -1 } },
          { $skip: skip },
          { $limit: limit },
          {
            $lookup: {
              from: 'messages',
              let: { groupId: '$_id' },
              pipeline: [
                {
                  $match: {
                    $expr: {
                      $and: [
                        { $eq: ['$group', '$$groupId'] },
                        { $eq: ['$isDeleted', false] },
                      ],
                    },
                  },
                },
                { $sort: { createdAt: -1 } },
                { $limit: 1 },
                {
                  $lookup: {
                    from: 'users',
                    localField: 'sender',
                    foreignField: '_id',
                    as: 'sender',
                    pipeline: [
                      { $project: { fName: 1, lName: 1, email: 1 } },
                    ],
                  },
                },
                { $unwind: { path: '$sender', preserveNullAndEmptyArrays: true } },
              ],
              as: 'lastMessage',
            },
          },
          { $unwind: { path: '$lastMessage', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'users',
              localField: 'createdBy',
              foreignField: '_id',
              as: 'createdBy',
              pipeline: [{ $project: { fName: 1, lName: 1, email: 1 } }],
            },
          },
          { $unwind: { path: '$createdBy', preserveNullAndEmptyArrays: true } },
          {
            $lookup: {
              from: 'users',
              let: { userIds: '$members.user' },
              pipeline: [
                { $match: { $expr: { $in: ['$_id', '$$userIds'] } } },
                { $project: { fName: 1, lName: 1, email: 1 } },
              ],
              as: 'memberUsers',
            },
          },
          {
            $addFields: {
              members: {
                $map: {
                  input: '$members',
                  as: 'member',
                  in: {
                    $mergeObjects: [
                      '$$member',
                      {
                        user: {
                          $arrayElemAt: [
                            {
                              $filter: {
                                input: '$memberUsers',
                                as: 'mu',
                                cond: { $eq: ['$$mu._id', '$$member.user'] },
                              },
                            },
                            0,
                          ],
                        },
                      },
                    ],
                  },
                },
              },
            },
          },
          { $project: { memberUsers: 0 } },
        ],
      },
    },
  ])) as Array<{ groups: unknown[]; total: Array<{ count: number }> }>;

  const groups = result?.groups ?? [];
  const total = result?.total?.[0]?.count ?? 0;

  return {
    groups,
    pagination: { page, limit, total, pages: Math.ceil(total / limit) },
  };
};

export interface UpdateGroupInput {
  name?: string;
  description?: string;
  avatar?: string | null;
  settings?: Partial<IGroupSettings>;
}

export const updateGroupInfo = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  updates: UpdateGroupInput
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');

  if (group.settings.onlyAdminsCanEditInfo && !group.isAdmin(userId)) {
    throw new Error('Only admins can edit group information');
  }
  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  if (updates.name !== undefined) group.name = updates.name;
  if (updates.description !== undefined) group.description = updates.description;
  if (updates.avatar !== undefined) group.avatar = updates.avatar;
  if (updates.settings !== undefined) {
    group.settings = { ...group.settings, ...updates.settings };
  }

  group.lastActivity = new Date();
  await group.save();

  const memberIds = group.members.map((m) => m.user);
  const updater = await User.findById(userId);
  await notificationService.createNotifications(
    memberIds,
    'group.updated',
    'Group Updated',
    `${updater?.fName ?? 'Someone'} updated ${group.name ?? 'the group'}`,
    {
      groupId: group._id,
      groupName: group.name,
      updatedBy: userId,
      updaterName: `${updater?.fName ?? ''} ${updater?.lName ?? ''}`.trim(),
      updates: Object.keys(updates),
    }
  );

  return group.populate('members.user', 'fName lName email');
};

export const addMembers = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  memberIds: ObjectIdLike[]
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');
  if (!group.isAdmin(userId)) throw new Error('Only admins can add members');

  const members = await User.find({ _id: { $in: memberIds } });
  if (members.length !== memberIds.length) {
    throw new Error('One or more users not found');
  }

  for (const memberId of memberIds) {
    try {
      await group.addMember(memberId);
    } catch (error) {
      const msg = error instanceof Error ? error.message : '';
      if (msg !== 'User is already a member') throw error;
    }
  }

  const adder = await User.findById(userId);
  await Message.create({
    group: group._id,
    sender: userId,
    content: `${adder?.fName ?? 'Someone'} added ${members.length} member(s)`,
    type: 'system',
  });

  await notificationService.createNotifications(
    memberIds,
    'group.invite',
    'Group Invitation',
    `${adder?.fName ?? 'Someone'} added you to ${group.name ?? ''}`,
    {
      groupId: group._id,
      groupName: group.name,
      invitedBy: userId,
      inviterName: `${adder?.fName ?? ''} ${adder?.lName ?? ''}`.trim(),
    }
  );

  const addedSet = new Set(memberIds.map((id) => id.toString()));
  const existingMemberIds = group.members
    .filter((m) => !addedSet.has(m.user.toString()))
    .map((m) => m.user);

  for (const newMemberId of memberIds) {
    sseManager.sendToUsers(existingMemberIds, 'group:member_added', {
      chatId: group._id.toString(),
      userId: newMemberId.toString(),
      addedBy: userId.toString(),
    });
  }

  return group.populate('members.user', 'fName lName email');
};

export const removeMember = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  targetUserId: ObjectIdLike
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');

  const isSelfRemoval = userId.toString() === targetUserId.toString();
  if (!isSelfRemoval && !group.isAdmin(userId)) {
    throw new Error('Only admins can remove members');
  }
  if (group.isCreator(targetUserId)) {
    throw new Error('Cannot remove group creator');
  }

  await group.removeMember(targetUserId);

  const remover = await User.findById(userId);
  const removed = await User.findById(targetUserId);
  const systemText = isSelfRemoval
    ? `${removed?.fName ?? 'Someone'} left the group`
    : `${remover?.fName ?? 'Someone'} removed ${removed?.fName ?? 'a member'}`;

  await Message.create({
    group: group._id,
    sender: userId,
    content: systemText,
    type: 'system',
  });

  const notificationType = isSelfRemoval
    ? 'group.member_left'
    : 'group.member_removed';
  const notificationTitle = isSelfRemoval ? 'Left Group' : 'Removed from Group';
  const notificationMessage = isSelfRemoval
    ? `You left ${group.name ?? ''}`
    : `${remover?.fName ?? 'Someone'} removed you from ${group.name ?? ''}`;

  await notificationService.createNotification(
    targetUserId,
    notificationType,
    notificationTitle,
    notificationMessage,
    {
      groupId: group._id,
      groupName: group.name,
      removedBy: userId,
      removerName: `${remover?.fName ?? ''} ${remover?.lName ?? ''}`.trim(),
    }
  );

  if (!isSelfRemoval) {
    const remainingMemberIds = group.members
      .filter((m) => m.user.toString() !== targetUserId.toString())
      .map((m) => m.user);

    if (remainingMemberIds.length > 0) {
      await notificationService.createNotifications(
        remainingMemberIds,
        'group.member_removed',
        'Member Removed',
        `${remover?.fName ?? 'Someone'} removed ${
          removed?.fName ?? 'a member'
        } from ${group.name ?? ''}`,
        {
          groupId: group._id,
          groupName: group.name,
          removedUserId: targetUserId,
          removedUserName: `${removed?.fName ?? ''} ${removed?.lName ?? ''}`.trim(),
        }
      );
    }
  }

  await senderKeyService.deleteSenderKeysForUser(groupId, targetUserId);

  const remainingIds = group.members.map((m) => m.user);
  sseManager.sendToUsers(remainingIds, 'group:member_removed', {
    chatId: group._id.toString(),
    userId: targetUserId.toString(),
    removedBy: userId.toString(),
  });

  return group.populate('members.user', 'fName lName email');
};

export const updateMemberRole = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  targetUserId: ObjectIdLike,
  newRole: MemberRole
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');
  if (!group.isAdmin(userId)) {
    throw new Error('Only admins can change member roles');
  }
  if (group.isCreator(targetUserId)) {
    throw new Error('Cannot change creator role');
  }

  await group.updateMemberRole(targetUserId, newRole);

  const changer = await User.findById(userId);
  const target = await User.findById(targetUserId);
  await Message.create({
    group: group._id,
    sender: userId,
    content: `${changer?.fName ?? 'Someone'} made ${target?.fName ?? 'a member'} ${
      newRole === 'admin' ? 'an admin' : 'a member'
    }`,
    type: 'system',
  });

  await notificationService.createNotification(
    targetUserId,
    'group.role_updated',
    'Role Updated',
    `${changer?.fName ?? 'Someone'} made you ${
      newRole === 'admin' ? 'an admin' : 'a member'
    } in ${group.name ?? ''}`,
    {
      groupId: group._id,
      groupName: group.name,
      newRole,
      changedBy: userId,
      changerName: `${changer?.fName ?? ''} ${changer?.lName ?? ''}`.trim(),
    }
  );

  return group.populate('members.user', 'fName lName email');
};

export const leaveGroup = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<GroupDocument> => {
  return removeMember(groupId, userId, userId);
};

export const deleteGroup = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<GroupDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');
  if (!group.isCreator(userId)) {
    throw new Error('Only the creator can delete the group');
  }

  group.isActive = false;
  await group.save();

  const memberIds = group.members.map((m) => m.user);
  const deleter = await User.findById(userId);
  await notificationService.createNotifications(
    memberIds,
    'group.deleted',
    'Group Deleted',
    `${deleter?.fName ?? 'Someone'} deleted ${group.name ?? ''}`,
    {
      groupId: group._id,
      groupName: group.name,
      deletedBy: userId,
      deleterName: `${deleter?.fName ?? ''} ${deleter?.lName ?? ''}`.trim(),
    }
  );

  return group;
};
