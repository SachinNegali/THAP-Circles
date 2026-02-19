import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import crypto from 'crypto';
import Group from '../models/group.model.js';

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
