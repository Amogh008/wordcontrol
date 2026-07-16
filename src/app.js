const express = require('express');
const cors = require('cors');
const { requireApiKey } = require('./middleware/auth');
const wordsRouter = require('./routes/words');

function createApp() {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/pingtest', (_req, res) => {
    console.log('ping request received');
    res.json({ message: 'server active' });
  });

  // Word-related endpoints live under /api/word — future resources (e.g.
  // /api/<other-resource>) get their own router mounted alongside this one.
  app.use('/api/word', requireApiKey, wordsRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  });

  return app;
}

module.exports = { createApp };
