import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const JWT_SECRET = process.env.JWT_SECRET || 'secret-key-change-me';
const TRACKING_SERVER_PORT = process.env.TRACKING_SERVER_PORT || '9001';
const WS_URL = `ws://localhost:${TRACKING_SERVER_PORT}`;

// Test configuration
const TEST_USER_ID = 'test-user-123';
const TEST_GROUP_ID = 'test-group-456';
const UPDATE_INTERVAL_MS = 1000; // Send location update every 1 second

// Latency tracking
const latencies = [];
let messagesSent = 0;
let messagesReceived = 0;

/**
 * Generate a JWT token for testing
 * @param {string} userId - User ID
 * @returns {string} JWT token
 */
function generateTestToken(userId) {
  const payload = {
    sub: userId,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour expiry
    type: 'access',
  };
  return jwt.sign(payload, JWT_SECRET);
}

/**
 * Create a 40-byte binary location update message
 * Format: [uint32: userId, float64: lat, float64: lng, uint16: speed, uint16: bearing, uint8: status]
 * 
 * @param {number} userIdNum - User ID as number
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {number} speed - Speed in km/h
 * @param {number} bearing - Bearing in degrees (0-360)
 * @param {number} status - Status code (0-255)
 * @returns {Buffer} 40-byte binary message
 */
function createLocationMessage(userIdNum, lat, lng, speed, bearing, status) {
  const buffer = Buffer.allocUnsafe(40);
  
  // uint32: userId (4 bytes)
  buffer.writeUInt32LE(userIdNum, 0);
  
  // float64: latitude (8 bytes)
  buffer.writeDoubleLE(lat, 4);
  
  // float64: longitude (8 bytes)
  buffer.writeDoubleLE(lng, 12);
  
  // uint16: speed (2 bytes)
  buffer.writeUInt16LE(speed, 20);
  
  // uint16: bearing (2 bytes)
  buffer.writeUInt16LE(bearing, 22);
  
  // uint8: status (1 byte)
  buffer.writeUInt8(status, 24);
  
  // Padding to reach 40 bytes (15 bytes)
  // uint64: timestamp (8 bytes) - for latency measurement
  buffer.writeBigUInt64LE(BigInt(Date.now()), 25);
  
  // Remaining 7 bytes reserved for future use
  buffer.fill(0, 33, 40);
  
  return buffer;
}

/**
 * Parse a 40-byte binary location update message
 * @param {Buffer} buffer - Binary message buffer
 * @returns {Object} Parsed location data
 */
function parseLocationMessage(buffer) {
  if (buffer.length !== 40) {
    throw new Error(`Invalid message length: ${buffer.length}, expected 40 bytes`);
  }
  
  return {
    userId: buffer.readUInt32LE(0),
    lat: buffer.readDoubleLE(4),
    lng: buffer.readDoubleLE(12),
    speed: buffer.readUInt16LE(20),
    bearing: buffer.readUInt16LE(22),
    status: buffer.readUInt8(24),
    timestamp: Number(buffer.readBigUInt64LE(25)),
  };
}

/**
 * Simulate realistic location updates (moving along a path)
 */
class LocationSimulator {
  constructor(startLat, startLng) {
    this.lat = startLat;
    this.lng = startLng;
    this.bearing = Math.floor(Math.random() * 360);
    this.speed = 60; // 60 km/h
  }
  
  getNextLocation() {
    // Simulate movement: move ~16.67 meters per second at 60 km/h
    // 1 degree latitude ≈ 111 km, so 0.00015 degrees ≈ 16.67 meters
    const deltaLat = 0.00015 * Math.cos((this.bearing * Math.PI) / 180);
    const deltaLng = 0.00015 * Math.sin((this.bearing * Math.PI) / 180);
    
    this.lat += deltaLat;
    this.lng += deltaLng;
    
    // Randomly adjust bearing slightly (keep within 0-360 range)
    this.bearing = (this.bearing + (Math.random() * 20 - 10) + 360) % 360;
    
    // Randomly adjust speed
    this.speed = Math.max(30, Math.min(100, this.speed + (Math.random() * 10 - 5)));
    
    return {
      lat: this.lat,
      lng: this.lng,
      speed: Math.floor(this.speed),
      bearing: Math.floor(this.bearing),
      status: 1, // 1 = active/moving
    };
  }
}

/**
 * Create and connect a mock client
 * @param {string} userId - User ID
 * @param {string} groupId - Group ID
 * @param {number} clientNumber - Client number for display
 */
function createMockClient(userId, groupId, clientNumber) {
  const token = generateTestToken(userId);
  const wsUrl = `${WS_URL}/?token=${encodeURIComponent(token)}&groupId=${encodeURIComponent(groupId)}`;
  
  console.log(`\n[Client ${clientNumber}] Connecting to ${WS_URL}`);
  console.log(`[Client ${clientNumber}] User ID: ${userId}`);
  console.log(`[Client ${clientNumber}] Group ID: ${groupId}`);
  
  const ws = new WebSocket(wsUrl);
  const simulator = new LocationSimulator(12.9716 + clientNumber * 0.001, 77.5946 + clientNumber * 0.001); // Bangalore coordinates
  let updateInterval;
  
  ws.on('open', () => {
    console.log(`\n✅ [Client ${clientNumber}] Connected successfully!`);
    
    // Start sending location updates
    updateInterval = setInterval(() => {
      const location = simulator.getNextLocation();
      const userIdNum = parseInt(userId.replace(/\D/g, '')) || clientNumber;
      const message = createLocationMessage(
        userIdNum,
        location.lat,
        location.lng,
        location.speed,
        location.bearing,
        location.status
      );
      
      ws.send(message);
      messagesSent++;
      
      console.log(`[Client ${clientNumber}] 📍 Sent location: lat=${location.lat.toFixed(6)}, lng=${location.lng.toFixed(6)}, speed=${location.speed}km/h, bearing=${location.bearing}°`);
    }, UPDATE_INTERVAL_MS);
  });
  
  ws.on('message', (data) => {
    messagesReceived++;
    
    if (data instanceof Buffer && data.length === 40) {
      // Binary location update from peer
      const location = parseLocationMessage(data);
      const latency = Date.now() - location.timestamp;
      latencies.push(latency);
      
      console.log(`[Client ${clientNumber}] 📥 Received location from user ${location.userId}: lat=${location.lat.toFixed(6)}, lng=${location.lng.toFixed(6)}, speed=${location.speed}km/h (latency: ${latency}ms)`);
    } else {
      // Text message (e.g., welcome message)
      try {
        const msg = JSON.parse(data.toString());
        console.log(`[Client ${clientNumber}] 📨 Received message:`, msg);
      } catch (e) {
        console.log(`[Client ${clientNumber}] 📨 Received text:`, data.toString());
      }
    }
  });
  
  ws.on('error', (error) => {
    console.error(`[Client ${clientNumber}] ❌ Error:`, error.message);
  });
  
  ws.on('close', (code, reason) => {
    console.log(`[Client ${clientNumber}] 🔌 Disconnected: code=${code}, reason=${reason}`);
    if (updateInterval) {
      clearInterval(updateInterval);
    }
  });
  
  return ws;
}

/**
 * Print statistics
 */
function printStats() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 PERFORMANCE STATISTICS');
  console.log('='.repeat(60));
  console.log(`Messages sent: ${messagesSent}`);
  console.log(`Messages received: ${messagesReceived}`);
  
  if (latencies.length > 0) {
    const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
    const minLatency = Math.min(...latencies);
    const maxLatency = Math.max(...latencies);
    const p95Latency = latencies.sort((a, b) => a - b)[Math.floor(latencies.length * 0.95)];
    
    console.log(`\nLatency Statistics:`);
    console.log(`  Average: ${avgLatency.toFixed(2)}ms`);
    console.log(`  Min: ${minLatency}ms`);
    console.log(`  Max: ${maxLatency}ms`);
    console.log(`  P95: ${p95Latency}ms`);
    
    if (avgLatency < 200) {
      console.log(`\n✅ SUCCESS: Average latency is under 200ms!`);
    } else {
      console.log(`\n⚠️  WARNING: Average latency exceeds 200ms target`);
    }
  }
  console.log('='.repeat(60) + '\n');
}

// Main execution
console.log('🚀 Starting Mock Client Test');
console.log('='.repeat(60));

// Create multiple clients in the same group to test broadcasting
const NUM_CLIENTS = 3; // Simulate 3 users in the same group
const clients = [];

for (let i = 1; i <= NUM_CLIENTS; i++) {
  const userId = `test-user-${i}`;
  const client = createMockClient(userId, TEST_GROUP_ID, i);
  clients.push(client);
}

// Print stats every 10 seconds
const statsInterval = setInterval(printStats, 10000);

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down mock clients...');
  
  clearInterval(statsInterval);
  
  // Close all clients
  clients.forEach((ws, i) => {
    console.log(`[Client ${i + 1}] Closing connection...`);
    ws.close();
  });
  
  // Print final stats
  setTimeout(() => {
    printStats();
    process.exit(0);
  }, 1000);
});

console.log('\n💡 Press Ctrl+C to stop and view final statistics\n');
