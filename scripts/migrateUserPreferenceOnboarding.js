require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');
const UserPreference = require('../src/models/UserPreference');

if (!process.argv.includes('--execute')) {
  throw new Error('Refusing to run without --execute. Back up your database first.');
}

// One-time migration for users that existed before onboarding tracking and the
// denormalized languageProfiles copy were added to UserPreference: copy each
// user's languageProfiles into their preference doc and mark onboarding done,
// since they already completed it under the old flow.
async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  const users = await User.find({}).select('_id languageProfiles').lean();
  const now = new Date();
  let updated = 0;

  for (const user of users) {
    await UserPreference.findOneAndUpdate(
      { userId: user._id },
      {
        $set: {
          languageProfiles: (user.languageProfiles || []).map((p) => ({
            _id: p._id,
            language: p.language,
            createdAt: p.createdAt,
          })),
          onboardingDone: true,
          onboardingCompletedAt: now,
        },
        $setOnInsert: { userId: user._id },
      },
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
