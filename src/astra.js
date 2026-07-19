const fs = require('fs');
const os = require('os');
const path = require('path');
const cassandra = require('cassandra-driver');

let client = null;

// Locate the Secure Connect Bundle: a local zip path for dev, or a
// base64-encoded env var for Render (where committing the zip isn't an
// option since it's gitignored and holds connection credentials).
function resolveBundlePath() {
  const explicitPath = process.env.ASTRA_DB_SECURE_BUNDLE_PATH;
  if (explicitPath && fs.existsSync(explicitPath)) return explicitPath;

  const b64 = process.env.ASTRA_DB_SECURE_BUNDLE_B64;
  if (b64) {
    const tmpPath = path.join(os.tmpdir(), 'astra-secure-connect-bundle.zip');
    fs.writeFileSync(tmpPath, Buffer.from(b64, 'base64'));
    return tmpPath;
  }

  return null;
}

async function connectAstra() {
  const bundlePath = resolveBundlePath();
  const token = process.env.ASTRA_DB_APPLICATION_TOKEN;
  const keyspace = process.env.ASTRA_DB_KEYSPACE;

  if (!bundlePath) {
    throw new Error(
      'AstraDB secure connect bundle not found. Set ASTRA_DB_SECURE_BUNDLE_PATH to a local zip ' +
      'path, or ASTRA_DB_SECURE_BUNDLE_B64 to the base64-encoded bundle (used on Render).'
    );
  }
  if (!token) {
    throw new Error('ASTRA_DB_APPLICATION_TOKEN is not set.');
  }
  if (!keyspace) {
    throw new Error('ASTRA_DB_KEYSPACE is not set.');
  }

  const newClient = new cassandra.Client({
    cloud: { secureConnectBundle: bundlePath },
    credentials: { username: 'token', password: token },
    keyspace,
  });

  await newClient.connect();

  // userId scopes every row to the MongoDB user so each account only ever
  // sees its own notes; id is a per-note clustering key under that partition.
  await newClient.execute(`
    CREATE TABLE IF NOT EXISTS notes (
      user_id text,
      id uuid,
      title text,
      content text,
      created_at timestamp,
      updated_at timestamp,
      PRIMARY KEY (user_id, id)
    )
  `);

  // Older tables created before `updated_at` existed won't have the column yet.
  try {
    await newClient.execute('ALTER TABLE notes ADD updated_at timestamp');
  } catch (err) {
    if (!/already exist/i.test(err.message)) throw err;
  }

  client = newClient;
}

function hasAstra() {
  return client !== null;
}

function getClient() {
  if (!client) {
    const err = new Error('Notes feature is not configured on the server.');
    err.statusCode = 503;
    throw err;
  }
  return client;
}

module.exports = { connectAstra, hasAstra, getClient };
