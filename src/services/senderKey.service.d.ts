import { Types } from 'mongoose';

export function distributeSenderKeys(
  groupId: Types.ObjectId | string,
  senderId: Types.ObjectId | string,
  senderDeviceId: string,
  distributions: Array<{
    recipientId: Types.ObjectId | string;
    recipientDeviceId: string;
    encryptedSenderKey: string;
    version?: number;
  }>
): Promise<unknown>;

export function getSenderKeys(
  groupId: Types.ObjectId | string,
  recipientId: Types.ObjectId | string,
  recipientDeviceId: string
): Promise<unknown>;

export function deleteSenderKeysForUser(
  groupId: Types.ObjectId | string,
  userId: Types.ObjectId | string
): Promise<unknown>;

export function deleteAllSenderKeysForGroup(
  groupId: Types.ObjectId | string
): Promise<unknown>;
