require('dotenv').config();
const mongoose = require('mongoose');
const { dbName } = require('../src/dbTableNames');

if (!process.argv.includes('--execute')) {
  throw new Error('Refusing to run without --execute. Back up your database first.');
}

// Refuses to drop either legacy collection unless every document in it is
// already accounted for in the corresponding User field, so this can only
// destroy data that migrateLanguageProfilesToUser.js / migrateFriendshipsToUser.js
// have already copied over.
(async () => {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const usersCol = db.collection(dbName('users'));
  const users = await usersCol.find({}).toArray();
  const userMap = new Map(users.map((u) => [String(u._id), u]));

  const results = {};

  const profilesColName = dbName('languageprofiles');
  const profiles = await db.collection(profilesColName).find({}).toArray();
  const unmigratedProfiles = profiles.filter((profile) => {
    const user = userMap.get(String(profile.userId));
    return !user?.languageProfiles?.some((p) => String(p._id) === String(profile._id));
  });
  if (unmigratedProfiles.length) {
    throw new Error(
      `Refusing to drop ${profilesColName}: ${unmigratedProfiles.length} profile(s) are not present in users.languageProfiles. Run migrate:language-profiles-to-user first.`,
    );
  }
  await db.collection(profilesColName).drop();
  results.languageprofiles = { documentsVerified: profiles.length, dropped: profilesColName };

  const friendshipsColName = dbName('friendships');
  const friendships = await db.collection(friendshipsColName).find({}).toArray();
  const oldProfileMap = new Map(profiles.map((p) => [String(p._id), { userId: p.userId, language: p.language }]));
  const unmigratedFriendships = friendships.filter((f) => {
    const requester = oldProfileMap.get(String(f.requesterProfileId));
    const addressee = oldProfileMap.get(String(f.addresseeProfileId));
    if (!requester || !addressee) return false; // already-orphaned rows can't block the drop
    const requesterUser = userMap.get(String(requester.userId));
    const addresseeUser = userMap.get(String(addressee.userId));
    const requesterHasFriend = requesterUser?.languageFriends
      ?.find((e) => e.language === f.language)
      ?.friends?.some((fr) => String(fr.friendId) === String(addressee.userId));
    const addresseeHasFriend = addresseeUser?.languageFriends
      ?.find((e) => e.language === f.language)
      ?.friends?.some((fr) => String(fr.friendId) === String(requester.userId));
    return !requesterHasFriend || !addresseeHasFriend;
  });
  if (unmigratedFriendships.length) {
    throw new Error(
      `Refusing to drop ${friendshipsColName}: ${unmigratedFriendships.length} friendship(s) are not present in users.languageFriends. Run migrate:friendships first.`,
    );
  }
  await db.collection(friendshipsColName).drop();
  results.friendships = { documentsVerified: friendships.length, dropped: friendshipsColName };

  console.log(JSON.stringify(results, null, 2));
  await mongoose.disconnect();
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
