const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { requireAuth } = require('./middleware/auth');
const wordsRouter = require('./routes/words');
const authRouter = require('./routes/auth');
const notesRouter = require('./routes/notes');

function createApp() {
  const app = express();

  // Log every incoming request (method, path, status, response time).
  app.use(morgan('dev'));
  app.use(cors());
  app.use(express.json());

  app.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/pingtest', (_req, res) => {
    console.log('ping request received');
    res.json({ message: 'server active' });
  });

  // Auth endpoints (register/login/google) are public; everything else requires a JWT.
  app.use('/api/auth', authRouter);

  // Word-related endpoints live under /api/word — future resources (e.g.
  // /api/<other-resource>) get their own router mounted alongside this one.
  app.use('/api/word', requireAuth, wordsRouter);

  // Notes live in AstraDB (not MongoDB); rows are scoped by the same
  // MongoDB user id used everywhere else so a user only ever sees their own.
  app.use('/api/notes', requireAuth, notesRouter);

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
