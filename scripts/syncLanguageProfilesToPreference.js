require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const UserPreference = require('../src/models/UserPreference');

// UserPreference.languageProfiles is now the source of truth (see src/languageProfiles.js).
// This copies each user's current User.languageProfiles into their preference doc,
// replacing whatever is there so preference data can't drift from what the user actually has.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('_id languageProfiles').lean();
  let updated = 0;

  for (const user of users) {
    const languageProfiles = (user.languageProfiles || []).map((p) => ({
      _id: p._id,
      language: p.language,
      createdAt: p.createdAt,
    }));
    await UserPreference.findOneAndUpdate(
      { userId: user._id },
      { $set: { languageProfiles }, $setOnInsert: { userId: user._id } },
      { upsert: true, setDefaultsOnInsert: true },
    );
    updated += 1;
  }

  console.log(JSON.stringify({ usersUpdated: updated }, null, 2));
  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
