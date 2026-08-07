const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const UserPreference = require('../models/UserPreference');
const { LANGUAGES, PROFILE_LANGUAGE_CODES, languageFor } = require('../languages');
const { ensureDeutschProfile } = require('../languageProfiles');
const Word = require('../models/Word');
const { clearNotes } = require('../notesRepo');

const router = express.Router();
const present = (profile) => ({
  id: profile._id.toString(),
  language: profile.language,
  createdAt: profile.createdAt,
  ...languageFor(profile.language),
});

router.get('/', async (req, res, next) => {
  try {
    await ensureDeutschProfile(req.user.id);
    const preference = await UserPreference.findOne({ userId: req.user.id }).select('languageProfiles');
    const profiles = [...preference.languageProfiles].sort((a, b) => a.createdAt - b.createdAt);
    res.json({ profiles: profiles.map(present), supportedLanguages: PROFILE_LANGUAGE_CODES.map((code) => LANGUAGES[code]) });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const language = String(req.body.language || '').toLowerCase();
    if (!PROFILE_LANGUAGE_CODES.includes(language)) return res.status(400).json({ error: 'Unsupported language profile.' });
    await UserPreference.updateOne(
      { userId: req.user.id, 'languageProfiles.language': { $ne: language } },
      { $push: { languageProfiles: { _id: new mongoose.Types.ObjectId(), language, createdAt: new Date() } } },
    );
    const preference = await UserPreference.findOne({ userId: req.user.id }).select('languageProfiles');
    const profile = preference.languageProfiles.find((p) => p.language === language);
    res.status(201).json(present(profile));
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const preference = await UserPreference.findOne({ userId: req.user.id }).select('languageProfiles');
    const profile = preference?.languageProfiles.find((p) => String(p._id) === req.params.id);
    if (!profile) return res.status(404).json({ error: 'Language profile not found.' });

    if (preference.languageProfiles.length <= 1) {
      return res.status(400).json({ error: 'You must keep at least one language profile.' });
    }

    // Delete Astra data first. If it is unavailable, retain the profile
    // so the user can retry without leaving inaccessible notes behind.
    await clearNotes(req.user.id, profile._id.toString());
    await Word.deleteMany({ userId: req.user.id, languageProfileId: profile._id });
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { languageFriends: { language: profile.language } } },
    );
    await User.updateMany(
      { 'languageFriends.language': profile.language },
      { $pull: { 'languageFriends.$[entry].friends': { friendId: req.user.id } } },
      { arrayFilters: [{ 'entry.language': profile.language }] },
    );
    await UserPreference.updateOne(
      { userId: req.user.id },
      { $pull: { languageProfiles: { _id: profile._id } } },
    );
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
