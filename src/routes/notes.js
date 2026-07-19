const express = require('express');
const { listNotes, createNote, updateNote, deleteNote, clearNotes } = require('../notesRepo');
const { formatNoteContent } = require('../formatNote');
const { hasKey } = require('../gemini');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const notes = await listNotes(req.user.id);
    res.json(notes);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'title and content are required.' });
    }
    const note = await createNote(req.user.id, { title: title.trim(), content: content.trim() });
    res.status(201).json(note);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.post('/format', async (req, res, next) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'content is required.' });
    }
    if (!hasKey()) {
      return res.status(503).json({ error: 'Formatting is not configured on the server.' });
    }
    const formatted = await formatNoteContent({ content: content.trim() });
    res.json({ content: formatted });
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { title, content } = req.body;
    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: 'title and content are required.' });
    }
    const note = await updateNote(req.user.id, req.params.id, { title: title.trim(), content: content.trim() });
    res.json(note);
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    await deleteNote(req.user.id, req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

router.delete('/', async (req, res, next) => {
  try {
    await clearNotes(req.user.id);
    res.status(204).send();
  } catch (err) {
    if (err.statusCode) return res.status(err.statusCode).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
