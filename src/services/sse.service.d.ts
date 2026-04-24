import { Response } from 'express';
import { Types } from 'mongoose';

type UserIdLike = Types.ObjectId | string;

interface SSEManager {
  addConnection(userId: UserIdLike, res: Response): void;
  removeConnection(userId: UserIdLike): void;
  isUserOnline(userId: UserIdLike): boolean;
  sendToUser(userId: UserIdLike, event: string, data: unknown): boolean;
  sendToUsers(
    userIds: UserIdLike[],
    event: string,
    data: unknown
  ): { successful: string[]; failed: string[] };
  sendHeartbeat(userId: UserIdLike): void;
  getConnectedUsers(): string[];
  getConnectionCount(): number;
  cleanupStaleConnections(): void;
}

declare const sseManager: SSEManager;
export default sseManager;
