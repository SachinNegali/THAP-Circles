import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me';
const PORT = parseInt(process.env.TRACKING_SERVER_PORT || '9001', 10);

// In-memory routing: Map<groupId, Set<WebSocket>>
const groups = new Map();

// User metadata: WeakMap<WebSocket, {userId, groupId}>
const userMetadata = new WeakMap();

/**
 * Parse query string from URL
 * @param {string} url - Full URL with query string
 * @returns {Object} Parsed query parameters
 */
function parseQuery(url) {
  const query = {};
  const queryStart = url.indexOf('?');
  if (queryStart === -1) return query;
  
  const queryString = url.substring(queryStart + 1);
  const pairs = queryString.split('&');
  
  for (const pair of pairs) {
    const [key, value] = pair.split('=');
    if (key && value) {
      query[decodeURIComponent(key)] = decodeURIComponent(value);
    }
  }
  
  return query;
}

/**
 * Verify JWT token
 * @param {string} token - JWT token to verify
 * @returns {Object|null} Decoded token payload or null if invalid
 */
function verifyToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // Check if it's an access token
    if (decoded.type !== 'access') {
      return null;
    }
    
    return decoded;
  } catch (error) {
    return null;
  }
}

/**
 * Add user to a group
 * @param {string} groupId - Group identifier
 * @param {WebSocket} ws - WebSocket connection
 */
function addToGroup(groupId, ws) {
  if (!groups.has(groupId)) {
    groups.set(groupId, new Set());
  }
  groups.get(groupId).add(ws);
}

/**
 * Remove user from a group
 * @param {string} groupId - Group identifier
 * @param {WebSocket} ws - WebSocket connection
 */
function removeFromGroup(groupId, ws) {
  const group = groups.get(groupId);
  if (!group) return;
  
  group.delete(ws);
  
  // Clean up empty groups
  if (group.size === 0) {
    groups.delete(groupId);
    console.log(`[CLEANUP] Deleted empty group: ${groupId}`);
  }
}

/**
 * Broadcast binary message to all users in a group except sender
 * Zero-copy forwarding: relay the buffer directly without parsing
 * @param {string} groupId - Group identifier
 * @param {WebSocket} senderWs - Sender's WebSocket connection
 * @param {ArrayBuffer} message - Binary message buffer
 */
function broadcastToGroup(groupId, senderWs, message) {
  const group = groups.get(groupId);
  if (!group) return;
  
  let broadcastCount = 0;
  
  // Zero-copy forwarding: send the same ArrayBuffer to all peers
  // Note: In uWebSockets.js, all WebSockets in the Set are already open
  for (const ws of group) {
    if (ws !== senderWs) {
      ws.send(message, true, false); // isBinary=true, compress=false
      broadcastCount++;
    }
  }
  
  return broadcastCount;
}

// Create uWebSockets.js app
const app = uWS.App({});

app.ws('/*', {
  /* WebSocket upgrade handler - handles authentication */
  upgrade: (res, req, context) => {
    const url = req.getUrl();
    const queryString = req.getQuery(); // This returns the full query string without '?'
    
    // Parse query string manually
    const query = {};
    if (queryString) {
      const pairs = queryString.split('&');
      for (const pair of pairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          query[decodeURIComponent(key)] = decodeURIComponent(value);
        }
      }
    }
    
    const { token, groupId } = query;
    
    // Validate token and groupId
    if (!token || !groupId) {
      console.log('[AUTH] Missing token or groupId');
      res.writeStatus('401 Unauthorized');
      res.end('Missing token or groupId');
      return;
    }
    
    // Verify JWT token
    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('[AUTH] Invalid token');
      res.writeStatus('401 Unauthorized');
      res.end('Invalid token');
      return;
    }
    
    const userId = decoded.sub;
    
    console.log(`[AUTH] User ${userId} authenticated for group ${groupId}`);
    
    // Upgrade to WebSocket
    res.upgrade(
      { userId, groupId }, // userData to pass to ws handler
      req.getHeader('sec-websocket-key'),
      req.getHeader('sec-websocket-protocol'),
      req.getHeader('sec-websocket-extensions'),
      context
    );
  },
  
  /* WebSocket open handler */
  open: (ws) => {
    const { userId, groupId } = ws.getUserData();
    
    // Store metadata
    userMetadata.set(ws, { userId, groupId });
    
    // Add to group
    addToGroup(groupId, ws);
    
    const groupSize = groups.get(groupId)?.size || 0;
    console.log(`[CONNECT] User ${userId} joined group ${groupId} (${groupSize} members)`);
    
    // Send welcome message (optional, can be removed for pure binary protocol)
    const welcomeMsg = JSON.stringify({
      type: 'welcome',
      userId,
      groupId,
      groupSize,
      timestamp: Date.now()
    });
    ws.send(welcomeMsg, false, true); // isBinary=false, compress=true
  },
  
  /* WebSocket message handler - zero-copy binary relay */
  message: (ws, message, isBinary) => {
    const metadata = userMetadata.get(ws);
    if (!metadata) return;
    
    const { userId, groupId } = metadata;
    
    if (isBinary) {
      // Zero-copy forwarding: relay the binary buffer directly
      const broadcastCount = broadcastToGroup(groupId, ws, message);
      
      // Optional: Log for debugging (remove in production for max performance)
      if (message.byteLength === 40) {
        // Expected 40-byte location update
        // Format: [uint32: userId, float64: lat, float64: lng, uint16: speed, uint16: bearing, uint8: status]
        console.log(`[RELAY] User ${userId} → ${broadcastCount} peers in group ${groupId} (${message.byteLength} bytes)`);
      } else {
        console.log(`[RELAY] User ${userId} → ${broadcastCount} peers in group ${groupId} (${message.byteLength} bytes, unexpected size)`);
      }
    } else {
      // Handle text messages (optional, for control messages)
      const text = Buffer.from(message).toString('utf8');
      console.log(`[TEXT] User ${userId} in group ${groupId}: ${text}`);
    }
  },
  
  /* WebSocket close handler */
  close: (ws, code, message) => {
    const metadata = userMetadata.get(ws);
    if (!metadata) return;
    
    const { userId, groupId } = metadata;
    
    // Remove from group
    removeFromGroup(groupId, ws);
    
    const groupSize = groups.get(groupId)?.size || 0;
    console.log(`[DISCONNECT] User ${userId} left group ${groupId} (${groupSize} members remaining)`);
    
    // Clean up metadata
    userMetadata.delete(ws);
  },
  
  /* WebSocket drain handler - backpressure management */
  drain: (ws) => {
    console.log('[DRAIN] WebSocket backpressure drained');
  },
  
  /* Configuration */
  compression: uWS.DISABLED, // Disable compression for minimum latency
  maxPayloadLength: 1024, // 1KB max payload (40 bytes for location + overhead)
  idleTimeout: 120, // 120 seconds idle timeout
  maxBackpressure: 1024 * 1024, // 1MB backpressure limit
});

// Health check endpoint
app.get('/health', (res, req) => {
  res.writeStatus('200 OK');
  res.writeHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'ok',
    groups: groups.size,
    timestamp: Date.now()
  }));
});

// Start server
app.listen(PORT, (token) => {
  if (token) {
    console.log(`\n🚀 Tracking Server listening on port ${PORT}`);
    console.log(`📊 WebSocket endpoint: ws://localhost:${PORT}/?token=YOUR_JWT&groupId=YOUR_GROUP`);
    console.log(`💚 Health check: http://localhost:${PORT}/health\n`);
  } else {
    console.error(`❌ Failed to listen on port ${PORT}`);
    process.exit(1);
  }
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down tracking server...');
  
  // Close all WebSocket connections
  for (const [groupId, group] of groups.entries()) {
    for (const ws of group) {
      ws.close();
    }
  }
  
  groups.clear();
  console.log('✅ All connections closed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});
