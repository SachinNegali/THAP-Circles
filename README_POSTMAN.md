# Postman Collection Generator

This guide explains how to automatically generate and share a Postman collection for the Circles API.

## 🚀 Quick Start

### Generate the Collection

Run the following command from the project root:

```bash
node scripts/generate-postman-collection.js
```

This will create a `postman_collection.json` file in the project root.

### Import into Postman

1. Open Postman
2. Click **Import** button (top left)
3. Select the `postman_collection.json` file
4. Click **Import**

## 🔧 Configuration

### Environment Variables

The collection uses Postman variables for easy configuration:

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3000/v1` | API base URL |
| `accessToken` | (empty) | JWT access token for authentication |

### Setting the Access Token

1. **Login first**: Use the `Authentication > Social Login` request
2. **Copy the access token** from the response
3. **Set the variable**: 
   - Click on the collection name
   - Go to the **Variables** tab
   - Paste the token in the `accessToken` current value
   - Click **Save**

All authenticated requests will now automatically use this token!

## 📁 Collection Structure

The collection is organized into folders by feature:

- **Health Check** - API status endpoint
- **Authentication** - Login and token refresh
- **Groups** - Group management and messaging
- **Messages** - Message operations
- **Trips** - Trip planning and management
- **Events** - Event creation and participation
- **Server-Sent Events** - Real-time notifications
- **Notifications** - Notification management

## 🔄 Updating the Collection

Whenever you add or modify API routes, simply run the generator again:

```bash
node scripts/generate-postman-collection.js
```

Then re-import the collection in Postman (it will update the existing one).

## 📤 Sharing the Collection

### Option 1: Share the JSON File

Simply share the `postman_collection.json` file with your team. They can import it directly into Postman.

### Option 2: Export from Postman

1. Right-click on the collection in Postman
2. Select **Export**
3. Choose **Collection v2.1**
4. Share the exported file

### Option 3: Postman Workspace (Recommended)

1. Create a Postman workspace
2. Import the collection
3. Invite team members to the workspace
4. Everyone gets automatic updates!

## 💡 Tips

### Using Path Parameters

Many endpoints use path parameters like `:id` or `:userId`. Replace these with actual values:

- Before: `{{baseUrl}}/group/:id`
- After: `{{baseUrl}}/group/65abc123def456789`

### Testing Workflow

1. **Login**: Use `Authentication > Social Login`
2. **Set Token**: Copy access token to collection variables
3. **Create Resources**: Create groups, trips, or events
4. **Copy IDs**: Note the IDs from responses
5. **Test Operations**: Use the IDs in subsequent requests

### Request Bodies

All POST/PATCH requests include example request bodies. Modify them as needed for your testing.

## 🛠️ Customization

To customize the collection, edit `scripts/generate-postman-collection.js`:

- **Change base URL**: Modify the `baseUrl` variable
- **Add request examples**: Add to the `body` property in route configs
- **Add tests**: Include test scripts in the request objects
- **Add pre-request scripts**: Include setup logic

## 📝 Example: Adding a New Route

When you add a new route to your Express app:

1. The route file is automatically detected
2. Add the route configuration to `routeConfigs` in the generator script
3. Run the generator
4. Re-import in Postman

Example:

```javascript
'myroute.route.js': {
  name: 'My Feature',
  prefix: '/myfeature',
  routes: [
    {
      method: 'POST',
      path: '/',
      name: 'Create Item',
      body: {
        name: 'Example',
        value: 123
      }
    }
  ]
}
```

## 🔐 Security Note

**Never commit the collection with real tokens!** The `accessToken` variable should always be empty in the committed file. Team members should set their own tokens after importing.

## 📚 Additional Resources

- [Postman Documentation](https://learning.postman.com/docs/getting-started/introduction/)
- [Collection Format Reference](https://schema.postman.com/collection/json/v2.1.0/draft-07/docs/index.html)
- [Postman Variables Guide](https://learning.postman.com/docs/sending-requests/variables/)
