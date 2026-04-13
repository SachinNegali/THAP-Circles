import cron from 'node-cron';
import { S3Client, HeadObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import MediaUpload from '../models/mediaUpload.model.js';
import { mediaQueue } from '../queues/media.queue.js';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET || 'circles-e2ee-media';

// Every 30 minutes: reconcile orphaned uploads
cron.schedule('*/30 * * * *', async () => {
  console.log('[reconcile] Checking for orphaned uploads...');

  const cutoff = new Date(Date.now() - 60 * 60 * 1000); // 1 hour old

  const staleUploads = await MediaUpload.find({
    status: 'pending',
    presignedUrlExpiresAt: { $lt: new Date() },
    createdAt: { $lt: cutoff },
  }).limit(100);

  let reconciled = 0, markedFailed = 0;

  for (const upload of staleUploads) {
    try {
      await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: upload.s3Key }));

      // File exists in S3 — enqueue for processing
      await mediaQueue.add('process-image', {
        imageId: upload.imageId,
        s3Key: upload.s3Key,
        chatId: upload.chatId.toString(),
        userId: upload.userId.toString(),
        messageId: upload.messageId,
        mimeType: upload.mimeType,
      }, {
        jobId: upload.imageId,
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
      });

      await MediaUpload.updateOne(
        { imageId: upload.imageId },
        { $set: { status: 'uploaded', updatedAt: new Date() } }
      );
      reconciled++;
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        await MediaUpload.updateOne(
          { imageId: upload.imageId },
          { $set: { status: 'failed', updatedAt: new Date() } }
        );
        markedFailed++;
      } else {
        console.error(`[reconcile] Error checking ${upload.imageId}:`, err.message);
      }
    }
  }

  console.log(`[reconcile] Reconciled: ${reconciled}, Failed: ${markedFailed}`);
});

// Daily at 3 AM: clean up raw uploads older than 7 days
cron.schedule('0 3 * * *', async () => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const oldCompleted = await MediaUpload.find({
    status: 'completed',
    updatedAt: { $lt: sevenDaysAgo },
    s3Key: { $regex: /^uploads\// },
  }).limit(500);

  for (const upload of oldCompleted) {
    try {
      await s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: upload.s3Key }));
    } catch (err) {
      console.warn(`[cleanup] Failed to delete ${upload.s3Key}:`, err.message);
    }
  }

  console.log(`[cleanup] Deleted ${oldCompleted.length} raw uploads older than 7 days`);
});

console.log('[cron] Upload reconciliation and cleanup crons scheduled');
