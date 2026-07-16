function requireApiKey(req, res, next) {
  const expected = process.env.API_KEY;
  if (!expected) return next();

  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token !== expected) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

module.exports = { requireApiKey };
