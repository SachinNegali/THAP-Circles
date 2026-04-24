import { Types } from 'mongoose';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Message, { IMessageMetadata, MessageDocument } from '../models/message.model.js';
import Group, { GroupDocument } from '../models/group.model.js';
import User from '../models/user.model.js';
import MediaUpload from '../models/mediaUpload.model.js';
import * as notificationService from './notification.service.js';
import sseManager from './sse.service.js';
import logger from '../config/logger.js';

const s3Client = new S3Client({
  region: process.env['AWS_REGION'] || 'us-east-1',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
  },
});
const BUCKET_NAME = process.env['AWS_S3_BUCKET'] || 'circles-e2ee-media';
const PRESIGNED_URL_TTL = 7 * 24 * 60 * 60;

/**
 * Regenerate presigned S3 URLs for any completed image in the given messages.
 * Presigned URLs have a max 7-day lifetime, so we re-sign on read to ensure
 * clients always get working links regardless of when the message was sent.
 */
const refreshImageUrls = async (messages: MessageDocument[]): Promise<void> => {
  const imageIds = new Set<string>();
  for (const msg of messages) {
    const images = msg.metadata?.images;
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      if (img?.status === 'completed' && img.imageId) imageIds.add(img.imageId);
    }
  }
  if (imageIds.size === 0) return;

  const uploads = await MediaUpload.find({ imageId: { $in: [...imageIds] } })
    .select('imageId thumbnailS3Key optimizedS3Key')
    .lean();

  const keyMap = new Map<string, { thumb: string | null; opt: string | null }>();
  for (const u of uploads) {
    keyMap.set(u.imageId, {
      thumb: u.thumbnailS3Key ?? null,
      opt: u.optimizedS3Key ?? null,
    });
  }

  const signPromises: Array<Promise<void>> = [];
  for (const msg of messages) {
    const images = msg.metadata?.images;
    if (!Array.isArray(images)) continue;
    for (const img of images) {
      if (img?.status !== 'completed') continue;
      const keys = keyMap.get(img.imageId);
      if (!keys) continue;
      if (keys.thumb) {
        signPromises.push(
          getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: keys.thumb }),
            { expiresIn: PRESIGNED_URL_TTL }
          ).then((url) => {
            img.thumbnailUrl = url;
          })
        );
      }
      if (keys.opt) {
        signPromises.push(
          getSignedUrl(
            s3Client,
            new GetObjectCommand({ Bucket: BUCKET_NAME, Key: keys.opt }),
            { expiresIn: PRESIGNED_URL_TTL }
          ).then((url) => {
            img.optimizedUrl = url;
          })
        );
      }
    }
    msg.markModified('metadata');
  }
  await Promise.all(signPromises);
};

const log = logger.child({ module: 'message' });

type ObjectIdLike = string | Types.ObjectId;

export const sendMessage = async (
  groupId: ObjectIdLike,
  senderId: ObjectIdLike,
  content: string,
  type: MessageDocument['type'] = 'text',
  metadata: IMessageMetadata = {}
): Promise<MessageDocument> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');
  if (!group.isMember(senderId)) {
    throw new Error('You are not a member of this group');
  }
  if (group.settings.onlyAdminsCanMessage && !group.isAdmin(senderId)) {
    throw new Error('Only admins can send messages in this group');
  }

  let finalMetadata: IMessageMetadata = metadata ?? {};
  if (
    type === 'image' &&
    Array.isArray(finalMetadata.imageIds) &&
    finalMetadata.imageIds.length > 0
  ) {
    finalMetadata = {
      ...finalMetadata,
      images: finalMetadata.imageIds.map((imageId) => ({
        imageId,
        status: 'pending',
        thumbnailUrl: null,
        optimizedUrl: null,
        width: null,
        height: null,
      })),
    };
  }

  const message = await Message.create({
    group: groupId,
    sender: senderId,
    content: content ?? '',
    type,
    metadata: finalMetadata,
  });

  group.lastActivity = new Date();
  await group.save();

  const hasPendingImages =
    type === 'image' &&
    Array.isArray(finalMetadata.images) &&
    finalMetadata.images.length > 0;

  if (!hasPendingImages) {
    await broadcastNewMessage(group, message);
  }

  return message;
};

export const broadcastNewMessage = async (
  group: GroupDocument,
  message: MessageDocument
): Promise<void> => {
  const senderId = message.sender;
  const recipientIds = group.members
    .filter((m) => m.user.toString() !== senderId.toString())
    .map((m) => m.user);

  if (recipientIds.length === 0) return;

  sseManager.sendToUsers(recipientIds, 'message.new', message.toJSON());

  const sender = await User.findById(senderId);
  const text = message.content || '';
  const fallback = message.type === 'image' ? 'Sent an image' : '';
  const contentPreview =
    text.length > 50 ? `${text.substring(0, 50)}...` : text || fallback;

  const notifications = (await notificationService.createNotifications(
    recipientIds,
    'message.new',
    `${sender?.fName ?? 'Someone'} in ${group.name ?? 'chat'}`,
    contentPreview,
    {
      groupId: group._id,
      groupName: group.name,
      messageId: message._id,
      senderId: sender?._id,
    }
  )) as Array<{ isDelivered: boolean; user: Types.ObjectId }>;

  const deliveredUserIds = (notifications || [])
    .filter((n) => n.isDelivered)
    .map((n) => n.user);

  if (deliveredUserIds.length > 0) {
    for (const userId of deliveredUserIds) {
      await message.markAsDeliveredTo(userId);
    }

    await notificationService.createNotification(
      senderId,
      'message.delivered',
      'Message delivered',
      `Your message was delivered to ${deliveredUserIds.length} member(s)`,
      {
        messageId: message._id,
        groupId: group._id,
        deliveredCount: deliveredUserIds.length,
      }
    );
  }
};

export const getMessages = async (
  groupId: ObjectIdLike,
  userId: ObjectIdLike,
  page = 1,
  limit = 50
): Promise<{
  messages: MessageDocument[];
  pagination: { page: number; limit: number; total: number; pages: number };
}> => {
  const group = await Group.findOne({ _id: groupId, isActive: true });
  if (!group) throw new Error('Group not found');
  if (!group.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  const skip = (page - 1) * limit;
  const messages = await Message.find({ group: groupId, isDeleted: false })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  await refreshImageUrls(messages);

  const total = await Message.countDocuments({
    group: groupId,
    isDeleted: false,
  });

  return {
    messages: messages.reverse(),
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit),
    },
  };
};

export const deleteMessage = async (
  messageId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<MessageDocument> => {
  const message = await Message.findById(messageId);
  if (!message) throw new Error('Message not found');
  if (message.isDeleted) throw new Error('Message already deleted');

  const group = await Group.findById(message.group);
  const isSender = message.sender.toString() === userId.toString();
  const isAdmin = !!group && group.isAdmin(userId);

  if (!isSender && !isAdmin) {
    throw new Error('You can only delete your own messages or be a group admin');
  }

  await message.softDelete();

  if (group) {
    const recipientIds = group.members.map((m) => m.user);
    const deleter = await User.findById(userId);
    await notificationService.createNotifications(
      recipientIds,
      'message.deleted',
      `Message deleted in ${group.name ?? 'chat'}`,
      `${deleter?.fName ?? 'Someone'} deleted a message`,
      {
        groupId: group._id,
        groupName: group.name,
        messageId: message._id,
      }
    );
  }

  return message;
};

export const updateMessageImage = async (
  messageId: ObjectIdLike,
  imageId: string,
  update: Partial<NonNullable<IMessageMetadata['images']>[number]>
): Promise<{ message: MessageDocument; allComplete: boolean } | null> => {
  const message = await Message.findById(messageId);
  if (!message) {
    log.warn({ messageId }, 'Message not found for image update');
    return null;
  }

  const images = Array.isArray(message.metadata?.images)
    ? [...message.metadata.images]
    : [];
  const idx = images.findIndex((img) => img.imageId === imageId);
  if (idx === -1) {
    log.warn({ imageId, messageId }, 'imageId not found on message');
    return null;
  }

  const wasComplete =
    images.length > 0 && images.every((img) => img.status === 'completed');

  images[idx] = { ...images[idx], ...update } as typeof images[number];

  const allComplete = images.every((img) => img.status === 'completed');

  message.metadata = { ...message.metadata, images };
  message.markModified('metadata');
  await message.save();

  const group = await Group.findById(message.group);
  if (group) {
    const memberIds = group.members.map((m) => m.user);
    sseManager.sendToUsers(memberIds, 'message.image_updated', {
      messageId: message._id.toString(),
      groupId: message.group.toString(),
      imageId,
      image: images[idx],
      allComplete,
    });

    if (allComplete) {
      sseManager.sendToUsers(memberIds, 'message.media_ready', {
        messageId: message._id.toString(),
        groupId: message.group.toString(),
        images,
      });
    }

    if (allComplete && !wasComplete && message.type === 'image') {
      await broadcastNewMessage(group, message);
    }
  }

  return { message, allComplete };
};

export const markAsRead = async (
  messageId: ObjectIdLike,
  userId: ObjectIdLike
): Promise<MessageDocument> => {
  const message = await Message.findById(messageId);
  if (!message) throw new Error('Message not found');

  const messageGroup = await Group.findById(message.group);
  if (!messageGroup || !messageGroup.isMember(userId)) {
    throw new Error('You are not a member of this group');
  }

  await message.markAsReadBy(userId);

  if (message.sender.toString() !== userId.toString()) {
    const reader = await User.findById(userId);
    await notificationService.createNotification(
      message.sender,
      'message.read',
      'Message read',
      `${reader?.fName ?? 'Someone'} read your message in ${messageGroup.name ?? 'chat'}`,
      {
        messageId: message._id,
        groupId: messageGroup._id,
        groupName: messageGroup.name,
        readerId: userId,
      }
    );
  }

  return message;
};
