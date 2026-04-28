import { Types } from 'mongoose';

export interface FirebasePushPayload {
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

export interface FirebaseService {
  initialized: boolean;
  isPushEligible(type: string): boolean;
  sendPushToUser(
    userId: Types.ObjectId | string,
    payload: FirebasePushPayload
  ): Promise<void>;
}

declare const firebaseService: FirebaseService;
export default firebaseService;
