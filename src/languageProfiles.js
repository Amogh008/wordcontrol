const LanguageProfile = require('./models/LanguageProfile');
const Word = require('./models/Word');

async function ensureDeutschProfile(userId) {
  const profile = await LanguageProfile.findOneAndUpdate(
    { userId, language: 'de' },
    { $setOnInsert: { userId, language: 'de' } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
  await Word.updateMany(
    { userId, languageProfileId: { $exists: false } },
    { $set: { languageProfileId: profile._id } },
  );
  return profile;
}

module.exports = { ensureDeutschProfile };
