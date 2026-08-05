const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Word = require('../models/Word');
const PendingRegistration = require('../models/PendingRegistration');
const PendingPasswordReset = require('../models/PendingPasswordReset');
const { clearNotes, getProfilePhoto, saveProfilePhoto, deleteProfilePhoto } = require('../notesRepo');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../verificationEmail');
const { signToken } = require('../tokens');
const { requireAuth } = require('../middleware/auth');
const LanguageProfile = require('../models/LanguageProfile');
const { ensureDeutschProfile } = require('../languageProfiles');
const Friendship = require('../models/Friendship');

const router = express.Router();
const googleClient = new OAuth2Client();

// The RN app may request an idToken from an iOS, Android, or web OAuth client
// (different client IDs), so accept any client ID configured for this app.
const googleClientIds = (process.env.GOOGLE_CLIENT_ID || '')
  .split(',')
  .map((id) => id.trim())
  .filter(Boolean);

async function verifiedGooglePayload(idToken) {
  if (!idToken) {
    const error = new Error('idToken is required.');
    error.statusCode = 400;
    throw error;
  }
  if (googleClientIds.length === 0) {
    const error = new Error('Google sign-in is not configured on the server.');
    error.statusCode = 503;
    throw error;
  }
  const ticket = await googleClient.verifyIdToken({ idToken, audience: googleClientIds });
  const payload = ticket.getPayload();
  if (!payload.email || !payload.email_verified) {
    const error = new Error('Google has not verified this email address.');
    error.statusCode = 401;
    throw error;
  }
  return payload;
}

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
    const recentRequest = await PendingRegistration.findOne({ email: normalizedEmail });
    if (recentRequest && Date.now() - recentRequest.updatedAt.getTime() < 60 * 1000) {
      return res.status(429).json({
        error: 'Please wait one minute before requesting another code.',
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await sendVerificationEmail(normalizedEmail, code);
    await PendingRegistration.findOneAndUpdate(
      { email: normalizedEmail },
      { email: normalizedEmail, passwordHash, name, codeHash, attempts: 0, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(202).json({
      pendingVerification: true,
      email: normalizedEmail,
      message: 'Check your email for the verification code.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/verify-email', async (req, res, next) => {
  try {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    if (!normalizedEmail || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the six-digit verification code.' });
    }

    const pending = await PendingRegistration.findOne({ email: normalizedEmail });
    if (!pending || pending.expiresAt <= new Date()) {
      return res.status(410).json({ error: 'This code has expired. Request a new one.' });
    }
    if (pending.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    const matches = await bcrypt.compare(code, pending.codeHash);
    if (!matches) {
      pending.attempts += 1;
      await pending.save();
      return res.status(400).json({ error: 'The verification code is incorrect.' });
    }

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      await PendingRegistration.deleteOne({ _id: pending._id });
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const user = await User.create({
      email: pending.email,
      passwordHash: pending.passwordHash,
      name: pending.name,
      emailVerified: true,
    });
    await ensureDeutschProfile(user.id);
    await PendingRegistration.deleteOne({ _id: pending._id });
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

    await ensureDeutschProfile(user.id);
    res.json({ token: signToken(user), user });
  } catch (err) {
    next(err);
  }
});

router.post('/forgot-password', async (req, res, next) => {
  try {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    if (!normalizedEmail) {
      return res.status(400).json({ error: 'Enter your email address.' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    // Use the same response for unknown addresses so this endpoint does not
    // reveal which email addresses have DLT accounts.
    if (!user) {
      return res.status(202).json({
        message: 'If an account exists, a password reset code has been sent.',
      });
    }

    const recentRequest = await PendingPasswordReset.findOne({ email: normalizedEmail });
    if (recentRequest && Date.now() - recentRequest.updatedAt.getTime() < 60 * 1000) {
      return res.status(429).json({
        error: 'Please wait one minute before requesting another code.',
      });
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await sendPasswordResetEmail(normalizedEmail, code);
    await PendingPasswordReset.findOneAndUpdate(
      { email: normalizedEmail },
      { email: normalizedEmail, codeHash, attempts: 0, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    res.status(202).json({
      message: 'If an account exists, a password reset code has been sent.',
    });
  } catch (err) {
    next(err);
  }
});

router.post('/reset-password', async (req, res, next) => {
  try {
    const normalizedEmail = String(req.body.email || '').trim().toLowerCase();
    const code = String(req.body.code || '').trim();
    const password = String(req.body.password || '');
    if (!normalizedEmail || !/^\d{6}$/.test(code)) {
      return res.status(400).json({ error: 'Enter the six-digit reset code.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const pending = await PendingPasswordReset.findOne({ email: normalizedEmail });
    if (!pending || pending.expiresAt <= new Date()) {
      return res.status(410).json({ error: 'This reset code has expired. Request a new one.' });
    }
    if (pending.attempts >= 5) {
      return res.status(429).json({ error: 'Too many attempts. Request a new code.' });
    }
    const matches = await bcrypt.compare(code, pending.codeHash);
    if (!matches) {
      pending.attempts += 1;
      await pending.save();
      return res.status(400).json({ error: 'The reset code is incorrect.' });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      await PendingPasswordReset.deleteOne({ _id: pending._id });
      return res.status(410).json({ error: 'This reset request is no longer valid.' });
    }
    user.passwordHash = await bcrypt.hash(password, 10);
    user.emailVerified = true;
    await user.save();
    await PendingPasswordReset.deleteOne({ _id: pending._id });

    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    next(err);
  }
});

router.post('/google', async (req, res, next) => {
  try {
    const payload = await verifiedGooglePayload(req.body.idToken);
    const googleId = payload.sub;
    const email = payload.email.toLowerCase();
    const name = payload.name || '';

    let user = await User.findOne({ googleId });
    if (!user) {
      const emailUser = await User.findOne({ email });
      if (emailUser) {
        return res.status(409).json({
          error: 'Sign in with your password, then link Google from Settings.',
        });
      }
    }
    if (!user) {
      user = await User.create({ googleId, email, name, emailVerified: true });
    }

    await ensureDeutschProfile(user.id);

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

router.post('/link-google', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!user.email) {
      return res.status(400).json({ error: 'Your account does not have an email address.' });
    }

    const payload = await verifiedGooglePayload(req.body.idToken);
    const googleEmail = payload.email.trim().toLowerCase();
    if (googleEmail !== user.email.trim().toLowerCase()) {
      return res.status(400).json({
        error: `Choose the Google account with the same email: ${user.email}`,
      });
    }

    const linkedElsewhere = await User.findOne({
      googleId: payload.sub,
      _id: { $ne: user._id },
    });
    if (linkedElsewhere) {
      return res.status(409).json({ error: 'This Google account is already linked.' });
    }

    user.googleId = payload.sub;
    user.emailVerified = true;
    await user.save();
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    await ensureDeutschProfile(user.id);
    res.json({ user });
  } catch (err) {
    next(err);
  }
});

router.patch('/me/profile', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const name = String(req.body.name || '').trim();
    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({ error: 'Name must contain between 2 and 60 characters.' });
    }
    const cooldownMs = 14 * 24 * 60 * 60 * 1000;
    const nextEditAt = user.profileInfoUpdatedAt
      ? new Date(user.profileInfoUpdatedAt.getTime() + cooldownMs)
      : null;
    if (nextEditAt && nextEditAt > new Date()) {
      return res.status(429).json({
        error: 'Profile information can only be changed once every 14 days.',
        nextEditAt,
      });
    }

    user.name = name;
    user.profileInfoUpdatedAt = new Date();
    await user.save();
    res.json({ user, nextEditAt: new Date(user.profileInfoUpdatedAt.getTime() + cooldownMs) });
  } catch (error) { next(error); }
});

router.get('/me/profile-photo', requireAuth, async (req, res, next) => {
  try {
    const photo = await getProfilePhoto(req.user.id);
    if (!photo) return res.json({ photo: null });
    const displayedData = req.query.size === 'full' ? photo.data : (photo.avatarData || photo.data);
    res.json({ photo: `data:${photo.contentType};base64,${displayedData.toString('base64')}` });
  } catch (error) { next(error); }
});

router.put('/me/profile-photo', requireAuth, async (req, res, next) => {
  try {
    const contentType = String(req.body.contentType || '').toLowerCase();
    const base64 = String(req.body.base64 || '').replace(/^data:[^;]+;base64,/, '');
    const avatarBase64 = String(req.body.avatarBase64 || '').replace(/^data:[^;]+;base64,/, '');
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(contentType)
      || !/^[a-z0-9+/=\r\n]+$/i.test(base64)
      || !/^[a-z0-9+/=\r\n]+$/i.test(avatarBase64)) {
      return res.status(400).json({ error: 'Choose a JPEG, PNG, or WebP image.' });
    }
    const data = Buffer.from(base64, 'base64');
    const avatarData = Buffer.from(avatarBase64, 'base64');
    if (!data.length || data.length > 1024 * 1024) {
      return res.status(413).json({ error: 'Profile photo must not exceed 1 MB.' });
    }
    if (!avatarData.length || avatarData.length > 100 * 1024) {
      return res.status(413).json({ error: 'Avatar thumbnail must not exceed 100 KB.' });
    }
    await saveProfilePhoto(req.user.id, contentType, data, avatarData);
    res.json({ photo: `data:${contentType};base64,${avatarData.toString('base64')}` });
  } catch (error) { next(error); }
});

router.delete('/me/profile-photo', requireAuth, async (req, res, next) => {
  try {
    await deleteProfilePhoto(req.user.id);
    res.status(204).send();
  } catch (error) { next(error); }
});

router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Delete data held outside MongoDB first. If AstraDB is unavailable, keep
    // the account intact so the user can retry without leaving orphaned notes.
    const profiles = await LanguageProfile.find({ userId: req.user.id }).select('_id');
    await Promise.all(profiles.map((profile) => clearNotes(req.user.id, profile.id)));
    await clearNotes(req.user.id);
    await Word.deleteMany({ userId: req.user.id });
    await Friendship.deleteMany({
      $or: [
        { requesterProfileId: { $in: profiles.map((profile) => profile._id) } },
        { addresseeProfileId: { $in: profiles.map((profile) => profile._id) } },
      ],
    });
    await LanguageProfile.deleteMany({ userId: req.user.id });
    await deleteProfilePhoto(req.user.id);
    await User.deleteOne({ _id: req.user.id });

    res.status(204).end();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
