// Fire-and-forget client for the dlt-session-tracker service. Backend-only:
// realtime.js calls this from the socket connect/disconnect handlers, the
// frontend never talks to dlt-session-tracker directly.
const BASE_URL = process.env.SESSION_TRACKER_URL || '';
const INTERNAL_API_KEY = process.env.SESSION_TRACKER_INTERNAL_KEY || '';
const TRACKING_ENABLED = process.env.SESSION_TRACKING_ENABLED === 'true';

async function request(method, path, body) {
  if (!BASE_URL) return; // not configured locally - tracking is just disabled
  try {
    await fetch(`${BASE_URL}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Key': INTERNAL_API_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    console.warn(`[session-tracker] ${method} ${path} failed:`, err.message);
  }
}

function post(path, body) {
  if (!TRACKING_ENABLED) return; // tracking disabled via env
  return request('POST', path, body);
}

function trackConnect({ userId, socketId, languageProfileId, ip, userAgent }) {
  return post('/sessions/connect', { userId, socketId, languageProfileId, ip, userAgent });
}

function trackDisconnect({ userId, socketId, reason }) {
  return post('/sessions/disconnect', { userId, socketId, reason });
}

// Right-to-erasure: always attempted on account deletion, regardless of the
// SESSION_TRACKING_ENABLED flag - the flag controls whether new tracking data
// is created, not whether old data (from a time it was enabled) gets purged.
function purgeUser(userId) {
  return request('DELETE', `/sessions/${userId}`);
}

module.exports = { trackConnect, trackDisconnect, purgeUser };
