const DEFAULT_INTERVAL_MS = 9 * 60 * 1000; // 9 minutes

// Pings `${targetUrl}/pingtest` on a timer to keep a companion service awake.
// Any failure (network error, non-2xx, timeout) is intentionally swallowed —
// a missed ping is not worth crashing or logging noisily over.
function startKeepAlive(targetUrl, intervalMs = DEFAULT_INTERVAL_MS) {
  if (!targetUrl) {
    console.log('[keep-alive] no target URL configured; skipping keep-alive pings');
    return null;
  }

  const pingUrl = `${targetUrl.replace(/\/+$/, '')}/pingtest`;

  const ping = async () => {
    try {
      const res = await fetch(pingUrl, { signal: AbortSignal.timeout(15000) });
      console.log(`[keep-alive] pinged ${pingUrl} -> ${res.status}`);
    } catch {
      // Ignore errors on purpose: the other service may be down, restarting,
      // or slow to wake. We simply try again on the next interval.
    }
  };

  const timer = setInterval(ping, intervalMs);
  ping(); // fire once on startup as well

  return timer;
}

module.exports = { startKeepAlive };
