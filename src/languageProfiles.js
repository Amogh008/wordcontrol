const mongoose = require('mongoose');
const Word = require('./models/Word');
const User = require('./models/User');
const UserPreference = require('./models/UserPreference');

async function findLanguageProfile(userId, profileId) {
  const preference = await UserPreference.findOne(
    { userId, 'languageProfiles._id': profileId },
    { 'languageProfiles.$': 1 },
  );
  return preference?.languageProfiles?.[0] || null;
}

async function ensureDeutschProfile(userId) {
  try {
    await UserPreference.findOneAndUpdate(
      { userId, 'languageProfiles.language': { $ne: 'de' } },
      {
        $push: { languageProfiles: { _id: new mongoose.Types.ObjectId(), language: 'de', createdAt: new Date() } },
        $setOnInsert: { userId },
      },
      { upsert: true },
    );
  } catch (error) {
    // A concurrent request (e.g. the /api/preferences fetch that also runs on
    // first login) can win the upsert race for this same brand-new user and
    // insert the userId doc first. Retry as a plain update now that it exists.
    if (error.code !== 11000) throw error;
    await UserPreference.findOneAndUpdate(
      { userId, 'languageProfiles.language': { $ne: 'de' } },
      { $push: { languageProfiles: { _id: new mongoose.Types.ObjectId(), language: 'de', createdAt: new Date() } } },
    );
  }
  const preference = await UserPreference.findOne({ userId }).select('languageProfiles');
  const profile = preference.languageProfiles.find((p) => p.language === 'de');
  // Catches both words that never had a languageProfileId AND words whose
  // languageProfileId points at a profile that no longer exists for this user
  // (e.g. left behind by an earlier profile reset) - $nin matches missing too.
  const validProfileIds = preference.languageProfiles.map((p) => p._id);
  await Word.updateMany(
    { userId, languageProfileId: { $nin: validProfileIds } },
    { $set: { languageProfileId: profile._id } },
  );
  await User.updateOne(
    { _id: userId, 'languageFriends.language': { $ne: 'de' } },
    { $push: { languageFriends: { language: 'de', friends: [] } } },
  );
  return profile;
}

module.exports = { ensureDeutschProfile, findLanguageProfile };
