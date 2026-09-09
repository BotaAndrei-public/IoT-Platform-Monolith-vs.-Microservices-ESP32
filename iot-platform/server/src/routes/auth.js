const express = require('express');
const { google } = require('googleapis');
const jwt = require('jsonwebtoken');
const { queryOne } = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function getOAuthClient(redirectUri) {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    redirectUri
  );
}

// Construieste redirect URI dinamic -> functioneaza atat local cat si pe Cloudflare
function buildRedirectUri(req) {
  //daca e setat in .env folosim aia
  if (process.env.GOOGLE_REDIRECT_URI &&
      !process.env.GOOGLE_REDIRECT_URI.includes('localhost')) {
    return process.env.GOOGLE_REDIRECT_URI;
  }
  // altfel detectam din request (pentru Cloudflare tunnel)
  const proto = req.headers['x-forwarded-proto'] || req.protocol;
  const host  = req.headers['x-forwarded-host'] || req.headers.host;
  return `${proto}://${host}/api/auth/google/callback`;
}

//GET /api/auth/google 
router.get('/google', (req, res) => {
  const redirectUri = buildRedirectUri(req);
  const oauth2 = getOAuthClient(redirectUri);
  const url = oauth2.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'https://www.googleapis.com/auth/userinfo.profile',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    prompt: 'select_account',
    state: Buffer.from(JSON.stringify({ redirectUri })).toString('base64'),
  });
  console.log(`[Auth] Google login URL generat, redirect: ${redirectUri}`);
  res.json({ url });
});

//GET /api/auth/google/callback
router.get('/google/callback', async (req, res) => {
  const { code, error, state } = req.query;

  //detect CLIENT_URL dinamic
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';

  if (error || !code) {
    return res.redirect(`${clientUrl}/login?error=access_denied`);
  }

  try {
    //Ia redirect URI din state (trimis la /google)
    let redirectUri = buildRedirectUri(req);
    if (state) {
      try {
        const decoded = JSON.parse(Buffer.from(state, 'base64').toString());
        if (decoded.redirectUri) redirectUri = decoded.redirectUri;
      } catch {}
    }

    const oauth2 = getOAuthClient(redirectUri);
    const { tokens } = await oauth2.getToken(code);
    oauth2.setCredentials(tokens);

    const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
    const { data: profile } = await oauth2Api.userinfo.get();
    const { id: googleId, email, name, picture } = profile;

    const user = await queryOne(
      `INSERT INTO users (google_id, email, name, avatar)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (google_id) DO UPDATE
         SET email=$2, name=$3, avatar=$4, last_login=NOW()
       RETURNING id, email, name, avatar`,
      [googleId, email, name, picture]
    );

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, avatar: user.avatar },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    console.log(`[Auth] Login OK: ${email} -> redirect la ${clientUrl}`);
    res.redirect(`${clientUrl}/auth/callback?token=${token}`);
  } catch (err) {
    console.error('[Auth] OAuth error:', err.message);
    res.redirect(`${clientUrl}/login?error=oauth_failed`);
  }
});

//GET /api/auth/me
router.get('/me', requireAuth, async (req, res) => {
  const user = await queryOne(
    'SELECT id, email, name, avatar, created_at, last_login FROM users WHERE id = $1',
    [req.user.id]
  );
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(user);
});

router.post('/logout', (req, res) => res.json({ success: true }));

module.exports = router;
