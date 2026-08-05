require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const cassandra = require('cassandra-driver');

if (!process.argv.includes('--execute')) {
  throw new Error('Refusing production rollback without --execute.');
}
if (process.env.DB_TABLE_SUFFIX) {
  throw new Error('Refusing rollback while DB_TABLE_SUFFIX is set.');
}

async function rollbackMongo() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const names = (await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name);
  const requiredBackups = ['users_dev', 'words_dev', 'languageprofiles_dev', 'friendships_dev'];
  const missing = requiredBackups.filter((name) => !names.includes(name));
  if (missing.length) throw new Error(`Missing MongoDB safety copies: ${missing.join(', ')}`);

  const wordCountBefore = await db.collection('words').countDocuments();
  await db.collection('words').updateMany({}, { $unset: { languageProfileId: '' } });
  const wordIndexes = await db.collection('words').indexes();
  for (const index of wordIndexes.filter(({ key }) => Object.hasOwn(key, 'languageProfileId'))) {
    await db.collection('words').dropIndex(index.name);
  }
  await db.collection('users').updateMany({}, { $unset: { profileInfoUpdatedAt: '' } });

  const postV5Collections = ['languageprofiles', 'friendships', 'profilephotos'];
  for (const name of postV5Collections) {
    if ((await db.listCollections({ name }, { nameOnly: true }).toArray()).length) {
      await db.collection(name).drop();
    }
  }

  const wordCountAfter = await db.collection('words').countDocuments();
  const profiledWords = await db.collection('words').countDocuments({ languageProfileId: { $exists: true } });
  if (wordCountAfter !== wordCountBefore || profiledWords !== 0) throw new Error('MongoDB rollback verification failed.');
  await mongoose.disconnect();
  return { wordsRetained: wordCountAfter, profileReferencesRemaining: profiledWords, removedCollections: postV5Collections };
}

async function rollbackAstra() {
  const bundle = process.env.ASTRA_DB_SECURE_BUNDLE_PATH;
  if (!bundle || !fs.existsSync(bundle)) throw new Error('ASTRA_DB_SECURE_BUNDLE_PATH is unavailable.');
  const client = new cassandra.Client({
    cloud: { secureConnectBundle: bundle },
    credentials: { username: 'token', password: process.env.ASTRA_DB_APPLICATION_TOKEN },
    keyspace: process.env.ASTRA_DB_KEYSPACE,
  });
  await client.connect();
  const metadata = await client.execute(
    'SELECT table_name FROM system_schema.tables WHERE keyspace_name = ?',
    [process.env.ASTRA_DB_KEYSPACE],
    { prepare: true },
  );
  const names = metadata.rows.map(({ table_name }) => table_name);
  for (const required of ['notes_dev', 'notes_by_profile_dev', 'profile_photos_dev']) {
    if (!names.includes(required)) throw new Error(`Missing Astra safety copy: ${required}`);
  }

  const profileRows = (await client.execute('SELECT user_id, id, title, content, created_at, updated_at FROM notes_by_profile')).rows;
  for (const row of profileRows) {
    await client.execute(
      'INSERT INTO notes (user_id, id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?) IF NOT EXISTS',
      [row.user_id, row.id, row.title, row.content, row.created_at, row.updated_at || row.created_at],
      { prepare: true },
    );
  }
  await client.execute('DROP TABLE notes_by_profile');
  await client.execute('DROP TABLE profile_photos');
  const notesRetained = Number((await client.execute('SELECT COUNT(*) AS count FROM notes')).first().count);
  await client.shutdown();
  return { notesRetained, removedTables: ['notes_by_profile', 'profile_photos'] };
}

(async () => {
  const mongo = await rollbackMongo();
  const astra = await rollbackAstra();
  console.log(JSON.stringify({ mongo, astra }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
