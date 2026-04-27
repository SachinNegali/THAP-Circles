import { Worker } from 'bullmq';
import sharp from 'sharp';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import MediaUpload from '../models/mediaUpload.model.js';
import sseManager from '../services/sse.service.js';
import { updateMessageImage } from '../services/message.service.js';
import logger from '../config/logger.js';

// Presigned URL lifetime — AWS max for SigV4 is 7 days. Clients should
// regenerate (via getMessages or the /media/:id?variant=... endpoint) after this.
const PRESIGNED_URL_TTL = 7 * 24 * 60 * 60;

const log = logger.child({ module: 'media-worker' });

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

    // 6. Build publicly-accessible presigned URLs and mark completed.
    //    Presigned URLs work from any network — no dependency on API_BASE_URL
    //    being externally reachable. They expire after PRESIGNED_URL_TTL,
    //    at which point getMessages re-signs them on read.
    const [thumbnailUrl, optimizedUrl] = await Promise.all([
      getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: thumbnailKey }),
        { expiresIn: PRESIGNED_URL_TTL }
      ),
      getSignedUrl(
        s3Client,
        new GetObjectCommand({ Bucket: BUCKET_NAME, Key: optimizedKey }),
        { expiresIn: PRESIGNED_URL_TTL }
      ),
    ]);

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

    // 7. Update the Message document's metadata.images entry and broadcast
    //    `message.image_updated` (and, when all images are done, `message.media_ready`)
    //    to every group member. This is what makes images actually show in chat.
    const messageUpdate = await updateMessageImage(messageId, imageId, {
      status: 'completed',
      thumbnailUrl,
      optimizedUrl,
      width: metadata.width,
      height: metadata.height,
      mimeType,
      mediaType: 'image',
    });

    const allComplete = messageUpdate?.allComplete ?? false;

    // 8. Notify uploader specifically with their progress event
    sseManager.sendToUser(userId, 'upload:status', {
      imageId, messageId, chatId, status: 'completed',
      thumbnailUrl, optimizedUrl,
      width: metadata.width, height: metadata.height,
      mimeType,
      mediaType: 'image',
      allImagesComplete: allComplete,
    });

    return { completed: true, imageId };
  },
  {
    connection: REDIS_CONNECTION,
    concurrency: 5,
    limiter: { max: 30, duration: 10000 },
  }
);

// On final failure, mark the MediaUpload + Message image entry as failed and
// broadcast the status so the chat UI can show a retry/error state.
mediaWorker.on('failed', async (job, err) => {
  log.error({ jobId: job.id, attempt: job.attemptsMade, maxAttempts: job.opts.attempts, err }, 'Job failed');

  if (job.attemptsMade >= job.opts.attempts) {
    const { imageId, messageId, chatId, userId } = job.data;
    try {
      await MediaUpload.updateOne({ imageId }, { $set: { status: 'failed', updatedAt: new Date() } });
      await updateMessageImage(messageId, imageId, { status: 'failed' });
      sseManager.sendToUser(userId, 'upload:status', {
        imageId, messageId, chatId, status: 'failed',
      });
    } catch (e) {
      log.error({ err: e, imageId: job.data.imageId }, 'Error handling final failure');
    }
  }
});

export default mediaWorker;
