const mongoose = require('mongoose');
const LanguageProfile = require('../models/LanguageProfile');
const { ensureDeutschProfile } = require('../languageProfiles');

async function requireLanguageProfile(req, res, next) {
  try {
    const requestedId = req.get('X-Language-Profile-Id');
    let profile;
    if (requestedId) {
      if (!mongoose.isValidObjectId(requestedId)) {
        return res.status(400).json({ error: 'Invalid language profile.' });
      }
      profile = await LanguageProfile.findOne({ _id: requestedId, userId: req.user.id });
      if (!profile) return res.status(404).json({ error: 'Language profile not found.' });
    } else {
      profile = await ensureDeutschProfile(req.user.id);
    }
    req.languageProfile = profile;
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireLanguageProfile };
