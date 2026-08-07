require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const UserPreference = require('../src/models/UserPreference');
const { ensureDeutschProfile } = require('../src/languageProfiles');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('_id').lean();
  let created = 0;
  for (const user of users) {
    const deutschProfile = await ensureDeutschProfile(user._id);
    const alreadyExisted = await UserPreference.exists({ userId: user._id });
    await UserPreference.findOneAndUpdate(
      { userId: user._id },
      {
        $setOnInsert: {
          userId: user._id,
          appLanguage: 'en',
          theme: 'dark',
          activeLanguageProfileId: deutschProfile._id,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    if (!alreadyExisted) created += 1;
  }
  console.info(`Ensured preferences for ${users.length} users (${created} created).`);
  await mongoose.disconnect();
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
