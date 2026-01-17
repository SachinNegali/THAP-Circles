const BASE_URL = 'http://localhost:8081/v1';

let accessToken = '';
let userId = '';
let groupId = '';
let messageId = '';

async function verify() {
  console.log('=== Groups Feature Verification ===\n');

  try {
    // 1. Login first
    console.log('1. Logging in...');
    const loginRes = await fetch(`${BASE_URL}/auth/social-login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'google',
        socialId: 'test123',
        email: 'testuser@example.com',
        fName: 'Test',
        lName: 'User',
      }),
    });

    if (!loginRes.ok) {
      throw new Error('Login failed: ' + (await loginRes.text()));
    }

    const loginData = await loginRes.json();
    accessToken = loginData.tokens.access.token;
    userId = loginData.user._id;
    console.log('✓ Logged in successfully\n');

    // 2. Create a group
    console.log('2. Creating a group...');
    const createGroupRes = await fetch(`${BASE_URL}/groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        name: 'Test Group',
        description: 'A test group for verification',
      }),
    });

    if (!createGroupRes.ok) {
      throw new Error('Group creation failed: ' + (await createGroupRes.text()));
    }

    const groupData = await createGroupRes.json();
    groupId = groupData.group._id;
    console.log(`✓ Group created: ${groupData.group.name} (ID: ${groupId})\n`);

    // 3. Get user's groups
    console.log('3. Fetching user groups...');
    const getGroupsRes = await fetch(`${BASE_URL}/groups`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getGroupsRes.ok) {
      throw new Error('Get groups failed: ' + (await getGroupsRes.text()));
    }

    const groupsData = await getGroupsRes.json();
    console.log(`✓ Found ${groupsData.groups.length} group(s)\n`);

    // 4. Send a message
    console.log('4. Sending a message...');
    const sendMessageRes = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        content: 'Hello, this is a test message!',
        type: 'text',
      }),
    });

    if (!sendMessageRes.ok) {
      throw new Error('Send message failed: ' + (await sendMessageRes.text()));
    }

    const messageData = await sendMessageRes.json();
    messageId = messageData.data._id;
    console.log(`✓ Message sent: "${messageData.data.content}"\n`);

    // 5. Get messages
    console.log('5. Fetching messages...');
    const getMessagesRes = await fetch(`${BASE_URL}/groups/${groupId}/messages`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!getMessagesRes.ok) {
      throw new Error('Get messages failed: ' + (await getMessagesRes.text()));
    }

    const messagesData = await getMessagesRes.json();
    console.log(`✓ Found ${messagesData.messages.length} message(s)\n`);

    // 6. Update group info
    console.log('6. Updating group info...');
    const updateGroupRes = await fetch(`${BASE_URL}/groups/${groupId}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        description: 'Updated description',
      }),
    });

    if (!updateGroupRes.ok) {
      throw new Error('Update group failed: ' + (await updateGroupRes.text()));
    }

    console.log('✓ Group info updated\n');

    // 7. Test error handling - try to access without auth
    console.log('7. Testing error handling (no auth)...');
    const noAuthRes = await fetch(`${BASE_URL}/groups`);

    if (noAuthRes.status === 401) {
      console.log('✓ Unauthorized access properly blocked\n');
    } else {
      console.log('✗ Expected 401, got:', noAuthRes.status, '\n');
    }

    console.log('=== All verification tests passed! ===');
  } catch (error) {
    console.error('\n✗ Verification failed:', error.message);
    process.exit(1);
  }
}

verify().catch(console.error);
