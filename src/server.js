require('dotenv').config({ path: process.env.ENV_FILE || '.env' });
const http = require('http');
const { createApp } = require('./app');
const { connectDB } = require('./db');
const { connectAstra } = require('./astra');
const { startKeepAlive } = require('./keepAlive');
const { attachRealtimeServer } = require('./realtime');

const PORT = process.env.PORT || 4000;

async function main() {
  await connectDB(process.env.MONGODB_URI);

  // Notes (AstraDB) is treated as optional at startup so a missing bundle
  // doesn't take down the whole API — /api/notes just returns 503 until it's set up.
  try {
    await connectAstra();
    console.log('Connected to AstraDB (notes).');
  } catch (err) {
    console.warn('AstraDB not connected, /api/notes is disabled:', err.message);
  }

  const app = createApp();
  const server = http.createServer(app);
  attachRealtimeServer(server);
  server.listen(PORT, () => {
    console.log(`wordcontrol-api listening on port ${PORT}`);
  });

  // Keep the pinger-api awake by pinging it every 30 seconds.
  startKeepAlive(process.env.PINGER_URL);
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
