import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import Group from '../models/group.model.js';
import MediaUpload from '../models/mediaUpload.model.js';
import { mediaQueue } from '../queues/media.queue.js';

// S3 Configuration — credentials set via environment variables
const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'circles-e2ee-media';
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB

/**
 * Generate a unique media ID
 * @returns {string}
 */
const generateMediaId = () => {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(8).toString('hex');
  return `enc_${timestamp}_${random}`;
};

/**
 * Upload an encrypted media blob to S3
 * @param {ObjectId} chatId - for access control
 * @param {ObjectId} userId - uploader
 * @param {Object} file - multer file object { buffer, originalname, size, mimetype }
 * @param {Object} metadata - { mimeType, sizeBytes }
 * @returns {Promise<Object>}
 */
export const uploadMedia = async (chatId, userId, file, metadata = {}) => {
  // Verify sender is a participant
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) {
    const error = new Error('Chat not found');
    error.code = 'E2E_004';
    throw error;
  }

  if (!group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  // Check file size
  const fileSize = file.size || file.buffer.length;
  if (fileSize > MAX_FILE_SIZE) {
    const error = new Error('Media file exceeds maximum size (100 MB)');
    error.code = 'E2E_005';
    throw error;
  }

  const mediaId = generateMediaId();
  const s3Key = `media/${chatId}/${mediaId}.bin`;

  // Upload the encrypted blob to S3 as-is — do NOT process the file
  const command = new PutObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
    Body: file.buffer,
    ContentType: 'application/octet-stream', // Always octet-stream — file is encrypted
    Metadata: {
      chatId: chatId.toString(),
      uploaderId: userId.toString(),
      originalMimeType: metadata.mimeType || file.mimetype || 'application/octet-stream',
    },
  });

  await s3Client.send(command);

  const url = `${process.env.API_BASE_URL || ''}/v1/media/${mediaId}`;

  // Store mapping for download access control
  // We encode chatId in the key path for S3, and store a lightweight reference
  // The mediaId → s3Key mapping is deterministic: media/{chatId}/{mediaId}.bin
  // so we just need the chatId to reconstruct the path

  return {
    url,
    mediaId,
    sizeBytes: fileSize,
  };
};

/**
 * Get an encrypted media blob from S3
 * Supports Range header for streaming decryption
 * @param {string} mediaId
 * @param {ObjectId} userId
 * @param {string} chatId - provided as query param for access control
 * @param {string} [range] - HTTP Range header value
 * @returns {Promise<Object>} - { stream, contentLength, contentType, contentRange, statusCode }
 */
export const getMedia = async (mediaId, userId, chatId, range = null) => {
  // Verify user is a participant
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) {
    const error = new Error('Chat not found');
    error.code = 'E2E_004';
    throw error;
  }

  if (!group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  const s3Key = `media/${chatId}/${mediaId}.bin`;

  // Build GetObject params
  const getParams = {
    Bucket: BUCKET_NAME,
    Key: s3Key,
  };

  if (range) {
    getParams.Range = range;
  }

  try {
    const command = new GetObjectCommand(getParams);
    const response = await s3Client.send(command);

    return {
      stream: response.Body,
      contentLength: response.ContentLength,
      contentType: 'application/octet-stream',
      contentRange: response.ContentRange || null,
      statusCode: range ? 206 : 200,
      acceptRanges: 'bytes',
    };
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      throw new Error('Media not found');
    }
    throw err;
  }
};

// ─── Presigned URL Upload Flow ───────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = [
  'image/jpeg', 'image/png', 'image/webp',
  'image/heic', 'image/heif', 'image/gif',
];

const MIME_TO_EXT = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/heic': '.heic',
  'image/heif': '.heif',
  'image/gif': '.gif',
};

/**
 * Initialize an image upload — creates DB record and returns a presigned S3 PUT URL.
 * No file bytes are received here.
 */
export const initUpload = async (chatId, userId, { messageId, imageId, mimeType, sizeBytes }) => {
  // Membership check
  const group = await Group.findOne({ _id: chatId, isActive: true });
  if (!group) {
    const error = new Error('Chat not found');
    error.code = 'E2E_004';
    throw error;
  }
  if (!group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  // Validate mime type
  if (!ALLOWED_IMAGE_TYPES.includes(mimeType)) {
    const error = new Error('Unsupported image type. Allowed: jpeg, png, webp, heic, heif, gif');
    error.status = 400;
    throw error;
  }

  // Size check
  if (sizeBytes > MAX_FILE_SIZE) {
    const error = new Error('Media file exceeds maximum size (100 MB)');
    error.code = 'E2E_005';
    throw error;
  }

  // Idempotency check
  const existing = await MediaUpload.findOne({ imageId });
  if (existing && existing.status === 'completed') {
    return {
      alreadyComplete: true,
      imageId,
      thumbnailUrl: existing.thumbnailUrl,
      optimizedUrl: existing.optimizedUrl,
    };
  }

  // Determine S3 key
  const ext = MIME_TO_EXT[mimeType] || '.jpg';
  const s3Key = `uploads/${chatId}/${imageId}${ext}`;

  // Upsert DB record
  const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour

  await MediaUpload.findOneAndUpdate(
    { imageId },
    {
      $set: {
        messageId, chatId, userId, s3Key, mimeType,
        sizeBytes, status: 'pending', presignedUrlExpiresAt: expiresAt,
        updatedAt: new Date(),
      },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, new: true }
  );

  // Generate presigned PUT URL
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

  return {
    presignedUrl,
    s3Key,
    imageId,
    expiresIn: 3600,
  };
};

/**
 * Confirm upload finished — verifies file in S3, enqueues processing job.
 */
export const completeUpload = async (imageId, userId) => {
  const upload = await MediaUpload.findOne({ imageId });
  if (!upload) {
    const error = new Error('Upload record not found');
    error.status = 404;
    throw error;
  }

  // Ownership check
  if (upload.userId.toString() !== userId.toString()) {
    const error = new Error('You do not own this upload');
    error.status = 403;
    throw error;
  }

  // Idempotency
  if (upload.status === 'completed') {
    return {
      imageId, status: 'completed',
      thumbnailUrl: upload.thumbnailUrl,
      optimizedUrl: upload.optimizedUrl,
    };
  }
  if (upload.status === 'processing') {
    return { imageId, status: 'processing' };
  }

  // Verify S3 object exists
  try {
    await s3Client.send(new HeadObjectCommand({
      Bucket: BUCKET_NAME,
      Key: upload.s3Key,
    }));
  } catch (err) {
    if (err.name === 'NotFound' || err.$metadata?.httpStatusCode === 404) {
      const error = new Error('File not found in storage');
      error.status = 400;
      throw error;
    }
    throw err;
  }

  // Update status to 'uploaded'
  await MediaUpload.updateOne(
    { imageId },
    { $set: { status: 'uploaded', updatedAt: new Date() } }
  );

  // Enqueue BullMQ job
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
      jobId: imageId,       // BullMQ deduplicates by jobId
      attempts: 3,
      backoff: { type: 'exponential', delay: 2000 },
    }
  );

  return { imageId, status: 'processing' };
};

/**
 * Get single upload status.
 */
export const getUploadStatus = async (imageId, userId) => {
  const upload = await MediaUpload.findOne({ imageId, userId });
  if (!upload) {
    const error = new Error('Upload not found');
    error.status = 404;
    throw error;
  }

  return {
    imageId: upload.imageId,
    status: upload.status,
    thumbnailUrl: upload.thumbnailUrl,
    optimizedUrl: upload.optimizedUrl,
    width: upload.width,
    height: upload.height,
  };
};

/**
 * Batch status check — used on app relaunch to sync pending uploads.
 */
export const batchUploadStatus = async (imageIds, userId) => {
  const uploads = await MediaUpload.find({
    imageId: { $in: imageIds },
    userId,
  });

  const result = {};
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

/**
 * Get media with variant support (thumbnail, optimized, original).
 * Returns a presigned GET URL for direct S3 download.
 */
export const getMediaVariant = async (imageId, userId, variant = 'optimized') => {
  const upload = await MediaUpload.findOne({ imageId });
  if (!upload) {
    throw new Error('Media not found');
  }

  // Membership check
  const group = await Group.findOne({ _id: upload.chatId, isActive: true });
  if (!group || !group.isMember(userId)) {
    const error = new Error('Not a participant in this chat');
    error.code = 'E2E_004';
    throw error;
  }

  let s3Key;
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

  if (!s3Key) {
    throw new Error(`Variant '${variant}' not available yet`);
  }

  // Generate a presigned GET URL (valid 1 hour)
  const command = new GetObjectCommand({
    Bucket: BUCKET_NAME,
    Key: s3Key,
  });
  const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

  return {
    presignedUrl,
    contentType,
    imageId,
    variant,
  };
};
