const express = require('express');
const { hasKey } = require('../groq');
const { searchDictionary, dictionaryEntry } = require('../dictionary');

const router = express.Router();

router.get('/search', (req, res, next) => {
  try {
    const query = String(req.query.q || '').trim();
    if (query.length < 2 || query.length > 80) {
      return res.status(400).json({ error: 'Enter between 2 and 80 characters.' });
    }
    res.json({ words: searchDictionary(query) });
  } catch (error) {
    next(error);
  }
});

router.get('/entry', async (req, res, next) => {
  try {
    if (!hasKey()) {
      return res.status(503).json({ error: 'Dictionary details are not configured on the server.' });
    }
    const word = String(req.query.word || '').trim();
    if (!word || word.length > 100) {
      return res.status(400).json({ error: 'Choose a valid dictionary word.' });
    }
    res.json(await dictionaryEntry(word));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

module.exports = router;
