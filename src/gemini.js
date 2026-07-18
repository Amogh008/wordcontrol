const { GoogleGenAI } = require('@google/genai');

// Collect every configured Gemini API key. Supports a comma-separated
// GEMINI_API_KEYS and/or numbered vars (GEMINI_API_KEY, GEMINI_API_KEY_2,
// GEMINI_API_KEY_3). Duplicates and blanks are dropped, order is preserved.
function loadKeys() {
  const keys = [];
  const add = (value) => {
    if (!value) return;
    for (const part of String(value).split(',')) {
      const key = part.trim();
      if (key && !keys.includes(key)) keys.push(key);
    }
  };
  add(process.env.GEMINI_API_KEYS);
  add(process.env.GEMINI_API_KEY);
  add(process.env.GEMINI_API_KEY_2);
  add(process.env.GEMINI_API_KEY_3);
  return keys;
}

const KEYS = loadKeys();

// One reused client per key, built lazily.
const clients = new Map();
function clientFor(key) {
  if (!clients.has(key)) clients.set(key, new GoogleGenAI({ apiKey: key }));
  return clients.get(key);
}

// True when at least one key is configured.
function hasKey() {
  return KEYS.length > 0;
}

// Errors that mean "this key can't serve the request right now" — quota
// exhausted (429), invalid/expired key (401/403), or a Google-side outage
// (5xx). Those are worth retrying on the next key. A real client error such as
// 400 is our fault and would fail on every key, so it propagates immediately.
function shouldFailover(status) {
  return status === 429 || status === 401 || status === 403 || (status >= 500 && status < 600);
}

// Round-robin cursor so load is spread across keys instead of always hammering
// the first one — this multiplies the effective request quota.
let cursor = 0;

// Drop-in for client.models.generateContent that transparently fails over
// across all configured keys. Throws the last error only after every key has
// been tried (or immediately on a non-failover error).
async function generateContent(params) {
  if (KEYS.length === 0) {
    const err = new Error('No Gemini API key is configured on the server.');
    err.statusCode = 503;
    throw err;
  }

  const start = cursor;
  let lastErr;
  for (let i = 0; i < KEYS.length; i++) {
    const key = KEYS[(start + i) % KEYS.length];
    try {
      const result = await clientFor(key).models.generateContent(params);
      cursor = (start + i + 1) % KEYS.length; // next request starts on the following key
      return result;
    } catch (err) {
      lastErr = err;
      if (!shouldFailover(Number(err?.status))) throw err;
      // otherwise: this key is exhausted/unavailable — try the next one
    }
  }
  throw lastErr; // every key is exhausted or unavailable
}

module.exports = { generateContent, hasKey, keyCount: () => KEYS.length };
