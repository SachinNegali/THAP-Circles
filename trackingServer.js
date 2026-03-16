import uWS from 'uWebSockets.js';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'secret-key-change-me';
const PORT = parseInt(process.env.TRACKING_SERVER_PORT || '9001', 10);

// In-memory routing: Map<groupId, Set<WebSocket>>
const groups = new Map();

// User metadata: WeakMap<WebSocket, {userId, groupId}>
const userMetadata = new WeakMap();

// ─── Long-Polling Infrastructure ───────────────────────────────────────────────
// Per-group polling state:
//   messages:    ring-buffer of recent updates  { userId, data (base64), ts }
//   subscribers: waiting HTTP responses          { res, userId, timer }
const pollingGroups = new Map();

const POLL_TIMEOUT_MS = 30_000;   // hold a long-poll response for up to 30 s
const MAX_BUFFERED_MSGS = 50;     // cap per-group message buffer

/**
 * Get or create the polling state for a group
 */
function getPollingGroup(groupId) {
  if (!pollingGroups.has(groupId)) {
    pollingGroups.set(groupId, { messages: [], subscribers: [] });
  }
  return pollingGroups.get(groupId);
}

/**
 * Push a message into the polling buffer and immediately resolve waiting subscribers
 */
function pushPollingMessage(groupId, userId, base64Data) {
  const pg = getPollingGroup(groupId);
  const entry = { userId, data: base64Data, ts: Date.now() };
  pg.messages.push(entry);

  // Cap the buffer
  if (pg.messages.length > MAX_BUFFERED_MSGS) {
    pg.messages = pg.messages.slice(-MAX_BUFFERED_MSGS);
  }

  // Flush to all waiting subscribers
  for (const sub of pg.subscribers) {
    clearTimeout(sub.timer);
    try {
      sub.res.cork(() => {
        sub.res.writeStatus('200 OK');
        sub.res.writeHeader('Content-Type', 'application/json');
        sub.res.end(JSON.stringify({ messages: [entry] }));
      });
    } catch (_) { /* response already aborted */ }
  }
  pg.subscribers = [];
}

/**
 * Read the full body of a uWS HTTP request (required because uWS streams bodies)
 */
function readBody(res) {
  return new Promise((resolve, reject) => {
    let buffer = Buffer.alloc(0);
    res.onData((chunk, isLast) => {
      buffer = Buffer.concat([buffer, Buffer.from(chunk)]);
      if (isLast) resolve(buffer.toString('utf8'));
    });
    res.onAborted(() => reject(new Error('Request aborted')));
  });
}

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
    // Handle 'Bearer ' prefix if present
    const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;
    const decoded = jwt.verify(cleanToken, JWT_SECRET);
    
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
  
  // ── Interop: also push into the polling buffer so long-poll clients see WS updates ──
  const senderId = senderWs ? (userMetadata.get(senderWs)?.userId || 'ws-unknown') : 'poll';
  const base64 = Buffer.from(message).toString('base64');
  pushPollingMessage(groupId, senderId, base64);
  
  return broadcastCount;
}

// Create uWebSockets.js app
const app = uWS.App({});

app.ws('/*', {
  /* WebSocket upgrade handler - handles authentication */
  upgrade: (res, req, context) => {
    const url = req.getUrl();
    const queryString = req.getQuery();
    
    // 1. Try to get token and groupId from query string
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
    
    // 2. Try to get token from Authorization header if not in query
    let token = query.token || query.Authorization;
    if (!token) {
      token = req.getHeader('authorization');
    }
    
    const groupId = query.groupId || query.group;
    
    // Validate token and groupId
    if (!token || !groupId) {
      console.log(`[AUTH] Missing credentials: token=${!!token}, groupId=${!!groupId}`);
      res.writeStatus('401 Unauthorized');
      res.end('Missing token or groupId');
      return;
    }
    
    // Verify JWT token
    const decoded = verifyToken(token);
    if (!decoded) {
      console.log('[AUTH] Invalid or expired token');
      res.writeStatus('401 Unauthorized');
      res.end('Invalid token');
      return;
    }
    
    // Handle both 'userId' (our API) and 'sub' (JWT standard)
    const userId = decoded.userId || decoded.sub;
    
    console.log(`[AUTH] User ${userId} authenticated for group ${groupId}`);
    
    // Upgrade to WebSocket
    res.upgrade(
      { userId, groupId },
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

// ─── Long-Polling HTTP Endpoints ───────────────────────────────────────────────

/**
 * POST /poll/send — submit a location update via HTTP
 * Headers: Authorization: Bearer <JWT>
 * Body:    { "groupId": "...", "data": "<base64 binary payload>" }
 */
app.post('/poll/send', (res, req) => {
  // uWS requires onAborted before any async work
  let aborted = false;
  res.onAborted(() => { aborted = true; });

  const authHeader = req.getHeader('authorization');

  readBody(res)
    .then((bodyStr) => {
      if (aborted) return;

      // Authenticate
      const decoded = verifyToken(authHeader || '');
      if (!decoded) {
        res.cork(() => {
          res.writeStatus('401 Unauthorized');
          res.end('Invalid token');
        });
        return;
      }

      let body;
      try { body = JSON.parse(bodyStr); } catch (_) {
        res.cork(() => {
          res.writeStatus('400 Bad Request');
          res.end('Invalid JSON');
        });
        return;
      }

      const { groupId, data } = body;
      if (!groupId || !data) {
        res.cork(() => {
          res.writeStatus('400 Bad Request');
          res.end('Missing groupId or data');
        });
        return;
      }

      const userId = decoded.userId || decoded.sub;
      console.log(`[POLL-SEND] User ${userId} → group ${groupId}`);

      // 1. Push to polling buffer (also notifies waiting poll subscribers)
      pushPollingMessage(groupId, userId, data);

      // 2. Broadcast to WebSocket peers in the same group
      const group = groups.get(groupId);
      if (group) {
        const binaryBuf = Buffer.from(data, 'base64');
        for (const ws of group) {
          ws.send(binaryBuf, true, false);
        }
      }

      res.cork(() => {
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ ok: true }));
      });
    })
    .catch(() => {
      if (!aborted) {
        res.cork(() => {
          res.writeStatus('500 Internal Server Error');
          res.end('Server error');
        });
      }
    });
});

/**
 * GET /poll/updates — long-poll for new location data
 * Query:   ?token=<JWT>&groupId=<ID>&since=<timestamp>
 * Holds the response open for up to 30 s, returning immediately when new data arrives.
 */
app.get('/poll/updates', (res, req) => {
  let aborted = false;
  res.onAborted(() => {
    aborted = true;
    // Remove from subscribers if still waiting
    if (subRef) {
      const pg = pollingGroups.get(subRef.groupId);
      if (pg) {
        pg.subscribers = pg.subscribers.filter(s => s !== subRef);
      }
    }
  });

  let subRef = null;

  const queryString = req.getQuery();
  const query = {};
  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }

  const token = query.token || req.getHeader('authorization');
  const groupId = query.groupId;
  const since = parseInt(query.since || '0', 10);

  if (!token || !groupId) {
    res.cork(() => {
      res.writeStatus('400 Bad Request');
      res.end('Missing token or groupId');
    });
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.cork(() => {
      res.writeStatus('401 Unauthorized');
      res.end('Invalid token');
    });
    return;
  }

  const userId = decoded.userId || decoded.sub;
  const pg = getPollingGroup(groupId);

  // Check if there are already buffered messages newer than `since`
  const pending = pg.messages.filter(m => m.ts > since);
  if (pending.length > 0) {
    res.cork(() => {
      res.writeStatus('200 OK');
      res.writeHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ messages: pending }));
    });
    return;
  }

  // No new data — hold the response open
  const timer = setTimeout(() => {
    if (aborted) return;
    // Timeout: return empty array so client re-polls
    pg.subscribers = pg.subscribers.filter(s => s !== subRef);
    try {
      res.cork(() => {
        res.writeStatus('200 OK');
        res.writeHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ messages: [] }));
      });
    } catch (_) { /* already aborted */ }
  }, POLL_TIMEOUT_MS);

  subRef = { res, userId, groupId, timer };
  pg.subscribers.push(subRef);

  console.log(`[POLL-WAIT] User ${userId} waiting on group ${groupId} (${pg.subscribers.length} subscribers)`);
});

/**
 * DELETE /poll/leave — client disconnects from polling
 * Query: ?token=<JWT>&groupId=<ID>
 */
app.del('/poll/leave', (res, req) => {
  const queryString = req.getQuery();
  const query = {};
  if (queryString) {
    for (const pair of queryString.split('&')) {
      const [k, v] = pair.split('=');
      if (k && v) query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }

  const token = query.token || req.getHeader('authorization');
  const groupId = query.groupId;

  if (!token || !groupId) {
    res.writeStatus('400 Bad Request');
    res.end('Missing token or groupId');
    return;
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    res.writeStatus('401 Unauthorized');
    res.end('Invalid token');
    return;
  }

  const userId = decoded.userId || decoded.sub;
  const pg = pollingGroups.get(groupId);
  if (pg) {
    // Clear any waiting subscriber for this user
    for (const sub of pg.subscribers) {
      if (sub.userId === userId) {
        clearTimeout(sub.timer);
        try {
          sub.res.cork(() => {
            sub.res.writeStatus('200 OK');
            sub.res.end('Left');
          });
        } catch (_) { /* already aborted */ }
      }
    }
    pg.subscribers = pg.subscribers.filter(s => s.userId !== userId);

    // Clean up empty polling groups
    if (pg.messages.length === 0 && pg.subscribers.length === 0) {
      pollingGroups.delete(groupId);
    }
  }

  console.log(`[POLL-LEAVE] User ${userId} left group ${groupId}`);
  res.writeStatus('200 OK');
  res.writeHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ ok: true }));
});

// Health check endpoint
app.get('/health', (res, req) => {
  // Count active polling subscribers
  let pollingClients = 0;
  for (const [, pg] of pollingGroups) {
    pollingClients += pg.subscribers.length;
  }

  res.writeStatus('200 OK');
  res.writeHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({
    status: 'ok',
    groups: groups.size,
    pollingGroups: pollingGroups.size,
    pollingClients,
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

  // Close all polling subscribers
  for (const [, pg] of pollingGroups) {
    for (const sub of pg.subscribers) {
      clearTimeout(sub.timer);
      try {
        sub.res.cork(() => {
          sub.res.writeStatus('503 Service Unavailable');
          sub.res.end('Server shutting down');
        });
      } catch (_) { /* already aborted */ }
    }
  }
  pollingGroups.clear();

  console.log('✅ All connections closed');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  process.exit(0);
});
