import type { Response } from 'express';
import type { Types } from 'mongoose';
import logger from '../config/logger.js';

const log = logger.child({ module: 'sse' });

export type UserIdLike = Types.ObjectId | string;

export interface SendToUsersResult {
  successful: string[];
  failed: string[];
}

class SSEConnectionManager {
  private static instance: SSEConnectionManager | undefined;

  private connections: Map<string, Response> = new Map();
  private lastActivity: Map<string, number> = new Map();

  constructor() {
    if (SSEConnectionManager.instance) {
      return SSEConnectionManager.instance;
    }
    SSEConnectionManager.instance = this;
  }

  addConnection(userId: UserIdLike, res: Response): void {
    const userIdStr = userId.toString();

    const existingRes = this.connections.get(userIdStr);
    if (existingRes) {
      try {
        existingRes.end();
      } catch {
        // Connection already closed
      }
    }

    this.connections.set(userIdStr, res);
    this.lastActivity.set(userIdStr, Date.now());

    log.info({ userId: userIdStr, totalConnections: this.connections.size }, 'User connected');
  }

  removeConnection(userId: UserIdLike): void {
    const userIdStr = userId.toString();

    if (this.connections.has(userIdStr)) {
      this.connections.delete(userIdStr);
      this.lastActivity.delete(userIdStr);
      log.info({ userId: userIdStr, totalConnections: this.connections.size }, 'User disconnected');
    }
  }

  isUserOnline(userId: UserIdLike): boolean {
    return this.connections.has(userId.toString());
  }

  sendToUser(userId: UserIdLike, event: string, data: unknown): boolean {
    const userIdStr = userId.toString();
    const res = this.connections.get(userIdStr);
    if (!res) {
      return false;
    }

    try {
      const sseData = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
      res.write(sseData);
      this.lastActivity.set(userIdStr, Date.now());
      return true;
    } catch (error) {
      log.error({ err: error, userId: userIdStr }, 'Error sending event');
      this.removeConnection(userIdStr);
      return false;
    }
  }

  sendToUsers(userIds: UserIdLike[], event: string, data: unknown): SendToUsersResult {
    const results: SendToUsersResult = {
      successful: [],
      failed: [],
    };

    userIds.forEach((userId) => {
      const success = this.sendToUser(userId, event, data);
      if (success) {
        results.successful.push(userId.toString());
      } else {
        results.failed.push(userId.toString());
      }
    });

    return results;
  }

  sendHeartbeat(userId: UserIdLike): void {
    this.sendToUser(userId, 'heartbeat', { timestamp: Date.now() });
  }

  getConnectedUsers(): string[] {
    return Array.from(this.connections.keys());
  }

  getConnectionCount(): number {
    return this.connections.size;
  }

  cleanupStaleConnections(): void {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000;

    this.lastActivity.forEach((timestamp, userId) => {
      if (now - timestamp > staleThreshold) {
        log.debug({ userId }, 'Cleaning up stale connection');
        this.removeConnection(userId);
      }
    });
  }
}

const sseManager = new SSEConnectionManager();

setInterval(() => {
  sseManager.cleanupStaleConnections();
}, 2 * 60 * 1000);

export default sseManager;
