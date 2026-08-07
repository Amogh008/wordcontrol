require('dotenv').config();
const mongoose = require('mongoose');
const { dbName } = require('../src/dbTableNames');

if (!process.argv.includes('--execute')) {
  throw new Error('Refusing to run without --execute. Back up your database first.');
}

function addFriendEntry(user, language, friendId, status) {
  user.languageFriends = user.languageFriends || [];
  let entry = user.languageFriends.find((e) => e.language === language);
  if (!entry) {
    entry = { language, friends: [] };
    user.languageFriends.push(entry);
  }
  const existing = entry.friends.find((f) => String(f.friendId) === String(friendId));
  if (existing) {
    if (status === 'accepted') existing.status = 'accepted';
  } else {
    entry.friends.push({ friendId, status });
  }
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const usersCol = db.collection(dbName('users'));
  const profilesCol = db.collection(dbName('languageprofiles'));
  const friendshipsCol = db.collection(dbName('friendships'));

  const profiles = await profilesCol.find({}).toArray();
  const profileMap = new Map(profiles.map((p) => [String(p._id), { userId: p.userId, language: p.language }]));

  const users = await usersCol.find({}).toArray();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  // Every existing user gets a default German entry, matching ensureDeutschProfile's default.
  for (const user of users) {
    user.languageFriends = user.languageFriends || [];
    if (!user.languageFriends.some((e) => e.language === 'de')) {
      user.languageFriends.push({ language: 'de', friends: [] });
    }
  }

  const friendships = await friendshipsCol.find({}).toArray();
  let migrated = 0;
  let skippedOrphaned = 0;
  for (const f of friendships) {
    const requester = profileMap.get(String(f.requesterProfileId));
    const addressee = profileMap.get(String(f.addresseeProfileId));
    const requesterUser = requester && userMap.get(String(requester.userId));
    const addresseeUser = addressee && userMap.get(String(addressee.userId));
    if (!requesterUser || !addresseeUser) {
      skippedOrphaned += 1;
      continue;
    }
    addFriendEntry(requesterUser, f.language, addressee.userId, f.status);
    addFriendEntry(addresseeUser, f.language, requester.userId, f.status);
    migrated += 1;
  }

  for (const user of users) {
    await usersCol.updateOne({ _id: user._id }, { $set: { languageFriends: user.languageFriends } });
  }

  console.log(JSON.stringify({
    usersUpdated: users.length,
    friendshipsMigrated: migrated,
    friendshipsSkippedOrphaned: skippedOrphaned,
  }, null, 2));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
