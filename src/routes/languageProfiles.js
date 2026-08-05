const express = require('express');
const LanguageProfile = require('../models/LanguageProfile');
const { LANGUAGES, PROFILE_LANGUAGE_CODES, languageFor } = require('../languages');
const { ensureDeutschProfile } = require('../languageProfiles');
const Word = require('../models/Word');
const Friendship = require('../models/Friendship');
const { clearNotes } = require('../notesRepo');

const router = express.Router();
const present = (profile) => ({ ...profile.toJSON(), ...languageFor(profile.language) });

router.get('/', async (req, res, next) => {
  try {
    await ensureDeutschProfile(req.user.id);
    const profiles = await LanguageProfile.find({ userId: req.user.id }).sort({ createdAt: 1 });
    res.json({ profiles: profiles.map(present), supportedLanguages: PROFILE_LANGUAGE_CODES.map((code) => LANGUAGES[code]) });
  } catch (error) { next(error); }
});

router.post('/', async (req, res, next) => {
  try {
    const language = String(req.body.language || '').toLowerCase();
    if (!PROFILE_LANGUAGE_CODES.includes(language)) return res.status(400).json({ error: 'Unsupported language profile.' });
    const profile = await LanguageProfile.findOneAndUpdate(
      { userId: req.user.id, language },
      { $setOnInsert: { userId: req.user.id, language } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.status(201).json(present(profile));
  } catch (error) { next(error); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const profile = await LanguageProfile.findOne({ _id: req.params.id, userId: req.user.id });
    if (!profile) return res.status(404).json({ error: 'Language profile not found.' });

    const profileCount = await LanguageProfile.countDocuments({ userId: req.user.id });
    if (profileCount <= 1) {
      return res.status(400).json({ error: 'You must keep at least one language profile.' });
    }

    // Delete Astra data first. If it is unavailable, retain the MongoDB profile
    // so the user can retry without leaving inaccessible notes behind.
    await clearNotes(req.user.id, profile.id);
    await Word.deleteMany({ userId: req.user.id, languageProfileId: profile._id });
    await Friendship.deleteMany({
      $or: [{ requesterProfileId: profile._id }, { addresseeProfileId: profile._id }],
    });
    await profile.deleteOne();
    res.status(204).send();
  } catch (error) { next(error); }
});

module.exports = router;
