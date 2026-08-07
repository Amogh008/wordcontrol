const UserPreference = require('./models/UserPreference');

async function ensureUserPreference(userId) {
  return UserPreference.findOneAndUpdate(
    { userId },
    { $setOnInsert: { userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function setActiveLanguageProfile(userId, languageProfileId) {
  await UserPreference.findOneAndUpdate(
    { userId },
    { $set: { activeLanguageProfileId: languageProfileId }, $setOnInsert: { userId } },
    { upsert: true, setDefaultsOnInsert: true },
  );
}

module.exports = { ensureUserPreference, setActiveLanguageProfile };
