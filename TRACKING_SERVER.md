# Real-Time Location Relay Server

A high-performance WebSocket server built with **uWebSockets.js** for relaying real-time location updates between motorcycle group members with **sub-200ms latency**.

## 🚀 Features

- **Ultra-Low Latency**: Sub-200ms message relay using binary protocol and zero-copy forwarding
- **JWT Authentication**: Secure WebSocket connections using shared JWT secret
- **Binary Protocol**: 40-byte location messages to minimize GC pressure
- **Zero-Copy Forwarding**: Direct buffer relay without JSON parsing
- **In-Memory Routing**: Map-based group management with no database on hot path
- **Auto Cleanup**: Automatic removal of disconnected users and empty groups
- **Scalable**: Handles thousands of concurrent groups efficiently

## 📋 Requirements

- Node.js 16+ with ES modules support
- uWebSockets.js
- jsonwebtoken
- dotenv

## 🔧 Installation

Dependencies are already installed. If you need to reinstall:

```bash
npm install
```

## ⚙️ Configuration

Add the following to your `.env` file (already configured):

```env
JWT_SECRET=your-super-secret-jwt-key-change-in-production-please
TRACKING_SERVER_PORT=9001
```

> **⚠️ IMPORTANT**: Change the `JWT_SECRET` in production to a strong, randomly generated secret.

## 🏃 Running the Server

### Start the Tracking Server

```bash
npm run tracking
```

Expected output:
```
🚀 Tracking Server listening on port 9001
📊 WebSocket endpoint: ws://localhost:9001/?token=YOUR_JWT&groupId=YOUR_GROUP
💚 Health check: http://localhost:9001/health
```

### Run the Mock Client (for testing)

In a separate terminal:

```bash
node mockClient.js
```

This will:
- Connect 3 mock clients to the same group
- Send location updates every second
- Measure and display latency statistics
- Simulate realistic motorcycle movement

Press `Ctrl+C` to stop and view final statistics.

## 🔌 WebSocket Connection

### Connection URL Format

```
ws://localhost:9001/?token=<JWT_TOKEN>&groupId=<GROUP_ID>
```

**Query Parameters:**
- `token`: Valid JWT access token (type: 'access')
- `groupId`: Group identifier (string)

### Authentication

The server validates JWT tokens during the WebSocket upgrade handshake. Tokens must:
- Be signed with the same `JWT_SECRET` as your Express app
- Have `type: 'access'` in the payload
- Contain `sub` field with the user ID
- Not be expired

### Example Connection (JavaScript)

```javascript
import WebSocket from 'ws';

const token = 'your-jwt-token-here';
const groupId = 'group-123';
const ws = new WebSocket(`ws://localhost:9001/?token=${token}&groupId=${groupId}`);

ws.on('open', () => {
  console.log('Connected!');
});

ws.on('message', (data) => {
  // Handle binary location updates
  if (data instanceof Buffer && data.length === 40) {
    const location = parseLocationMessage(data);
    console.log('Received location:', location);
  }
});
```

## 📦 Binary Message Protocol

### Location Update Format (40 bytes)

| Offset | Type    | Size | Description                    |
|--------|---------|------|--------------------------------|
| 0      | uint32  | 4    | User ID (numeric)              |
| 4      | float64 | 8    | Latitude                       |
| 12     | float64 | 8    | Longitude                      |
| 20     | uint16  | 2    | Speed (km/h)                   |
| 22     | uint16  | 2    | Bearing (degrees, 0-360)       |
| 24     | uint8   | 1    | Status code (0-255)            |
| 25     | uint64  | 8    | Timestamp (milliseconds)       |
| 33     | -       | 7    | Reserved for future use        |

### Creating a Binary Message (JavaScript)

```javascript
function createLocationMessage(userId, lat, lng, speed, bearing, status) {
  const buffer = Buffer.allocUnsafe(40);
  
  buffer.writeUInt32LE(userId, 0);        // User ID
  buffer.writeDoubleLE(lat, 4);           // Latitude
  buffer.writeDoubleLE(lng, 12);          // Longitude
  buffer.writeUInt16LE(speed, 20);        // Speed
  buffer.writeUInt16LE(bearing, 22);      // Bearing
  buffer.writeUInt8(status, 24);          // Status
  buffer.writeBigUInt64LE(BigInt(Date.now()), 25); // Timestamp
  buffer.fill(0, 33, 40);                 // Reserved
  
  return buffer;
}

// Send location update
const message = createLocationMessage(123, 12.9716, 77.5946, 60, 180, 1);
ws.send(message);
```

### Parsing a Binary Message (JavaScript)

```javascript
function parseLocationMessage(buffer) {
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
```

## 🏗️ Architecture

### In-Memory Data Structures

```javascript
// Group routing: Map<groupId, Set<WebSocket>>
const groups = new Map();

// User metadata: WeakMap<WebSocket, {userId, groupId}>
const userMetadata = new WeakMap();
```

### Message Flow

1. **Client A** sends binary location update
2. **Server** receives message (zero-copy)
3. **Server** broadcasts to all other clients in the same group
4. **Clients B, C, D...** receive the update instantly

**No JSON parsing, no database queries, no serialization overhead.**

## 🔍 Health Check

Check server status:

```bash
curl http://localhost:9001/health
```

Response:
```json
{
  "status": "ok",
  "groups": 5,
  "timestamp": 1738664926000
}
```

## 📊 Performance Benchmarks

With the mock client, you should see:
- **Average latency**: < 50ms (local network)
- **P95 latency**: < 100ms
- **Message throughput**: 1000+ messages/second per group
- **Memory usage**: Minimal (no GC pressure from binary protocol)

## 🔐 Security Considerations

1. **Use WSS in Production**: Deploy with SSL/TLS for encrypted connections
2. **Strong JWT Secret**: Use a cryptographically secure random string
3. **Token Expiry**: Implement short-lived access tokens with refresh mechanism
4. **Rate Limiting**: Add rate limiting for production deployments
5. **Input Validation**: Validate groupId format and length

## 🚀 Production Deployment

### Using PM2

```bash
npm install -g pm2
pm2 start trackingServer.js --name tracking-server
pm2 save
pm2 startup
```

### Using Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 9001
CMD ["node", "trackingServer.js"]
```

### Environment Variables for Production

```env
NODE_ENV=production
JWT_SECRET=<strong-random-secret>
TRACKING_SERVER_PORT=9001
```

## 🧪 Testing

### Test Authentication

```bash
# Valid token - should connect
node mockClient.js

# Invalid token - should reject (modify token in mockClient.js)
```

### Test Multiple Groups

Run multiple instances with different `TEST_GROUP_ID` values in `mockClient.js`.

### Load Testing

Use tools like `artillery` or `k6` to simulate thousands of concurrent connections.

## 🐛 Troubleshooting

### Connection Refused
- Ensure the tracking server is running (`npm run tracking`)
- Check the port is not in use: `lsof -i :9001`

### Authentication Failed
- Verify `JWT_SECRET` matches in both Express app and tracking server
- Check token is not expired
- Ensure token has `type: 'access'` in payload

### High Latency
- Check network conditions
- Monitor server CPU/memory usage
- Verify binary protocol is being used (not JSON)

## 📝 Integration with Express App

The tracking server shares the same `JWT_SECRET` from your `.env` file. Your Express app generates JWT tokens, and clients use those tokens to connect to the tracking server.

**Express App** (port 8082):
- User authentication
- Token generation
- REST API

**Tracking Server** (port 9001):
- Real-time location relay
- WebSocket connections
- Binary message forwarding

Both servers can run simultaneously on different ports.

## 📚 Additional Resources

- [uWebSockets.js Documentation](https://github.com/uNetworking/uWebSockets.js)
- [WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455)
- [JWT Best Practices](https://tools.ietf.org/html/rfc8725)

## 📄 License

Same as parent project.
