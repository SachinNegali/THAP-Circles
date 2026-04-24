import crypto from 'crypto';
import { Readable } from 'stream';
import { Types } from 'mongoose';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import Group from '../models/group.model.js';
import MediaUpload, { IMediaUpload } from '../models/mediaUpload.model.js';
import { mediaQueue } from '../queues/media.queue.js';

type ObjectIdLike = string | Types.ObjectId;

const s3Client = new S3Client({
  region: process.env['AWS_REGION'] || 'us-east-1',
  credentials: {
    accessKeyId: process.env['AWS_ACCESS_KEY_ID'] || '',
    secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] || '',
  },
});

const BUCKET_NAME = process.env['AWS_S3_BUCKET'] || 'circles-e2ee-media';
const MAX_FILE_SIZE = 100 * 1024 * 1024;

const generateMediaId = (): string => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `enc_${timestamp}_${random}`;
};

class MediaError extends Error {
  code?: string;
  status?: number;
  constructor(message: string, opts: { code?: string; status?: number } = {}) {
    super(message);
    if (opts.code !== undefined) this.code = opts.code;
    if (opts.status !== undefined) this.status = opts.status;
  }
}

export interface UploadedFile {
  buffer: Buffer;
  size?: number;
  originalname?: string;
  mimetype?: string;
}

export interface UploadMediaMetadata {
  mimeType?: string;
  sizeBytes?: number;
}

export interface UploadMediaResult {
  url: string;
  mediaId: string;
  sizeBytes: number;
}

export const uploadMedia = async (
  chatId: ObjectIdLike,
  userId: ObjectIdLike,
  file: UploadedFile,
  metadata: UploadMediaMetadata = {}
): Promise<UploadMediaResult> => {
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) throw new MediaError('Chat not found', { code: 'E2E_004' });
  if (!group.isMember(userId)) {
    throw new MediaError('Not a participant in this chat', { code: 'E2E_004' });
  }

  const fileSize = file.size ?? file.buffer.length;
  if (fileSize > MAX_FILE_SIZE) {
    throw new MediaError('Media file exceeds maximum size (100 MB)', {
      code: 'E2E_005',
    });
  }

  const mediaId = generateMediaId();
  const s3Key = `media/${chatId}/${mediaId}.bin`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: s3Key,
      Body: file.buffer,
      ContentType: 'application/octet-stream',
      Metadata: {
        chatId: chatId.toString(),
        uploaderId: userId.toString(),
        originalMimeType:
          metadata.mimeType || file.mimetype || 'application/octet-stream',
      },
    })
  );

  const url = `${process.env['API_BASE_URL'] || ''}/v1/media/${mediaId}`;
  return { url, mediaId, sizeBytes: fileSize };
};

export interface GetMediaResult {
  stream: Readable;
  contentLength: number | undefined;
  contentType: string;
  contentRange: string | null;
  statusCode: 200 | 206;
  acceptRanges: string;
}

export const getMedia = async (
  mediaId: string,
  userId: ObjectIdLike,
  chatId: ObjectIdLike,
  range: string | null = null
): Promise<GetMediaResult> => {
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) throw new MediaError('Chat not found', { code: 'E2E_004' });
  if (!group.isMember(userId)) {
    throw new MediaError('Not a participant in this chat', { code: 'E2E_004' });
  }

  const s3Key = `media/${chatId}/${mediaId}.bin`;
  const getParams: { Bucket: string; Key: string; Range?: string } = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
  };
  if (range) getParams.Range = range;

  try {
    const response = await s3Client.send(new GetObjectCommand(getParams));
    return {
      stream: response.Body as Readable,
      contentLength: response.ContentLength,
      contentType: 'application/octet-stream',
      contentRange: response.ContentRange ?? null,
      statusCode: range ? 206 : 200,
      acceptRanges: 'bytes',
    };
  } catch (err) {
    const anyErr = err as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (anyErr.name === 'NoSuchKey' || anyErr.$metadata?.httpStatusCode === 404) {
      throw new Error('Media not found');
    }
    throw err;
  }
};

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'image/gif',
] as const;

type AllowedImageType = (typeof ALLOWED_IMAGE_TYPES)[number];

const MIME_TO_EXT: Record<AllowedImageType, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/gif': '.gif',
};

export interface InitUploadInput {
  messageId: string;
  imageId: string;
  mimeType: string;
  sizeBytes: number;
}

export const initUpload = async (
  chatId: ObjectIdLike,
  userId: ObjectIdLike,
  { messageId, imageId, mimeType, sizeBytes }: InitUploadInput
): Promise<
  | {
      alreadyComplete: true;
      imageId: string;
      thumbnailUrl: string | null;
      optimizedUrl: string | null;
    }
  | {
      presignedUrl: string;
      s3Key: string;
      imageId: string;
      expiresIn: number;
    }
> => {
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) throw new MediaError('Chat not found', { code: 'E2E_004' });
  if (!group.isMember(userId)) {
    throw new MediaError('Not a participant in this chat', { code: 'E2E_004' });
  }

  if (!ALLOWED_IMAGE_TYPES.includes(mimeType as AllowedImageType)) {
    throw new MediaError(
      'Unsupported image type. Allowed: jpeg, png, webp, heic, heif, gif',
      { status: 400 }
    );
  }

  if (sizeBytes > MAX_FILE_SIZE) {
    throw new MediaError('Media file exceeds maximum size (100 MB)', {
      code: 'E2E_005',
    });
  }

  const existing = await MediaUpload.findOne({ imageId });
  if (existing && existing.status === 'completed') {
    return {
      alreadyComplete: true,
      imageId,
      thumbnailUrl: existing.thumbnailUrl,
      optimizedUrl: existing.optimizedUrl,
    };
  }

  const ext = MIME_TO_EXT[mimeType as AllowedImageType] || '.jpg';
  const s3Key = `uploads/${chatId}/${imageId}${ext}`;
  const expiresAt = new Date(Date.now() + 3600 * 1000);

  await MediaUpload.findOneAndUpdate(
    { imageId },
    {
      $set: {
        messageId,
        chatId,
        userId,
        s3Key,
        mimeType,
        sizeBytes,
        status: 'pending',
        presignedUrlExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );

  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
    Metadata: {
      chatId: chatId.toString(),
      uploaderId: userId.toString(),
      imageId,
    },
  });

  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { presignedUrl, s3Key, imageId, expiresIn: 3600 };
};

export const completeUpload = async (
  imageId: string,
  userId: ObjectIdLike
): Promise<{
  imageId: string;
  status: IMediaUpload['status'];
  thumbnailUrl?: string | null;
  optimizedUrl?: string | null;
}> => {
  const upload = await MediaUpload.findOne({ imageId });
  if (!upload) throw new MediaError('Upload record not found', { status: 404 });

  if (upload.userId.toString() !== userId.toString()) {
    throw new MediaError('You do not own this upload', { status: 403 });
  }

  if (upload.status === 'completed') {
    return {
      imageId,
      status: 'completed',
      thumbnailUrl: upload.thumbnailUrl,
      optimizedUrl: upload.optimizedUrl,
    };
  }
  if (upload.status === 'processing') {
    return { imageId, status: 'processing' };
  }

  try {
    await s3Client.send(
      new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: upload.s3Key })
    );
  } catch (err) {
    const anyErr = err as {
      name?: string;
      $metadata?: { httpStatusCode?: number };
    };
    if (anyErr.name === 'NotFound' || anyErr.$metadata?.httpStatusCode === 404) {
      throw new MediaError('File not found in storage', { status: 400 });
    }
    throw err;
  }

  await MediaUpload.updateOne(
    { imageId },
    { $set: { status: 'uploaded', updatedAt: new Date() } }
  );

  await mediaQueue.add(
    'process-image',
    {
      imageId,
      s3Key: upload.s3Key,
      chatId: upload.chatId.toString(),
      userId: upload.userId.toString(),
      messageId: upload.messageId,
      mimeType: upload.mimeType,
    },
    {
      jobId: imageId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  return { imageId, status: 'processing' };
};

export const getUploadStatus = async (
  imageId: string,
  userId: ObjectIdLike
) => {
  const upload = await MediaUpload.findOne({ imageId, userId });
  if (!upload) throw new MediaError('Upload not found', { status: 404 });

  return {
    imageId: upload.imageId,
    status: upload.status,
    thumbnailUrl: upload.thumbnailUrl,
    optimizedUrl: upload.optimizedUrl,
    width: upload.width,
    height: upload.height,
  };
};

export const batchUploadStatus = async (
  imageIds: string[],
  userId: ObjectIdLike
): Promise<Record<string, {
  status: IMediaUpload['status'];
  thumbnailUrl: string | null;
  optimizedUrl: string | null;
  width: number | null;
  height: number | null;
}>> => {
  const uploads = await MediaUpload.find({
    imageId: { $in: imageIds },
    userId,
  });

  const result: Record<string, {
    status: IMediaUpload['status'];
    thumbnailUrl: string | null;
    optimizedUrl: string | null;
    width: number | null;
    height: number | null;
  }> = {};
  for (const upload of uploads) {
    result[upload.imageId] = {
      status: upload.status,
      thumbnailUrl: upload.thumbnailUrl,
      optimizedUrl: upload.optimizedUrl,
      width: upload.width,
      height: upload.height,
    };
  }
  return result;
};

export const getMediaVariant = async (
  imageId: string,
  userId: ObjectIdLike,
  variant: 'thumbnail' | 'optimized' | 'original' = 'optimized'
): Promise<{
  presignedUrl: string;
  contentType: string;
  imageId: string;
  variant: string;
}> => {
  const upload = await MediaUpload.findOne({ imageId });
  if (!upload) throw new Error('Media not found');

  const group = await Group.findOne({ _id: upload.chatId, isActive: true });
  if (!group || !group.isMember(userId)) {
    throw new MediaError('Not a participant in this chat', { code: 'E2E_004' });
  }

  let s3Key: string | null;
  let contentType = 'image/webp';
  switch (variant) {
    case 'thumbnail':
      s3Key = upload.thumbnailS3Key;
      break;
    case 'original':
      s3Key = upload.s3Key;
      contentType = upload.mimeType || 'application/octet-stream';
      break;
    case 'optimized':
    default:
      s3Key = upload.optimizedS3Key;
      break;
  }

  if (!s3Key) throw new Error(`Variant '${variant}' not available yet`);

  const command = new GetObjectCommand({ Bucket: BUCKET_NAME, Key: s3Key });
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
  return { presignedUrl, contentType, imageId, variant };
};
