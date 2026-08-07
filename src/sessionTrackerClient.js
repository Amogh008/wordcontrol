// Fire-and-forget client for the dlt-session-tracker service. Backend-only:
// realtime.js calls this from the socket connect/disconnect handlers, the
// frontend never talks to dlt-session-tracker directly.
const BASE_URL = process.env.SESSION_TRACKER_URL || '';
const INTERNAL_API_KEY = process.env.SESSION_TRACKER_INTERNAL_KEY || '';

async function post(path, body) {
  if (!BASE_URL) return; // not configured locally - tracking is just disabled
  try {
    await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_API_KEY,
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    console.warn(`[session-tracker] ${path} failed:`, err.message);
  }
}

function trackConnect({ userId, socketId, languageProfileId, ip, userAgent }) {
  return post('/sessions/connect', { userId, socketId, languageProfileId, ip, userAgent });
}

function trackDisconnect({ userId, socketId, reason }) {
  return post('/sessions/disconnect', { userId, socketId, reason });
}

module.exports = { trackConnect, trackDisconnect };
