import admin from 'firebase-admin';
import { readFileSync } from 'fs';
import { getDevicesWithPushToken, removePushToken } from './device.service.js';

const PUSH_ELIGIBLE_TYPES = new Set([
  'message.new',
  'group.invite',
  'group.member_removed',
  'group.role_updated',
  'group.deleted',
]);

class FirebaseService {
  constructor() {
    this.initialized = false;
    this.initialize();
  }

  initialize() {
    const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;

    if (!serviceAccountPath) {
      console.warn('Firebase: FIREBASE_SERVICE_ACCOUNT_PATH not set. Push notifications disabled.');
      return;
    }

    try {
      const serviceAccount = JSON.parse(readFileSync(serviceAccountPath, 'utf8'));
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
      this.initialized = true;
      console.log('Firebase: Initialized successfully. Push notifications enabled.');
    } catch (error) {
      console.warn('Firebase: Failed to initialize —', error.message);
      console.warn('Firebase: Push notifications disabled. App will continue without push.');
    }
  }

  isPushEligible(type) {
    return PUSH_ELIGIBLE_TYPES.has(type);
  }

  async sendPushToUser(userId, { type, title, body, data = {} }) {
    console.log("sendingPushToUser", type, title, body, data)
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
    console.log("this.sendToDevice", {title, body, data, type})
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
      console.warn(`Firebase: Removing stale push token: ${pushToken.slice(0, 10)}...`);
      await removePushToken(pushToken);
    } else {
      console.error('Firebase: Push send error:', error.code || error.message);
    }
  }
}

const firebaseService = new FirebaseService();
export default firebaseService;
