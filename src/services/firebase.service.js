import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getDevicesWithPushToken, removePushToken } from './device.service.js';
import logger from '../config/logger.js';

const log = logger.child({ module: 'firebase' });

const PUSH_ELIGIBLE_TYPES = new Set([
  'message.new',
  'group.invite',
  'group.member_removed',
  'group.role_updated',
  'group.deleted',
  'trip.join_request',
  'trip.join_accepted',
]);

class FirebaseService {
  constructor() {
    this.initialized = false;
    this.initialize();
  }

  initialize() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
      log.warn('FIREBASE_SERVICE_ACCOUNT_PATH not set — push notifications disabled');
      return;
    }

    try {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.initialized = true;
      log.info('Initialized successfully — push notifications enabled');
    } catch (error) {
      log.warn({ err: error }, 'Failed to initialize — push notifications disabled');
    }
  }

  isPushEligible(type) {
    return PUSH_ELIGIBLE_TYPES.has(type);
  }

  async sendPushToUser(userId, { type, title, body, data = {} }) {
    if (!this.initialized || !this.isPushEligible(type)) {
      return;
    }

    const devices = await getDevicesWithPushToken(userId);

    if (devices.length === 0) {
      return;
    }

    const sendPromises = devices.map((device) =>
      this.sendToDevice(device.pushToken, device.platform, { title, body, data, type })
    );

    await Promise.allSettled(sendPromises);
  }

  async sendToDevice(pushToken, platform, { title, body, data, type }) {
    const stringifiedData = {};
    for (const [key, value] of Object.entries(data)) {
      stringifiedData[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
    stringifiedData.type = type;

    const message = {
      token: pushToken,
      notification: { title, body },
      data: stringifiedData,
      android: {
        priority: 'high',
        notification: {
          channelId: 'circles_messages',
          sound: 'default',
        },
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            'content-available': 1,
          },
        },
      },
    };

    try {
      await admin.messaging().send(message);
    } catch (error) {
      await this.handleSendError(error, pushToken);
    }
  }

  async handleSendError(error, pushToken) {
    const invalidTokenCodes = [
      'messaging/registration-token-not-registered',
      'messaging/invalid-registration-token',
    ];

    if (invalidTokenCodes.includes(error.code)) {
      log.warn({ tokenPrefix: pushToken.slice(0, 10) }, 'Removing stale push token');
      await removePushToken(pushToken);
    } else {
      log.error({ err: error, code: error.code }, 'Push send error');
    }
  }
}

const firebaseService = new FirebaseService();
export default firebaseService;
