const mongoose = require('mongoose');
const { ensureDeutschProfile, findLanguageProfile } = require('../languageProfiles');
const { ensureUserPreference, setActiveLanguageProfile } = require('../userPreferences');

async function requireLanguageProfile(req, res, next) {
  try {
    const requestedId = req.get('X-Language-Profile-Id');
    let profile;
    if (requestedId) {
      if (!mongoose.isValidObjectId(requestedId)) {
        return res.status(400).json({ error: 'Invalid language profile.' });
      }
      profile = await findLanguageProfile(req.user.id, requestedId);
      if (!profile) return res.status(404).json({ error: 'Language profile not found.' });
    } else {
      // No profile specified: fall back to whatever the user was last on,
      // defaulting to the Deutsch profile for brand-new users.
      const preference = await ensureUserPreference(req.user.id);
      if (preference.activeLanguageProfileId) {
        profile = await findLanguageProfile(req.user.id, preference.activeLanguageProfileId);
      }
      if (!profile) profile = await ensureDeutschProfile(req.user.id);
    }
    req.languageProfile = profile;
    // Record this as the user's last-used profile; don't block the request on it.
    setActiveLanguageProfile(req.user.id, profile._id).catch((error) => console.error(error));
    next();
  } catch (error) {
    next(error);
  }
}

module.exports = { requireLanguageProfile };
