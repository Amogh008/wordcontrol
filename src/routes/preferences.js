const express = require('express');
const mongoose = require('mongoose');
const UserPreference = require('../models/UserPreference');
const { SUPPORTED_LANGUAGE_CODES } = require('../languages');
const { ensureUserPreference } = require('../userPreferences');
const { findLanguageProfile } = require('../languageProfiles');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const preference = await ensureUserPreference(req.user.id);
    res.json(preference.toJSON());
  } catch (error) { next(error); }
});

router.patch('/', async (req, res, next) => {
  try {
    const update = {};

    if (req.body.appLanguage !== undefined) {
      const appLanguage = String(req.body.appLanguage).toLowerCase();
      if (!SUPPORTED_LANGUAGE_CODES.includes(appLanguage)) {
        return res.status(400).json({ error: 'Unsupported app language.' });
      }
      update.appLanguage = appLanguage;
    }

    if (req.body.theme !== undefined) {
      if (!UserPreference.THEMES.includes(req.body.theme)) {
        return res.status(400).json({ error: 'Unsupported theme.' });
      }
      update.theme = req.body.theme;
    }

    if (req.body.activeLanguageProfileId !== undefined) {
      const { activeLanguageProfileId } = req.body;
      if (activeLanguageProfileId === null) {
        update.activeLanguageProfileId = null;
      } else {
        if (!mongoose.isValidObjectId(activeLanguageProfileId)) {
          return res.status(400).json({ error: 'Invalid language profile.' });
        }
        const profile = await findLanguageProfile(req.user.id, activeLanguageProfileId);
        if (!profile) return res.status(404).json({ error: 'Language profile not found.' });
        update.activeLanguageProfileId = profile._id;
      }
    }

    if (req.body.onboardingComplete === true) {
      update.onboardingDone = true;
      update.onboardingCompletedAt = new Date();
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update.' });
    }

    const preference = await UserPreference.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update, $setOnInsert: { userId: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    res.json(preference.toJSON());
  } catch (error) { next(error); }
});

module.exports = router;
