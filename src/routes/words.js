const express = require('express');
const Word = require('../models/Word');
const { autofillWord } = require('../autofill');
const { translateText } = require('../translate');
const { checkGrammar } = require('../grammar');
const { generateVocabularyStory, streamVocabularyStory } = require('../story');
const { hasKey } = require('../groq');

const router = express.Router();
const STORY_LEVELS = new Set(['A1', 'A2', 'B1']);

function storyLevel(value) {
  if (!STORY_LEVELS.has(value)) {
    const error = new Error('Choose a valid story level: A1, A2, or B1.');
    error.statusCode = 400;
    throw error;
  }
  return value;
}

async function storyVocabularyForUser(userId, wordIds) {
  if (!Array.isArray(wordIds) || wordIds.length === 0 || wordIds.length > 30) {
    const error = new Error('Choose between 1 and 30 words for a story.');
    error.statusCode = 400;
    throw error;
  }

  const uniqueIds = [...new Set(wordIds.map(String))];
  if (uniqueIds.length !== wordIds.length) {
    const error = new Error('Each story word must be unique.');
    error.statusCode = 400;
    throw error;
  }

  const words = await Word.find({ _id: { $in: uniqueIds }, userId })
    .select('artikel wort bedeutung')
    .lean();
  const byId = new Map(words.map((word) => [String(word._id), word]));
  const vocabulary = uniqueIds.map((id) => byId.get(id)).filter(Boolean);

  if (vocabulary.length !== uniqueIds.length) {
    const error = new Error('One or more selected words are unavailable.');
    error.statusCode = 400;
    throw error;
  }
  if (vocabulary.some((word) => !word.wort || !word.bedeutung)) {
    const error = new Error('Every selected word needs a word and meaning.');
    error.statusCode = 400;
    throw error;
  }
  return vocabulary;
}

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

router.post('/story', async (req, res, next) => {
  try {
    if (!hasKey()) {
      return res.status(503).json({ error: 'Story generation is not configured on the server.' });
    }

    const level = storyLevel(req.body.level);
    const vocabulary = await storyVocabularyForUser(req.user.id, req.body.wordIds);

    const story = await generateVocabularyStory(vocabulary, level);
    res.json(story);
  } catch (err) {
    if (err.statusCode) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    next(err);
  }
});

router.post('/story/stream', async (req, res) => {
  const send = (event) => res.write(`${JSON.stringify(event)}\n`);

  try {
    if (!hasKey()) {
      return res.status(503).json({ error: 'Story generation is not configured on the server.' });
    }

    const level = storyLevel(req.body.level);
    const vocabulary = await storyVocabularyForUser(req.user.id, req.body.wordIds);

    res.status(200);
    res.set({
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();

    const story = await streamVocabularyStory(vocabulary, level, (text) => {
      if (!res.writableEnded) send({ type: 'delta', text });
    });
    if (!res.writableEnded) {
      send({ type: 'done', story });
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      return res.status(err.statusCode || 500).json({
        error: err.statusCode ? err.message : 'Internal server error',
      });
    }
    if (!res.writableEnded) {
      send({ type: 'error', error: err.message || 'Story generation failed.' });
      res.end();
    }
  }
});

router.get('/', async (req, res, next) => {
  try {
    const words = await Word.find({ userId: req.user.id }).sort({ createdAt: -1 });
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
    const word = await Word.create({ userId: req.user.id, artikel, wort, bedeutung, notizen });
    res.status(201).json(word);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { artikel = '', wort, bedeutung, notizen = '' } = req.body;
    if (!wort || !bedeutung) {
      return res.status(400).json({ error: 'wort and bedeutung are required.' });
    }
    const updated = await Word.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { artikel, wort, bedeutung, notizen },
      { new: true, runValidators: true }
    );
    if (!updated) {
      return res.status(404).json({ error: 'Word not found.' });
    }
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await Word.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!deleted) {
      return res.status(404).json({ error: 'Word not found.' });
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;
