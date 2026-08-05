require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const cassandra = require('cassandra-driver');

const SUFFIX = '_dev';
const ASTRA_SCHEMAS = {
  notes: `CREATE TABLE notes_dev (user_id text, id uuid, title text, content text, created_at timestamp, updated_at timestamp, PRIMARY KEY (user_id, id))`,
  notes_by_profile: `CREATE TABLE notes_by_profile_dev (user_id text, language_profile_id text, id uuid, title text, content text, created_at timestamp, updated_at timestamp, PRIMARY KEY ((user_id, language_profile_id), id))`,
  profile_photos: `CREATE TABLE profile_photos_dev (user_id text PRIMARY KEY, content_type text, data blob, avatar_data blob, updated_at timestamp)`,
};

async function cloneMongo() {
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const existing = await db.listCollections({}, { nameOnly: true }).toArray();
  const names = existing.map(({ name }) => name);
  const sources = names.filter((name) => !name.endsWith(SUFFIX));
  const collisions = sources.map((name) => `${name}${SUFFIX}`).filter((name) => names.includes(name));
  if (collisions.length) throw new Error(`MongoDB clone targets already exist: ${collisions.join(', ')}`);

  const results = [];
  for (const sourceName of sources) {
    const targetName = `${sourceName}${SUFFIX}`;
    await db.createCollection(targetName);
    const documents = await db.collection(sourceName).find({}).toArray();
    if (documents.length) await db.collection(targetName).insertMany(documents, { ordered: true });
    const indexes = await db.collection(sourceName).indexes();
    for (const index of indexes.filter(({ name }) => name !== '_id_')) {
      const { key, name, ...options } = index;
      delete options.v;
      delete options.ns;
      await db.collection(targetName).createIndex(key, { ...options, name });
    }
    const targetCount = await db.collection(targetName).countDocuments();
    if (targetCount !== documents.length) throw new Error(`MongoDB count mismatch for ${targetName}`);
    results.push({ source: sourceName, target: targetName, count: targetCount });
  }
  await mongoose.disconnect();
  return results;
}

async function cloneAstra() {
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
  const sources = names.filter((name) => !name.endsWith(SUFFIX));
  const unsupported = sources.filter((name) => !ASTRA_SCHEMAS[name]);
  if (unsupported.length) throw new Error(`Missing reviewed Astra schema definitions for: ${unsupported.join(', ')}`);
  const collisions = sources.map((name) => `${name}${SUFFIX}`).filter((name) => names.includes(name));
  if (collisions.length) throw new Error(`Astra clone targets already exist: ${collisions.join(', ')}`);

  const results = [];
  for (const sourceName of sources) {
    const targetName = `${sourceName}${SUFFIX}`;
    await client.execute(ASTRA_SCHEMAS[sourceName]);
    const sourceRows = (await client.execute(`SELECT * FROM ${sourceName}`)).rows;
    if (sourceRows.length) {
      const columns = Object.keys(sourceRows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const insert = `INSERT INTO ${targetName} (${columns.join(', ')}) VALUES (${placeholders})`;
      for (const row of sourceRows) await client.execute(insert, columns.map((column) => row[column]), { prepare: true });
    }
    const targetCount = Number((await client.execute(`SELECT COUNT(*) AS count FROM ${targetName}`)).first().count);
    if (targetCount !== sourceRows.length) throw new Error(`Astra count mismatch for ${targetName}`);
    results.push({ source: sourceName, target: targetName, count: targetCount });
  }
  await client.shutdown();
  return results;
}

(async () => {
  const mongo = await cloneMongo();
  const astra = await cloneAstra();
  console.log(JSON.stringify({ mongo, astra }, null, 2));
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
