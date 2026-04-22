import Redis from 'ioredis';
import logger from './logger.js';

const log = logger.child({ module: 'redis' });

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: false,
  maxRetriesPerRequest: 3,
  enableOfflineQueue: true,
});

redis.on('error', (err) => log.error({ err }, 'Redis error'));
redis.on('connect', () => log.info('Redis connected'));

export default redis;
