/**
 * SSE Connection Manager Service
 * Manages Server-Sent Events connections for real-time notifications
 * Singleton pattern for single-server deployment
 */

class SSEConnectionManager {
  constructor() {
    if (SSEConnectionManager.instance) {
      return SSEConnectionManager.instance;
    }

    // Map of userId -> SSE response object
    this.connections = new Map();
    
    // Map of userId -> last activity timestamp
    this.lastActivity = new Map();

    SSEConnectionManager.instance = this;
  }

  /**
   * Add a new SSE connection for a user
   * @param {string} userId - User ID
   * @param {Response} res - Express response object
   */
  addConnection(userId, res) {
    const userIdStr = userId.toString();
    
    // Close existing connection if any
    if (this.connections.has(userIdStr)) {
      const existingRes = this.connections.get(userIdStr);
      try {
        existingRes.end();
      } catch (error) {
        // Connection already closed
      }
    }

    this.connections.set(userIdStr, res);
    this.lastActivity.set(userIdStr, Date.now());

    console.log(`SSE: User ${userIdStr} connected. Total connections: ${this.connections.size}`);
  }

  /**
   * Remove a user's SSE connection
   * @param {string} userId - User ID
   */
  removeConnection(userId) {
    const userIdStr = userId.toString();
    
    if (this.connections.has(userIdStr)) {
      this.connections.delete(userIdStr);
      this.lastActivity.delete(userIdStr);
      console.log(`SSE: User ${userIdStr} disconnected. Total connections: ${this.connections.size}`);
    }
  }

  /**
   * Check if a user is currently online (has active SSE connection)
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  isUserOnline(userId) {
    return this.connections.has(userId.toString());
  }

  /**
   * Send an event to a specific user
   * @param {string} userId - User ID
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {boolean} - True if sent successfully, false otherwise
   */
  sendToUser(userId, event, data) {
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
      console.error(`SSE: Error sending to user ${userIdStr}:`, error.message);
      this.removeConnection(userIdStr);
      return false;
    }
  }

  /**
   * Send an event to multiple users
   * @param {Array<string>} userIds - Array of user IDs
   * @param {string} event - Event name
   * @param {Object} data - Event data
   * @returns {Object} - Object with successful and failed user IDs
   */
  sendToUsers(userIds, event, data) {
    const results = {
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

  /**
   * Send heartbeat to a specific user
   * @param {string} userId - User ID
   */
  sendHeartbeat(userId) {
    this.sendToUser(userId, 'heartbeat', { timestamp: Date.now() });
  }

  /**
   * Get all connected user IDs
   * @returns {Array<string>}
   */
  getConnectedUsers() {
    return Array.from(this.connections.keys());
  }

  /**
   * Get connection count
   * @returns {number}
   */
  getConnectionCount() {
    return this.connections.size;
  }

  /**
   * Clean up stale connections (no activity for more than 5 minutes)
   */
  cleanupStaleConnections() {
    const now = Date.now();
    const staleThreshold = 5 * 60 * 1000; // 5 minutes

    this.lastActivity.forEach((timestamp, userId) => {
      if (now - timestamp > staleThreshold) {
        console.log(`SSE: Cleaning up stale connection for user ${userId}`);
        this.removeConnection(userId);
      }
    });
  }
}

// Create singleton instance
const sseManager = new SSEConnectionManager();

// Cleanup stale connections every 2 minutes
setInterval(() => {
  sseManager.cleanupStaleConnections();
}, 2 * 60 * 1000);

export default sseManager;
