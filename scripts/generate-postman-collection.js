import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BASE_URL = '{{baseUrl}}'; // Postman variable
const ROUTES_DIR = path.join(__dirname, '../src/routes/v1');
const OUTPUT_FILE = path.join(__dirname, '../postman_collection.json');

// Postman collection template
const collection = {
  info: {
    name: 'Circles API',
    description: 'Auto-generated Postman collection for Circles API',
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json'
  },
  variable: [
    {
      key: 'baseUrl',
      value: 'http://localhost:3000/v1',
      type: 'string'
    },
    {
      key: 'accessToken',
      value: '',
      type: 'string'
    }
  ],
  auth: {
    type: 'bearer',
    bearer: [
      {
        key: 'token',
        value: '{{accessToken}}',
        type: 'string'
      }
    ]
  },
  item: []
};

// Helper to create request object
function createRequest(method, url, name, requiresAuth = true, body = null) {
  const request = {
    name,
    request: {
      method: method.toUpperCase(),
      header: [],
      url: {
        raw: `${BASE_URL}${url}`,
        host: ['{{baseUrl}}'],
        path: url.split('/').filter(p => p)
      }
    },
    response: []
  };

  // Add auth if required
  if (requiresAuth) {
    request.request.auth = {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{accessToken}}',
          type: 'string'
        }
      ]
    };
  } else {
    request.request.auth = {
      type: 'noauth'
    };
  }

  // Add body if provided
  if (body) {
    request.request.header.push({
      key: 'Content-Type',
      value: 'application/json'
    });
    request.request.body = {
      mode: 'raw',
      raw: JSON.stringify(body, null, 2),
      options: {
        raw: {
          language: 'json'
        }
      }
    };
  }

  return request;
}

// Parse route files and generate requests
const routeConfigs = {
  'auth.routes.js': {
    name: 'Authentication',
    prefix: '/auth',
    routes: [
      {
        method: 'POST',
        path: '/social-login',
        name: 'Social Login',
        requiresAuth: false,
        body: {
          provider: 'google',
          token: 'your-oauth-token-here',
          email: 'user@example.com',
          name: 'John Doe',
          profilePicture: 'https://example.com/photo.jpg'
        }
      },
      {
        method: 'POST',
        path: '/refresh-tokens',
        name: 'Refresh Tokens',
        requiresAuth: false,
        body: {
          refreshToken: 'your-refresh-token-here'
        }
      }
    ]
  },
  'group.route.js': {
    name: 'Groups',
    prefix: '/group',
    routes: [
      {
        method: 'POST',
        path: '/',
        name: 'Create Group',
        body: {
          name: 'My Travel Group',
          description: 'A group for travel enthusiasts',
          members: []
        }
      },
      {
        method: 'GET',
        path: '/',
        name: 'Get User Groups'
      },
      {
        method: 'GET',
        path: '/:id',
        name: 'Get Group by ID'
      },
      {
        method: 'PATCH',
        path: '/:id',
        name: 'Update Group',
        body: {
          name: 'Updated Group Name',
          description: 'Updated description'
        }
      },
      {
        method: 'DELETE',
        path: '/:id',
        name: 'Delete Group'
      },
      {
        method: 'POST',
        path: '/:id/members',
        name: 'Add Members',
        body: {
          userIds: ['userId1', 'userId2']
        }
      },
      {
        method: 'DELETE',
        path: '/:id/members/:userId',
        name: 'Remove Member'
      },
      {
        method: 'PATCH',
        path: '/:id/members/:userId/role',
        name: 'Update Member Role',
        body: {
          role: 'admin'
        }
      },
      {
        method: 'POST',
        path: '/:id/leave',
        name: 'Leave Group'
      },
      {
        method: 'POST',
        path: '/:id/messages',
        name: 'Send Message',
        body: {
          content: 'Hello everyone!'
        }
      },
      {
        method: 'GET',
        path: '/:id/messages',
        name: 'Get Messages'
      }
    ]
  },
  'message.route.js': {
    name: 'Messages',
    prefix: '/message',
    routes: [
      {
        method: 'DELETE',
        path: '/:id',
        name: 'Delete Message'
      },
      {
        method: 'POST',
        path: '/:id/read',
        name: 'Mark Message as Read'
      }
    ]
  },
  'trip.route.js': {
    name: 'Trips',
    prefix: '/trip',
    routes: [
      {
        method: 'POST',
        path: '/',
        name: 'Create Trip',
        body: {
          title: 'Weekend Getaway',
          description: 'A fun weekend trip',
          startLocation: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
            name: 'Bangalore',
            locationType: 'city'
          },
          endLocation: {
            type: 'Point',
            coordinates: [77.2090, 28.6139],
            name: 'Delhi',
            locationType: 'city'
          },
          stops: [],
          startDate: '2026-03-01T00:00:00.000Z',
          endDate: '2026-03-03T00:00:00.000Z'
        }
      },
      {
        method: 'GET',
        path: '/',
        name: 'Get User Trips'
      },
      {
        method: 'GET',
        path: '/:id',
        name: 'Get Trip by ID'
      },
      {
        method: 'PATCH',
        path: '/:id',
        name: 'Update Trip',
        body: {
          title: 'Updated Trip Title',
          description: 'Updated description'
        }
      },
      {
        method: 'DELETE',
        path: '/:id',
        name: 'Delete Trip'
      },
      {
        method: 'POST',
        path: '/:id/participants',
        name: 'Add Participants',
        body: {
          userIds: ['userId1', 'userId2']
        }
      },
      {
        method: 'DELETE',
        path: '/:id/participants/:userId',
        name: 'Remove Participant'
      }
    ]
  },
  'event.route.js': {
    name: 'Events',
    prefix: '/event',
    routes: [
      {
        method: 'POST',
        path: '/',
        name: 'Create Event',
        body: {
          title: 'City Meetup',
          description: 'A meetup for travelers',
          startLocation: {
            type: 'Point',
            coordinates: [77.5946, 12.9716],
            name: 'Bangalore',
            locationType: 'city'
          },
          endLocation: {
            type: 'Point',
            coordinates: [77.6033, 12.9698],
            name: 'Indiranagar',
            locationType: 'area'
          },
          startDate: '2026-03-15T10:00:00.000Z',
          endDate: '2026-03-15T18:00:00.000Z',
          maxParticipants: 20
        }
      },
      {
        method: 'GET',
        path: '/',
        name: 'Get User Events'
      },
      {
        method: 'GET',
        path: '/:id',
        name: 'Get Event by ID'
      },
      {
        method: 'PATCH',
        path: '/:id',
        name: 'Update Event',
        body: {
          title: 'Updated Event Title',
          maxParticipants: 30
        }
      },
      {
        method: 'DELETE',
        path: '/:id',
        name: 'Delete Event'
      },
      {
        method: 'POST',
        path: '/:id/join',
        name: 'Join Event'
      },
      {
        method: 'POST',
        path: '/:id/leave',
        name: 'Leave Event'
      },
      {
        method: 'GET',
        path: '/:id/participants',
        name: 'Get Event Participants'
      }
    ]
  },
  'sse.route.js': {
    name: 'Server-Sent Events',
    prefix: '/sse',
    routes: [
      {
        method: 'GET',
        path: '/stream',
        name: 'SSE Stream'
      },
      {
        method: 'GET',
        path: '/poll',
        name: 'Poll Notifications (Fallback)'
      }
    ]
  },
  'notification.route.js': {
    name: 'Notifications',
    prefix: '/notification',
    routes: [
      {
        method: 'GET',
        path: '/',
        name: 'Get Notifications'
      },
      {
        method: 'GET',
        path: '/unread-count',
        name: 'Get Unread Count'
      },
      {
        method: 'PATCH',
        path: '/:id/read',
        name: 'Mark Notification as Read'
      },
      {
        method: 'PATCH',
        path: '/read-all',
        name: 'Mark All as Read'
      },
      {
        method: 'DELETE',
        path: '/:id',
        name: 'Delete Notification'
      }
    ]
  }
};

// Add status endpoint
collection.item.push({
  name: 'Health Check',
  item: [
    createRequest('GET', '/status', 'API Status', false)
  ]
});

// Generate collection items
Object.entries(routeConfigs).forEach(([filename, config]) => {
  const folder = {
    name: config.name,
    item: []
  };

  config.routes.forEach(route => {
    const fullPath = config.prefix + route.path;
    const request = createRequest(
      route.method,
      fullPath,
      route.name,
      route.requiresAuth !== false,
      route.body
    );
    folder.item.push(request);
  });

  collection.item.push(folder);
});

// Write to file
fs.writeFileSync(OUTPUT_FILE, JSON.stringify(collection, null, 2));

console.log('✅ Postman collection generated successfully!');
console.log(`📁 File location: ${OUTPUT_FILE}`);
console.log('\n📝 Next steps:');
console.log('1. Import the collection into Postman');
console.log('2. Update the baseUrl variable if needed (default: http://localhost:3000/v1)');
console.log('3. After login, set the accessToken variable with your JWT token');
console.log('4. Replace :id and :userId parameters in URLs with actual values');
