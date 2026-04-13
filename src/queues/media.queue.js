import { Queue } from 'bullmq';

const REDIS_CONNECTION = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,
  maxRetriesPerRequest: null,
};

export const mediaQueue = new Queue('media-processing', {
  connection: REDIS_CONNECTION,
  defaultJobOptions: {
    removeOnComplete: { age: 86400 },    // keep completed jobs 24h
    removeOnFail: { age: 604800 },       // keep failed jobs 7 days
  },
});
