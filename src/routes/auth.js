const express = require('express');
const bcrypt = require('bcryptjs');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const { signToken } = require('../tokens');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
const googleClient = new OAuth2Client();

// The RN app may request an idToken from an iOS, Android, or web OAuth client
// (different client IDs), so accept any client ID configured for this app.
const googleClientIds = (process.env.GOOGLE_CLIENT_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

router.post('/register', async (req, res, next) => {
  try {
    const { email, password, name = '' } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'password must be at least 8 characters.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ email: normalizedEmail, passwordHash, name });
    res.status(201).json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required.' });
    }

    const normalizedEmail = email.trim().toLowerCase();
    const user = await User.findOne({ email: normalizedEmail });
    if (!user || !user.passwordHash) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const { idToken } = req.body;
    if (!idToken) {
      return res.status(400).json({ error: 'idToken is required.' });
    }
    if (googleClientIds.length === 0) {
      return res.status(503).json({ error: 'Google sign-in is not configured on the server.' });
    }

    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: googleClientIds,
    });
    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email ? payload.email.toLowerCase() : undefined;
    const name = payload.name || '';

    let user = await User.findOne({ googleId });
    if (!user && email) {
      // Link Google to an existing email/password account rather than duplicating it.
      user = await User.findOne({ email });
      if (user) {
        user.googleId = googleId;
        await user.save();
      }
    }
    if (!user) {
      user = await User.create({ googleId, email, name });
    }

    res.json({ token: signToken(user), user });
  } catch (err) {
    if (err.message && err.message.includes('Token used too late')) {
      return res.status(401).json({ error: 'Google token expired.' });
    }
    if (err.message && err.message.includes('Wrong recipient')) {
      return res.status(401).json({ error: 'Google token was issued for a different client ID.' });
    }
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
