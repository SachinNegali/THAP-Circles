import { Worker } from 'bullmq';
import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import MediaUpload from '../models/mediaUpload.model.js';
import Group from '../models/group.model.js';
import sseManager from '../services/sse.service.js';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'circles-e2ee-media';

const mediaWorker = new Worker(
  'media-processing',
  async (job) => {
    const { imageId, s3Key, chatId, userId, messageId, mimeType } = job.data;

    // 1. Idempotency: skip if already completed
    const upload = await MediaUpload.findOne({ imageId });
    if (!upload) throw new Error(`Upload record not found: ${imageId}`);
    if (upload.status === 'completed') {
      return { skipped: true };
    }

    // 2. Update status to 'processing'
    await MediaUpload.updateOne(
      { imageId },
      { $set: { status: 'processing', updatedAt: new Date() } }
    );

    // 3. Download original image from S3
    let originalBuffer;
    try {
      const obj = await s3Client.send(new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: s3Key,
      }));
      originalBuffer = Buffer.from(await obj.Body.transformToByteArray());
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        await MediaUpload.updateOne({ imageId }, { $set: { status: 'failed', updatedAt: new Date() } });
        return { failed: true, reason: 'file_not_in_s3' };
      }
      throw err; // Transient error — BullMQ retries
    }

    // 4. Process with sharp
    const metadata = await sharp(originalBuffer).metadata();

    // Thumbnail: 300x300 cover crop, webp
    const thumbnailBuffer = await sharp(originalBuffer)
      .resize(300, 300, { fit: 'cover', position: 'centre' })
      .webp({ quality: 80 })
      .toBuffer();

    // Optimized: max 1200px longest side, preserve aspect ratio, strip EXIF, webp
    const optimizedBuffer = await sharp(originalBuffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .rotate()  // auto-rotate based on EXIF before stripping it
      .webp({ quality: 82 })
      .toBuffer();

    // 5. Upload processed versions to S3
    const thumbnailKey = `thumbs/${chatId}/${imageId}.webp`;
    const optimizedKey = `optimized/${chatId}/${imageId}.webp`;

    await Promise.all([
      s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: thumbnailKey,
        Body: thumbnailBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })),
      s3Client.send(new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: optimizedKey,
        Body: optimizedBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })),
    ]);

    // 6. Build URLs and mark completed
    const baseUrl = process.env.API_BASE_URL || '';
    const thumbnailUrl = `${baseUrl}/v1/media/${imageId}?variant=thumbnail`;
    const optimizedUrl = `${baseUrl}/v1/media/${imageId}?variant=optimized`;

    await MediaUpload.updateOne(
      { imageId },
      {
        $set: {
          status: 'completed',
          thumbnailS3Key: thumbnailKey,
          optimizedS3Key: optimizedKey,
          thumbnailUrl,
          optimizedUrl,
          width: metadata.width,
          height: metadata.height,
          updatedAt: new Date(),
        },
      }
    );

    // 7. Check if ALL images for this message are complete
    const pendingCount = await MediaUpload.countDocuments({
      messageId,
      status: { $ne: 'completed' },
    });
    const allComplete = pendingCount === 0;

    // 8. Notify uploader via SSE
    sseManager.sendToUser(userId, 'upload:status', {
      imageId, messageId, chatId, status: 'completed',
      thumbnailUrl, optimizedUrl,
      width: metadata.width, height: metadata.height,
      allImagesComplete: allComplete,
    });

    // 9. If all done, notify other chat participants
    if (allComplete) {
      const group = await Group.findById(chatId);
      if (group) {
        const otherMembers = group.members
          .filter((m) => m.user.toString() !== userId.toString())
          .map((m) => m.user);
        sseManager.sendToUsers(otherMembers, 'message:media-ready', {
          messageId, chatId,
        });
      }
    }

    return { completed: true, imageId };
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 5,
    limiter: { max: 30, duration: 10000 },
  }
);

// On final failure, notify the user
mediaWorker.on('failed', (job, err) => {
  console.error(`[media-worker] Job ${job.id} failed (attempt ${job.attemptsMade}/${job.opts.attempts}):`, err.message);

  if (job.attemptsMade >= job.opts.attempts) {
    const { imageId, messageId, chatId, userId } = job.data;
    MediaUpload.updateOne({ imageId }, { $set: { status: 'failed', updatedAt: new Date() } })
      .then(() => {
        sseManager.sendToUser(userId, 'upload:status', {
          imageId, messageId, chatId, status: 'failed',
        });
      })
      .catch(console.error);
  }
});

export default mediaWorker;
