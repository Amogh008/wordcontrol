require('dotenv').config();
const mongoose = require('mongoose');
const { dbName } = require('../src/dbTableNames');

if (!process.argv.includes('--execute')) {
  throw new Error('Refusing to run without --execute. Back up your database first.');
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const usersCol = db.collection(dbName('users'));
  const profilesCol = db.collection(dbName('languageprofiles'));

  const users = await usersCol.find({}).toArray();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const profiles = await profilesCol.find({}).toArray();
  let migrated = 0;
  let skippedOrphaned = 0;
  for (const profile of profiles) {
    const user = userMap.get(String(profile.userId));
    if (!user) {
      skippedOrphaned += 1;
      continue;
    }
    user.languageProfiles = user.languageProfiles || [];
    if (!user.languageProfiles.some((p) => p.language === profile.language)) {
      user.languageProfiles.push({
        _id: profile._id,
        language: profile.language,
        createdAt: profile.createdAt || new Date(),
      });
      migrated += 1;
    }
  }

  for (const user of users) {
    if (user.languageProfiles) {
      await usersCol.updateOne({ _id: user._id }, { $set: { languageProfiles: user.languageProfiles } });
    }
  }

  console.log(JSON.stringify({
    usersUpdated: users.filter((u) => u.languageProfiles).length,
    profilesMigrated: migrated,
    profilesSkippedOrphaned: skippedOrphaned,
  }, null, 2));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
