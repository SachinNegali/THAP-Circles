// import fetch from 'node-fetch'; // fetch is global in Node 18+

// const BASE_URL = 'http://localhost:3000/v1';
const BASE_URL = 'http://localhost:8081/v1';

async function verify() {
  console.log('--- Verifying Social Login ---');
  
  // 1. Social Login
  const loginRes = await fetch(`${BASE_URL}/auth/social-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      provider: 'google',
      socialId: '1234567890',
      email: 'test@example.com',
      fName: 'Test',
      lName: 'User'
    })
  });

  if (!loginRes.ok) {
    console.error('Login failed:', await loginRes.text());
    process.exit(1);
  }

  const loginData = await loginRes.json();
  console.log('Login Success!');
  console.log('User:', loginData.user.email);
  console.log('Access Token:', loginData.tokens.access.token.substring(0, 20) + '...');
  console.log('Refresh Token:', loginData.tokens.refresh.token.substring(0, 20) + '...');

  const refreshToken = loginData.tokens.refresh.token;

  // 2. Refresh Token
  console.log('\n--- Verifying Refresh Token ---');
  const refreshRes = await fetch(`${BASE_URL}/auth/refresh-tokens`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken })
  });
  
  if (!refreshRes.ok) {
    console.error('Refresh failed:', await refreshRes.text());
    process.exit(1);
  }

  const refreshData = await refreshRes.json();
  console.log('Refresh Success!');
  console.log('New Access Token:', refreshData.access.token.substring(0, 20) + '...');

  console.log('\nAll verification steps passed!');
}

verify().catch(console.error);
