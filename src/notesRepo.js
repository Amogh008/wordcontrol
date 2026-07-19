const cassandra = require('cassandra-driver');
const { getClient } = require('./astra');

function toNote(row) {
  return {
    id: row.id.toString(),
    title: row.title,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at ?? row.created_at,
  };
}

async function listNotes(userId) {
  const result = await getClient().execute(
    'SELECT id, title, content, created_at, updated_at FROM notes WHERE user_id = ?',
    [userId],
    { prepare: true }
  );
  return result.rows.map(toNote).sort((a, b) => b.createdAt - a.createdAt);
}

async function createNote(userId, { title, content }) {
  const id = cassandra.types.Uuid.random();
  const createdAt = new Date();
  await getClient().execute(
    'INSERT INTO notes (user_id, id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    [userId, id, title, content, createdAt, createdAt],
    { prepare: true }
  );
  return { id: id.toString(), title, content, createdAt, updatedAt: createdAt };
}

async function updateNote(userId, id, { title, content }) {
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
    'UPDATE notes SET title = ?, content = ?, updated_at = ? WHERE user_id = ? AND id = ?',
    [title, content, updatedAt, userId, uuid],
    { prepare: true }
  );
  return { id, title, content, updatedAt };
}

async function deleteNote(userId, id) {
  let uuid;
  try {
    uuid = cassandra.types.Uuid.fromString(id);
  } catch {
    const err = new Error('Invalid note id.');
    err.statusCode = 400;
    throw err;
  }
  await getClient().execute(
    'DELETE FROM notes WHERE user_id = ? AND id = ?',
    [userId, uuid],
    { prepare: true }
  );
}

async function clearNotes(userId) {
  await getClient().execute('DELETE FROM notes WHERE user_id = ?', [userId], { prepare: true });
}

module.exports = { listNotes, createNote, updateNote, deleteNote, clearNotes };
