/**
 * One-time script to get a Google Calendar OAuth2 refresh token.
 *
 * Usage:
 *   GOOGLE_CLIENT_ID=xxx GOOGLE_CLIENT_SECRET=xxx node scripts/get-calendar-token.js
 *
 * Or with client_secret.json in project root:
 *   node scripts/get-calendar-token.js
 *
 * Opens a browser for authorization, then prints the refresh token.
 * Store the output in GCP Secret Manager as GOOGLE_CALENDAR_CREDENTIALS.
 */

const http = require('http');
const { URL } = require('url');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');

// Load credentials from env vars or client_secret.json
let CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
let CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  const secretPath = path.join(__dirname, '..', 'client_secret.json');
  if (fs.existsSync(secretPath)) {
    const creds = JSON.parse(fs.readFileSync(secretPath, 'utf8'));
    CLIENT_ID = creds.installed.client_id;
    CLIENT_SECRET = creds.installed.client_secret;
  } else {
    console.error('Error: Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET env vars, or create client_secret.json in project root.');
    process.exit(1);
  }
}
const SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.events.readonly',
];
const PORT = 3847;
const REDIRECT_URI = `http://localhost:${PORT}`;

async function main() {
  console.log('Starting OAuth2 flow for Google Calendar...\n');

  // Build authorization URL
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', CLIENT_ID);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('scope', SCOPES.join(' '));
  authUrl.searchParams.set('access_type', 'offline');
  authUrl.searchParams.set('prompt', 'consent');

  // Start local server to receive the callback
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${PORT}`);
      const authCode = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization failed</h1><p>You can close this tab.</p>');
        server.close();
        reject(new Error(`Auth error: ${error}`));
        return;
      }

      if (authCode) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>Authorization successful!</h1><p>You can close this tab and return to the terminal.</p>');
        server.close();
        resolve(authCode);
      }
    });

    server.listen(PORT, () => {
      console.log(`Opening browser for authorization...`);
      console.log(`If the browser doesn't open, visit:\n${authUrl.toString()}\n`);

      // Open browser on macOS
      exec(`open "${authUrl.toString()}"`);
    });

    // Timeout after 2 minutes
    setTimeout(() => {
      server.close();
      reject(new Error('Authorization timed out'));
    }, 120000);
  });

  console.log('Got authorization code. Exchanging for tokens...\n');

  // Exchange code for tokens
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      grant_type: 'authorization_code',
    }),
  });

  const tokens = await tokenResponse.json();

  if (tokens.error) {
    console.error('Token exchange failed:', tokens.error, tokens.error_description);
    process.exit(1);
  }

  // Build the credentials JSON for Secret Manager
  const credentials = {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: tokens.refresh_token,
    type: 'authorized_user',
  };

  console.log('=== SUCCESS ===\n');
  console.log('Store this as GOOGLE_CALENDAR_CREDENTIALS in Secret Manager:\n');
  console.log(JSON.stringify(credentials));
  console.log('\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
