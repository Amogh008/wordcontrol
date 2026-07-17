const express = require('express');
const Word = require('../models/Word');
const { autofillWord } = require('../autofill');

const router = express.Router();

router.post('/autofill', async (req, res, next) => {
  try {
    const { wort, artikel = '' } = req.body;
    if (!wort || !wort.trim()) {
      return res.status(400).json({ error: 'wort is required.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(503).json({ error: 'Autofill is not configured on the server.' });
    }
    const suggestion = await autofillWord({ wort: wort.trim(), artikel });
    res.json(suggestion);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.get('/', async (_req, res, next) => {
  try {
    const words = await Word.find().sort({ createdAt: -1 });
    res.json(words);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { artikel = '', wort, bedeutung, notizen = '' } = req.body;
    if (!wort || !bedeutung) {
      return res.status(400).json({ error: 'wort and bedeutung are required.' });
    }
    const word = await Word.create({ artikel, wort, bedeutung, notizen });
    res.status(201).json(word);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Word.findByIdAndDelete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Word not found.' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
