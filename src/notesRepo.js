const cassandra = require('cassandra-driver');
const { getClient } = require('./astra');
const { dbName } = require('./dbTableNames');

const NOTES = dbName('notes');
const NOTES_BY_PROFILE = dbName('notes_by_profile');
const PROFILE_PHOTOS = dbName('profile_photos');

function toNote(row) {
  return {
    id: row.id.toString(),
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

async function migrateDeutschNotes(userId, profileId) {
  const oldRows = await getClient().execute(
    `SELECT id, title, content, created_at, updated_at FROM ${NOTES} WHERE user_id = ?`,
    [userId], { prepare: true },
  );
  for (const row of oldRows.rows) {
    await getClient().execute(
      `INSERT INTO ${NOTES_BY_PROFILE} (user_id, language_profile_id, id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) IF NOT EXISTS`,
      [userId, String(profileId), row.id, row.title, row.content, row.created_at, row.updated_at || row.created_at],
      { prepare: true },
    );
  }
}

async function listNotes(userId, profileId, language) {
  if (language === 'de') await migrateDeutschNotes(userId, profileId);
  const result = await getClient().execute(
    `SELECT id, title, content, created_at, updated_at FROM ${NOTES_BY_PROFILE} WHERE user_id = ? AND language_profile_id = ?`,
    [userId, String(profileId)],
    { prepare: true }
  );
  return result.rows.map(toNote).sort((a, b) => b.createdAt - a.createdAt);
}

async function createNote(userId, profileId, { title, content }) {
  const id = cassandra.types.Uuid.random();
  const createdAt = new Date();
  await getClient().execute(
    `INSERT INTO ${NOTES_BY_PROFILE} (user_id, language_profile_id, id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [userId, String(profileId), id, title, content, createdAt, createdAt],
    { prepare: true }
  );
  return { id: id.toString(), title, content, createdAt, updatedAt: createdAt };
}

async function updateNote(userId, profileId, id, { title, content }) {
  let uuid;
  try {
    uuid = cassandra.types.Uuid.fromString(id);
  } catch {
    const err = new Error('Invalid note id.');
    err.statusCode = 400;
    throw err;
  }
  const updatedAt = new Date();
  await getClient().execute(
    `UPDATE ${NOTES_BY_PROFILE} SET title = ?, content = ?, updated_at = ? WHERE user_id = ? AND language_profile_id = ? AND id = ?`,
    [title, content, updatedAt, userId, String(profileId), uuid],
    { prepare: true }
  );
  return { id, title, content, updatedAt };
}

async function deleteNote(userId, profileId, id) {
  let uuid;
  try {
    uuid = cassandra.types.Uuid.fromString(id);
  } catch {
    const err = new Error('Invalid note id.');
    err.statusCode = 400;
    throw err;
  }
  await getClient().execute(
    `DELETE FROM ${NOTES_BY_PROFILE} WHERE user_id = ? AND language_profile_id = ? AND id = ?`,
    [userId, String(profileId), uuid],
    { prepare: true }
  );
}

async function clearNotes(userId, profileId) {
  if (profileId) {
    await getClient().execute(
      `DELETE FROM ${NOTES_BY_PROFILE} WHERE user_id = ? AND language_profile_id = ?`,
      [userId, String(profileId)], { prepare: true },
    );
    return;
  }
  await getClient().execute(`DELETE FROM ${NOTES} WHERE user_id = ?`, [userId], { prepare: true });
}

async function getProfilePhoto(userId) {
  const result = await getClient().execute(
    `SELECT content_type, data, avatar_data FROM ${PROFILE_PHOTOS} WHERE user_id = ?`,
    [userId], { prepare: true },
  );
  const row = result.first();
  return row ? { contentType: row.content_type, data: row.data, avatarData: row.avatar_data } : null;
}

async function saveProfilePhoto(userId, contentType, data, avatarData) {
  await getClient().execute(
    `INSERT INTO ${PROFILE_PHOTOS} (user_id, content_type, data, avatar_data, updated_at) VALUES (?, ?, ?, ?, ?)`,
    [userId, contentType, data, avatarData, new Date()], { prepare: true },
  );
}

async function deleteProfilePhoto(userId) {
  await getClient().execute(`DELETE FROM ${PROFILE_PHOTOS} WHERE user_id = ?`, [userId], { prepare: true });
}

module.exports = {
  listNotes, createNote, updateNote, deleteNote, clearNotes,
  getProfilePhoto, saveProfilePhoto, deleteProfilePhoto,
};
