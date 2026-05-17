const express = require('express');
const fs = require('fs');
const path = require('path');

const {
  exchangeCode,
  generateAuthUrl,
  isAuthenticated
} = require('../auth');

const router = express.Router();
const tokenPath = path.join(__dirname, '..', '..', 'data', 'token.json');

router.get('/status', (req, res) => {
  res.json({ authenticated: isAuthenticated() });
});

router.get('/login', (req, res) => {
  try {
    const authUrl = generateAuthUrl();
    res.redirect(authUrl);
  } catch (error) {
    console.error('Failed to generate Google auth URL:', error);
    res.status(500).json({ error: 'Failed to start Google authentication.' });
  }
});

router.get('/callback', async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code.' });
  }

  try {
    await exchangeCode(code);
    res.redirect('http://localhost:5173');
  } catch (error) {
    console.error('Failed to exchange Google auth code:', error);
    res.status(500).json({ error: 'Failed to complete Google authentication.' });
  }
});

router.get('/logout', (req, res) => {
  try {
    if (fs.existsSync(tokenPath)) {
      fs.unlinkSync(tokenPath);
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Failed to delete Google token:', error);
    res.status(500).json({ error: 'Failed to log out.' });
  }
});

module.exports = router;
