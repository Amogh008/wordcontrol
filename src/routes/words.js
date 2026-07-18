const express = require('express');
const Word = require('../models/Word');
const { autofillWord } = require('../autofill');
const { translateText } = require('../translate');
const { checkGrammar } = require('../grammar');
const { hasKey } = require('../gemini');

const router = express.Router();

router.post('/grammar', async (req, res, next) => {
  try {
    const { sentence } = req.body;
    if (!sentence || !sentence.trim()) {
      return res.status(400).json({ error: 'sentence is required.' });
    }
    if (!hasKey()) {
      return res.status(503).json({ error: 'Grammar check is not configured on the server.' });
    }
    const result = await checkGrammar({ sentence: sentence.trim() });
    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/translate', async (req, res, next) => {
  try {
    const { text, from = 'de', to = 'en' } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ error: 'text is required.' });
    }
    if (!hasKey()) {
      return res.status(503).json({ error: 'Translation is not configured on the server.' });
    }
    const result = await translateText({ text: text.trim(), from, to });
    res.json(result);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/autofill', async (req, res, next) => {
  try {
    const { wort, artikel = '' } = req.body;
    if (!wort || !wort.trim()) {
      return res.status(400).json({ error: 'wort is required.' });
    }
    if (!hasKey()) {
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
