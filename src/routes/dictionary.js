const express = require('express');
const { hasKey } = require('../groq');
const { dictionaryEntry } = require('../dictionary');
const { languageFor } = require('../languages');

const router = express.Router();

router.get('/entry', async (req, res, next) => {
  try {
    if (!hasKey()) {
      return res.status(503).json({ error: 'Dictionary details are not configured on the server.' });
    }
    const word = String(req.query.word || '').trim();
    if (!word || word.length > 100) {
      return res.status(400).json({ error: 'Enter a valid dictionary word.' });
    }
    const interfaceLanguage = languageFor(String(req.query.interfaceLanguage || 'en'))?.code || 'en';
    res.json(await dictionaryEntry(word, req.languageProfile.language, interfaceLanguage));
  } catch (error) {
    if (error.statusCode) return res.status(error.statusCode).json({ error: error.message });
    next(error);
  }
});

module.exports = router;
