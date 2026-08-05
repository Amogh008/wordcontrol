const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const { requireAuth } = require('./middleware/auth');
const wordsRouter = require('./routes/words');
const authRouter = require('./routes/auth');
const notesRouter = require('./routes/notes');
const dictionaryRouter = require('./routes/dictionary');
const languageProfilesRouter = require('./routes/languageProfiles');
const { requireLanguageProfile } = require('./middleware/languageProfile');

function createApp() {
  const app = express();

  // Log every incoming request (method, path, status, response time).
  app.use(morgan('dev'));
  app.use(cors());
  app.use(express.json({ limit: '3mb' }));

  app.get('/', (_req, res) => {
    res.json({ status: 'ok' });
  });

  app.get('/pingtest', (req, res) => {
    const message = typeof req.query.message === 'string' ? req.query.message : '';
    console.info('ping request received', { message });
    res.json({ message: 'server active' });
  });

  // Auth endpoints (register/login/google) are public; everything else requires a JWT.
  app.use('/api/auth', authRouter);
  app.use('/api/language-profiles', requireAuth, languageProfilesRouter);

  // Word-related endpoints live under /api/word — future resources (e.g.
  // /api/<other-resource>) get their own router mounted alongside this one.
  app.use('/api/word', requireAuth, requireLanguageProfile, wordsRouter);
  app.use('/api/dictionary', requireAuth, requireLanguageProfile, dictionaryRouter);

  // Notes live in AstraDB (not MongoDB); rows are scoped by the same
  // MongoDB user id used everywhere else so a user only ever sees their own.
  app.use('/api/notes', requireAuth, requireLanguageProfile, notesRouter);

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  app.use((err, _req, res, _next) => {
    console.error(err);
    res.status(err.statusCode || 500).json({
      error: err.statusCode ? err.message : 'Internal server error',
    });
  });

  return app;
}

module.exports = { createApp };
