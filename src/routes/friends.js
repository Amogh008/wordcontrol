const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');

const router = express.Router();

// Requires a replica-set-backed MongoDB (Atlas default) since these routes
// write to two User documents atomically.
async function pushFriendEntry(userId, language, friendId, status, session) {
  await User.updateOne(
    { _id: userId, 'languageFriends.language': language },
    { $push: { 'languageFriends.$.friends': { friendId, status } } },
    { session },
  );
  await User.updateOne(
    { _id: userId, 'languageFriends.language': { $ne: language } },
    { $push: { languageFriends: { language, friends: [{ friendId, status }] } } },
    { session },
  );
}

function friendSummary(user) {
  return { id: user._id.toString(), name: user.name, email: user.email };
}

router.get('/', async (req, res, next) => {
  try {
    const { language } = req.languageProfile;
    const me = await User.findById(req.user.id).select('languageFriends');
    const entry = (me.languageFriends || []).find((e) => e.language === language);
    const friendIds = (entry?.friends || []).map((f) => f.friendId);
    const friendUsers = await User.find({ _id: { $in: friendIds } }).select('name email');
    const friendMap = new Map(friendUsers.map((u) => [u._id.toString(), u]));

    const friends = (entry?.friends || [])
      .filter((f) => friendMap.has(String(f.friendId)))
      .map((f) => ({ ...friendSummary(friendMap.get(String(f.friendId))), status: f.status }));

    res.json({ language, friends });
  } catch (error) { next(error); }
});

router.post('/requests', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { language } = req.languageProfile;
    const userId = String(req.body.userId || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!userId && !email) return res.status(400).json({ error: 'userId or email is required.' });
    if (userId && !mongoose.isValidObjectId(userId)) {
      return res.status(400).json({ error: 'Invalid user id.' });
    }

    const target = userId
      ? await User.findById(userId).select('_id')
      : await User.findOne({ email }).select('_id');
    if (!target) return res.status(404).json({ error: 'User not found.' });
    if (String(target._id) === String(req.user.id)) {
      return res.status(400).json({ error: 'You cannot friend yourself.' });
    }

    const me = await User.findById(req.user.id).select('languageFriends');
    const myEntry = (me.languageFriends || []).find((e) => e.language === language);
    const existing = myEntry?.friends.find((f) => String(f.friendId) === String(target._id));
    if (existing) return res.status(409).json({ error: `Friend request already ${existing.status}.` });

    await session.withTransaction(async () => {
      await pushFriendEntry(req.user.id, language, target._id, 'pending', session);
      await pushFriendEntry(target._id, language, req.user.id, 'pending', session);
    });

    res.status(201).json({ status: 'pending' });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

router.post('/:friendId/accept', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { language } = req.languageProfile;
    const { friendId } = req.params;
    if (!mongoose.isValidObjectId(friendId)) return res.status(400).json({ error: 'Invalid friend id.' });

    const me = await User.findOne({
      _id: req.user.id,
      languageFriends: { $elemMatch: { language, 'friends.friendId': friendId } },
    }).select('_id');
    if (!me) return res.status(404).json({ error: 'Friend request not found.' });

    await session.withTransaction(async () => {
      await User.updateOne(
        { _id: req.user.id },
        { $set: { 'languageFriends.$[entry].friends.$[friend].status': 'accepted' } },
        { arrayFilters: [{ 'entry.language': language }, { 'friend.friendId': friendId }], session },
      );
      await User.updateOne(
        { _id: friendId },
        { $set: { 'languageFriends.$[entry].friends.$[friend].status': 'accepted' } },
        { arrayFilters: [{ 'entry.language': language }, { 'friend.friendId': req.user.id }], session },
      );
    });

    res.json({ status: 'accepted' });
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

router.delete('/:friendId', async (req, res, next) => {
  const session = await mongoose.startSession();
  try {
    const { language } = req.languageProfile;
    const { friendId } = req.params;
    if (!mongoose.isValidObjectId(friendId)) return res.status(400).json({ error: 'Invalid friend id.' });

    await session.withTransaction(async () => {
      await User.updateOne(
        { _id: req.user.id, 'languageFriends.language': language },
        { $pull: { 'languageFriends.$.friends': { friendId } } },
        { session },
      );
      await User.updateOne(
        { _id: friendId, 'languageFriends.language': language },
        { $pull: { 'languageFriends.$.friends': { friendId: req.user.id } } },
        { session },
      );
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  } finally {
    await session.endSession();
  }
});

module.exports = router;
