const fs = require('fs');
const path = require('path');
const { google } = require('googleapis');

const dataDir = path.join(__dirname, '..', 'data');
const tokenPath = path.join(dataDir, 'token.json');
const scopes = [
  'https://www.googleapis.com/auth/youtube',
  'https://www.googleapis.com/auth/yt-analytics.readonly'
];

function createOAuthClient() {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REDIRECT_URI } = process.env;

  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET || !GOOGLE_REDIRECT_URI) {
    throw new Error('Missing Google OAuth environment variables.');
  }

  return new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );
}

function ensureDataDir() {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

function generateAuthUrl() {
  const oauth2Client = createOAuthClient();

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: scopes
  });
}

async function exchangeCode(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);

  oauth2Client.setCredentials(tokens);
  ensureDataDir();
  fs.writeFileSync(tokenPath, JSON.stringify(tokens, null, 2));

  return tokens;
}

async function getClient() {
  if (!fs.existsSync(tokenPath)) {
    throw new Error('Not authenticated. token.json not found.');
  }

  const oauth2Client = createOAuthClient();
  const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

  if (!tokens.access_token && !tokens.refresh_token) {
    throw new Error('Stored Google OAuth token is invalid.');
  }

  oauth2Client.setCredentials(tokens);

  return oauth2Client;
}

function isAuthenticated() {
  if (!fs.existsSync(tokenPath)) {
    return false;
  }

  try {
    const tokens = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));

    return Boolean(tokens.access_token || tokens.refresh_token);
  } catch (error) {
    return false;
  }
}

module.exports = {
  exchangeCode,
  generateAuthUrl,
  getClient,
  isAuthenticated
};
